import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';

/** Conta com troca de senha obrigatória pendente (técnico recém-criado ou reset administrativo)
 *  nunca chega às rotas normais do portal — o backend já bloqueia a API inteira (ver
 *  JwtAuthenticationFilter), isto só evita o ecrã em branco de pedidos todos a 403. */
export const mustChangePasswordGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.currentUser()?.mustChangePassword) return true;

  return router.createUrlTree(['/auth/change-initial-password']);
};
