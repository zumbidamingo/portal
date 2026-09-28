import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { TenantService } from '../services/tenant.service';

/**
 * Guarda única para "a empresa deste utilizador existe mesmo".
 *
 * O login social cria a linha em `users` (e uma sessão válida) antes de existir o tenant,
 * portanto isAuthenticated()/emailVerified() não chegam. Um erro na leitura (404 = ainda
 * não há empresa) conta como incompleto, nunca como passe livre.
 */
export const profileCompleteGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const tenantService = inject(TenantService);
  const router = inject(Router);

  const role = auth.userRole();
  const completeRegistration = () => router.createUrlTree(['/auth/register']);

  if (role === 'OWNER') {
    const cached = tenantService.profileComplete();
    if (cached === true) return true;

    return tenantService.getMe().pipe(
      map(() => {
        tenantService.markProfileComplete(true);
        return true as const;
      }),
      catchError(() => of(completeRegistration()))
    );
  }

  return true;
};
