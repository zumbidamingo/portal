import { Injectable, computed, inject } from '@angular/core';
import { TenantService } from './tenant.service';

/**
 * Única leitura, no portal, de "a lavanderia está em uso?". Duas camadas que nunca se confundem:
 * `availableInPlan` (o plano inclui o módulo) e `enabled` (a empresa escolheu usá-lo); só quando as
 * duas são verdadeiras `active` liga menus, etapas, filtros e telas. Vem do backend
 * (`/tenants/me` → `laundry`), que aplica a mesma regra às regras de negócio — o portal não a recalcula.
 *
 * Enquanto a empresa não carregou, `active` é verdadeiro: esconder o menu num flash e reaparecer
 * seria pior do que mostrá-lo um instante a quem o desligou.
 */
@Injectable({ providedIn: 'root' })
export class LaundryFeatureService {
  private tenantService = inject(TenantService);

  private readonly laundry = computed(() => this.tenantService.current()?.laundry ?? null);

  readonly active = computed(() => this.laundry()?.active ?? true);
  readonly availableInPlan = computed(() => this.laundry()?.availableInPlan ?? true);
  readonly enabled = computed(() => this.laundry()?.enabled ?? true);

  /** Garante a empresa carregada — o menu lateral precisa dela antes de qualquer tela a pedir. */
  ensureLoaded(): void {
    if (!this.tenantService.current()) {
      this.tenantService.getMe().subscribe({ error: () => undefined });
    }
  }
}
