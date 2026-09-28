import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { TenantService } from '../services/tenant.service';

/**
 * Fecha as telas de lavanderia quando a empresa não usa o fluxo (plano sem o módulo ou desligado
 * em Parâmetros do Sistema). Vem depois do `roleGuard`: este decide *quem*, este decide *se existe*.
 * O operador de lavanderia não tem outra tela, então cai no perfil em vez de `/dashboard` — que o
 * mandaria de volta para `/laundry` num ciclo.
 */
export const laundryEnabledGuard: CanActivateFn = () => {
  const router = inject(Router);
  const auth = inject(AuthService);
  const tenantService = inject(TenantService);

  const fallback = router.createUrlTree([auth.userRole() === 'LAUNDRY' ? '/profile' : '/dashboard']);
  const decide = (active: boolean | undefined) => (active === false ? fallback : true);

  const cached = tenantService.current();
  return cached
    ? decide(cached.laundry?.active)
    : tenantService.getMe().pipe(map(t => decide(t.laundry?.active)), catchError(() => of(true)));
};
