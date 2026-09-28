import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { EMPTY, Observable, catchError, finalize, shareReplay, switchMap, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { AuthTokens } from '../models/user.model';
import { PaywallService, PlanLimitType } from '../services/paywall.service';
import { MessageService } from 'primeng/api';
import { TranslateService } from '@ngx-translate/core';
import { SessionExpiredService } from '../services/session-expired.service';

interface ApiError {
  title?: string;
  detail?: string;
  errorCode?: string;
  fieldErrors?: Record<string, string>;
  limitType?: PlanLimitType;
  currentPlan?: string;
  limit?: number;
  used?: number;
}

function showApiError(
  messageService: MessageService,
  translate: TranslateService,
  paywallService: PaywallService,
  router: Router,
  error: HttpErrorResponse
): void {
  const body = error.error as ApiError | null;

  // Sinal manda direto pro ecrã de troca de senha — cobre o caso raro de um admin resetar a
  // senha de alguém enquanto essa pessoa já está com a sessão aberta noutra aba.
  if (error.status === 403 && body?.errorCode === 'PASSWORD_CHANGE_REQUIRED') {
    router.navigate(['/auth/change-initial-password']);
    return;
  }

  if (error.status === 403 && body?.errorCode === 'PLAN_LIMIT_EXCEEDED' && body.limitType) {
    paywallService.show({
      limitType: body.limitType,
      currentPlan: body.currentPlan ?? 'FREE',
      limit: body.limit ?? 0,
      used: body.used ?? 0,
    });
    return;
  }

  if (error.status === 400 && body?.fieldErrors) {
    const lines = Object.entries(body.fieldErrors)
      .map(([field, msg]) => `• ${field}: ${msg}`)
      .join('\n');
    messageService.add({
      severity: 'error',
      summary: body.detail ?? translate.instant('errors.validationError'),
      detail: lines,
      life: 7000,
    });
    return;
  }

  if (error.status === 400) {
    messageService.add({
      severity: 'error',
      summary: body?.detail ?? translate.instant('errors.badRequest'),
      life: 5000,
    });
    return;
  }

  if (error.status === 401 || error.status === 403) {
    messageService.add({ severity: 'error', summary: translate.instant('errors.forbidden') });
    return;
  }

  // Issue #233/G3: dois utilizadores a editar o mesmo registo — otimistic lock do backend
  // (GlobalExceptionHandler#handleOptimisticLock). Aviso genérico: quem editava recarrega e
  // tenta de novo, nunca um 500 silencioso nem a escrita mais recente a desaparecer.
  if (error.status === 409) {
    messageService.add({
      severity: 'warn',
      summary: translate.instant('errors.conflict'),
      detail: translate.instant('errors.conflictDetail'),
      life: 6000,
    });
    return;
  }

  if (error.status === 500) {
    messageService.add({ severity: 'error', summary: translate.instant('errors.serverError') });
  }
}

// Uma só renovação em voo: pedidos paralelos que recebem 401 partilham o mesmo refresh. Com rotação
// de refresh token, o segundo refresh falharia e derrubaria uma sessão que o primeiro acabou de salvar.
let refreshInFlight$: Observable<AuthTokens> | null = null;

function sharedRefresh(auth: AuthService): Observable<AuthTokens> {
  if (!refreshInFlight$) {
    refreshInFlight$ = auth.refreshToken().pipe(
      finalize(() => (refreshInFlight$ = null)),
      shareReplay({ bufferSize: 1, refCount: false })
    );
  }
  return refreshInFlight$;
}

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const messageService = inject(MessageService);
  const translate = inject(TranslateService);
  const paywallService = inject(PaywallService);
  const router = inject(Router);
  const sessionExpired = inject(SessionExpiredService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      // Com o diálogo de sessão expirada aberto, nada mais é mostrado nem propagado: o utilizador
      // só tem uma saída (entrar de novo) e cada erro extra seria mais um toast por cima.
      if (sessionExpired.isActive()) {
        return EMPTY;
      }

      if (error.status === 401 && req.url.includes('/auth/refresh')) {
        return throwError(() => error);
      }

      if (error.status === 401 && !req.url.includes('/auth/')) {
        return sharedRefresh(auth).pipe(
          switchMap(tokens => {
            const retried = req.clone({
              setHeaders: { Authorization: `Bearer ${tokens.accessToken}` }
            });
            return next(retried);
          }),
          catchError(() => {
            sessionExpired.show();
            return EMPTY;
          })
        );
      }

      showApiError(messageService, translate, paywallService, router, error);
      return throwError(() => error);
    })
  );
};
