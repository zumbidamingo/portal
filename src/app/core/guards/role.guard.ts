import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { UserRole } from '../models/user.model';

export const roleGuard = (allowedRoles: UserRole | UserRole[], fallback = '/dashboard'): CanActivateFn => {
  return (route: ActivatedRouteSnapshot) => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (!auth.isAuthenticated()) {
      return router.createUrlTree(['/auth/login']);
    }

    const userRole = auth.userRole();
    const allowed = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

    if (userRole && allowed.includes(userRole)) {
      return true;
    }

    return router.createUrlTree([fallback]);
  };
};
