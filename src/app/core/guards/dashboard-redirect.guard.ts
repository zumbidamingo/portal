import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, Observable, of } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { TenantService } from '../services/tenant.service';

/**
 * `/dashboard` é o destino por omissão de {@code roleGuard} quando uma rota recusa acesso — só
 * faz sentido existir se souber para onde mandar cada perfil (issue #118). Nunca renderiza nada:
 * resolve sempre para a dashboard certa da role autenticada, ou para `/profile` quando a role não
 * tem uma (TECHNICIAN/LAUNDRY trabalham no app de campo, não no portal).
 *
 * O dono com o onboarding por fazer (ou interrompido a meio) é conduzido a `/onboarding` (issue
 * #136). Quem o dispensou cai na dashboard e retoma pelo convite lá — nunca é preso ao onboarding.
 */
export const dashboardRedirectGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const tenantService = inject(TenantService);

  const target: Record<string, string> = {
    OWNER: '/dashboard/owner',
    ADMIN: '/dashboard/owner',
    COMMERCIAL: '/dashboard/commercial',
    OPERATOR: '/dashboard/operator',
    FINANCE: '/dashboard/finance',
  };

  const role = auth.userRole();
  // O operador de lavanderia só tem a tela de lavanderia: sem o fluxo em uso não há para onde o
  // mandar além do perfil (o `laundryEnabledGuard` usa o mesmo destino, sem ciclo).
  if (role === 'LAUNDRY') {
    const toLaundry = (active: boolean | undefined) =>
      router.createUrlTree([active === false ? '/profile' : '/laundry']);
    const cachedTenant = tenantService.current();
    return cachedTenant
      ? toLaundry(cachedTenant.laundry?.active)
      : tenantService.getMe().pipe(map(t => toLaundry(t.laundry?.active)),
          catchError(() => of(toLaundry(undefined))));
  }
  const home = router.createUrlTree([role && target[role] ? target[role] : '/profile']);
  if (role !== 'OWNER') return home;

  const decide = (status: string | undefined) =>
    status === 'PENDING' || status === 'IN_PROGRESS' ? router.createUrlTree(['/onboarding']) : home;

  const cached = tenantService.current();
  const tenant$: Observable<string | undefined> = cached
    ? of(cached.onboarding?.status)
    : tenantService.getMe().pipe(map(t => t.onboarding?.status));
  return tenant$.pipe(map(decide), catchError(() => of(home)));
};
