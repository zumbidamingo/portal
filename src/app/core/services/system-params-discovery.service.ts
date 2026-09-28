import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { TenantService } from './tenant.service';

interface DiscoveryState {
  visited: boolean;
  hintDismissed: boolean;
}

/**
 * Descoberta dos Parâmetros do Sistema. Os parâmetros têm sempre um padrão utilizável, por isso
 * não são um passo de ativação (não há estado real para derivar "feito"): são um convite opcional,
 * mostrado até o dono abrir a tela uma vez ou dispensar a dica. Preferência deste navegador por
 * empresa — não bloqueia nada. A tela é só do dono (`route-access.ts`), então só ele vê o convite.
 */
@Injectable({ providedIn: 'root' })
export class SystemParamsDiscoveryService {
  private auth = inject(AuthService);
  private tenantService = inject(TenantService);

  private version = signal(0);

  private state = computed<DiscoveryState>(() => {
    this.version();
    const id = this.tenantService.current()?.id;
    if (!id) return { visited: false, hintDismissed: false };
    try {
      const raw = localStorage.getItem(this.storageKey(id));
      return raw ? { visited: false, hintDismissed: false, ...JSON.parse(raw) } : { visited: false, hintDismissed: false };
    } catch {
      return { visited: false, hintDismissed: false };
    }
  });

  private isOwner = computed(() => this.auth.userRole() === 'OWNER');

  /** Convite dentro do checklist de ativação: some assim que o dono abre a tela. */
  readonly showChecklistInvite = computed(() => this.isOwner() && !this.state().visited);

  /** Dica no ponto de uso (orçamento): some ao abrir a tela ou ao dispensar. */
  readonly showQuotationHint = computed(() =>
    this.isOwner() && !this.state().visited && !this.state().hintDismissed);

  markVisited(): void {
    this.write({ visited: true });
  }

  dismissHint(): void {
    this.write({ hintDismissed: true });
  }

  private write(patch: Partial<DiscoveryState>): void {
    const id = this.tenantService.current()?.id;
    if (!id) return;
    try {
      localStorage.setItem(this.storageKey(id), JSON.stringify({ ...this.state(), ...patch }));
    } catch {
      // sem armazenamento: o convite volta na próxima visita
    }
    this.version.update(v => v + 1);
  }

  private storageKey(tenantId: string): string {
    return `system-params-discovery:${tenantId}`;
  }
}
