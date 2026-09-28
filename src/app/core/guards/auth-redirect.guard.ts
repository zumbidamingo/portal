import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';

/**
 * Guards `/auth/login` only. An already-authenticated hit is never valid there — send it
 * straight to the portal root as a UrlTree, before LoginComponent ever mounts, so there's no
 * login-form flash.
 */
export const authRedirectGuard = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) return true;

  return router.createUrlTree(['/']);
};
