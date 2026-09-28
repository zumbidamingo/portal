import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { TokenService } from '../auth/token.service';
import { catchError, map, of, switchMap } from 'rxjs';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const tokenService = inject(TokenService);
  const router = inject(Router);

  if (auth.isAuthenticated()) return true;

  if (!tokenService.hasSessionHint()) {
    return router.createUrlTree(['/auth/login']);
  }

  return auth.refreshToken().pipe(
    switchMap(() => auth.getCurrentUser()),
    map(() => true as const),
    catchError(() => {
      tokenService.clearTokens();
      return of(router.createUrlTree(['/auth/login']));
    })
  );
};
