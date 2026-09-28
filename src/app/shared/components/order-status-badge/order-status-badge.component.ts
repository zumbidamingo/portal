import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { OrderStatus } from '../../../core/services/order.service';
import { ORDER_STATUS_HUE } from '../../utils/order-status.utils';

/**
 * Badge de estado de Order com matiz próprio por estado (ver order-status.utils.ts) — substitui
 * `app-tag-badge severity="secondary"`, que rendia todos os 11 estados na mesma cor cinza.
 * Rótulo entra já traduzido pelo chamador, mesmo padrão de {@link TagBadgeComponent}: o
 * componente só decide a cor, nunca o texto.
 *
 * Uso: <app-order-status-badge [status]="o.status" [label]="('orders.status.' + o.status) | translate" />
 */
@Component({
  selector: 'app-order-status-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="order-status-badge" [style.background-color]="bg()" [style.color]="fg()">{{ label() }}</span>
  `,
  styles: [`
    .order-status-badge {
      display: inline-flex;
      align-items: center;
      font-size: 0.75rem;
      line-height: 1rem;
      padding: 0.375rem 0.625rem;
      border-radius: 9999px;
      font-weight: 600;
      white-space: nowrap;
    }
  `],
})
export class OrderStatusBadgeComponent {
  status = input.required<OrderStatus>();
  label = input.required<string>();

  private hue = computed(() => ORDER_STATUS_HUE[this.status()]);
  bg = computed(() => `var(--status-${this.hue()}-bg)`);
  fg = computed(() => `var(--status-${this.hue()}-fg)`);
}
