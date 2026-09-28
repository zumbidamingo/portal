import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap, switchMap, map, catchError } from 'rxjs/operators';
import { Observable, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TokenService } from './token.service';
import { LocaleService } from '../services/locale.service';
import { ThemeMode, ThemeService } from '../services/theme.service';
import { TenantService } from '../services/tenant.service';
import {
  User, AuthTokens, LoginRequest,
  RegisterRequest, TenantCreateRequest
} from '../models/user.model';

export type SocialProvider = 'google' | 'facebook';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private tokenService = inject(TokenService);
  private langService = inject(LocaleService);
  private themeService = inject(ThemeService);
  private tenantService = inject(TenantService);

  private readonly API = environment.apiUrl;

  currentUser = signal<User | null>(null);
  isAuthenticated = computed(() => !!this.currentUser());
  userRole = computed(() => this.currentUser()?.role ?? null);
  isEmailVerified = computed(() => this.currentUser()?.emailVerified ?? false);
  avatarBlobUrl = signal<string | null>(null);

  loadAvatar(): void {
    if (!this.currentUser()?.avatarUrl) {
      this.avatarBlobUrl.set(null);
      return;
    }
    this.http.get(`${this.API}/files/avatar`, { responseType: 'blob' }).subscribe({
      next: blob => {
        const prev = this.avatarBlobUrl();
        if (prev) URL.revokeObjectURL(prev);
        this.avatarBlobUrl.set(URL.createObjectURL(blob));
      },
      error: () => this.avatarBlobUrl.set(null)
    });
  }

  login(req: LoginRequest): Observable<User> {
    return this.http.post<AuthTokens>(`${this.API}/auth/login`, req).pipe(
      tap(res => this.handleAuthSuccess(res)),
      switchMap(() => this.getCurrentUser())
    );
  }

  socialLoginNoRole(provider: SocialProvider, idToken: string): Observable<{ isNewUser: boolean } | null> {
    return this.http.post<AuthTokens>(`${this.API}/auth/oauth2/${provider}`, { idToken }).pipe(
      tap(res => {
        this.handleAuthSuccess(res);
      }),
      switchMap(() => this.getCurrentUser()),
      map(() => ({ isNewUser: false } as const)),
      catchError(err => {
        if (err?.error?.errorCode === `${provider.toUpperCase()}_USER_NOT_FOUND`) {
          return of(null);
        }
        throw err;
      })
    );
  }

  socialLogin(provider: SocialProvider, idToken: string, role: string): Observable<{ isNewUser: boolean }> {
    let isNewUser = false;
    return this.http.post<AuthTokens>(`${this.API}/auth/oauth2/${provider}`, { idToken, role }).pipe(
      tap(res => {
        this.handleAuthSuccess(res);
        isNewUser = res.isNewUser;
      }),
      switchMap(() => this.getCurrentUser()),
      map(() => ({ isNewUser }))
    );
  }

  registerTenant(authData: { email: string; password: string }, profile: TenantCreateRequest): Observable<User> {
    const registerReq: RegisterRequest = { email: authData.email, password: authData.password };
    return this.http.post<AuthTokens>(`${this.API}/auth/register`, registerReq).pipe(
      tap(res => this.handleAuthSuccess(res)),
      switchMap(() => this.http.post(`${this.API}/tenants`, profile)),
      switchMap(() => this.getCurrentUser())
    );
  }


  refreshToken(): Observable<AuthTokens> {
    // Normalmente o token segue no cookie; o corpo só leva o token da versão antiga, uma única vez.
    const legacy = this.tokenService.legacyRefreshToken();
    return this.http.post<AuthTokens>(`${this.API}/auth/refresh`, legacy ? { refreshToken: legacy } : {}).pipe(
      tap(tokens => this.handleAuthSuccess(tokens))
    );
  }

  updateProfile(data: { firstName: string; lastName?: string; email: string; avatarUrl?: string; locale?: string }): Observable<User> {
    return this.http.put<User>(`${this.API}/auth/me`, data).pipe(
      tap(user => this.currentUser.set(user))
    );
  }

  getCurrentUser(): Observable<User> {
    return this.http.get<User>(`${this.API}/auth/me`).pipe(
      tap(user => {
        this.currentUser.set(user);
        if (user.locale) this.langService.setLocale(user.locale);
        this.themeService.restore(user.themePreference);
        this.loadAvatar();
      })
    );
  }

  /** Aplica localmente já (sem esperar a rede) e grava no servidor; falha de rede não desfaz o tema. */
  saveThemePreference(mode: ThemeMode): void {
    this.themeService.setMode(mode);
    if (!this.isAuthenticated()) return;
    this.http.put<User>(`${this.API}/auth/me/theme`, { themePreference: mode }).subscribe({
      next: user => this.currentUser.set(user),
      error: () => {}
    });
  }

  forgotPassword(email: string): Observable<void> {
    return this.http.post<void>(`${this.API}/auth/forgot-password`, { email });
  }

  validateResetToken(token: string): Observable<{ status: string }> {
    return this.http.get<{ status: string }>(`${this.API}/auth/reset-password/validate`, { params: { token } });
  }

  resetPassword(token: string, newPassword: string): Observable<void> {
    return this.http.post<void>(`${this.API}/auth/reset-password`, { token, newPassword });
  }

  /** Conta com troca de senha obrigatória (técnico recém-criado ou reset administrativo) — sem
   *  senha atual: o login com a senha padrão já provou que o utilizador a conhece. */
  changeInitialPassword(newPassword: string): Observable<void> {
    return this.http.post<void>(`${this.API}/auth/change-initial-password`, { newPassword }).pipe(
      switchMap(() => this.getCurrentUser()),
      map(() => undefined)
    );
  }

  resendVerificationEmail(): Observable<void> {
    return this.http.post<void>(`${this.API}/auth/resend-verification`, {});
  }

  verifyEmail(token: string): Observable<void> {
    return this.http.get<void>(`${this.API}/auth/verify-email`, { params: { token } });
  }

  logout(): void {
    // O cookie HttpOnly viaja sozinho; o backend revoga o token e apaga o cookie.
    this.http.post<void>(`${this.API}/auth/logout`, {}).subscribe({ error: () => {} });
    this.endSessionLocally();
    this.router.navigate(['/auth/login']);
  }

  /** Esquece a sessão neste dispositivo sem navegar — para quem decide sozinho o destino a seguir
   *  (ex.: página de despedida depois de confirmar a exclusão da conta). */
  endSessionLocally(): void {
    this.tokenService.clearTokens();
    this.currentUser.set(null);
    const prev = this.avatarBlobUrl();
    if (prev) URL.revokeObjectURL(prev);
    this.avatarBlobUrl.set(null);
  }

  private handleAuthSuccess(tokens: AuthTokens): void {
    this.tokenService.setAccessToken(tokens.accessToken);
    this.tokenService.markSession();
    this.tenantService.resetProfileState();
  }
}
