import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { TooltipModule } from 'primeng/tooltip';
import { Order } from '../../../core/services/order.service';
import { TenantDirectoryEntry } from '../../../core/services/tenant-user.service';
import { LocalizedDatePipe } from '../../../shared/pipes/localized-date.pipe';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { TagBadgeComponent } from '../../../shared/components/tag-badge/tag-badge.component';

@Component({
  selector: 'app-order-history-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, LocalizedDatePipe, TranslatePipe, EmptyStateComponent, TagBadgeComponent, TooltipModule],
  template: `
    <div class="py-4">
      @if (order().transitions.length === 0) {
        <app-empty-state icon="pi pi-history" [message]="'orders.emptyHistory' | translate"></app-empty-state>
      } @else {
        <ul class="space-y-3">
          @for (t of order().transitions; track t.id) {
            <li class="text-sm border-l-2 border-app-border pl-3">
              <span class="font-medium text-app-text">
                {{ ('orders.status.' + t.fromStatus) | translate }} → {{ ('orders.status.' + t.toStatus) | translate }}
              </span>
              @if (t.performedBy) {
                <span class="text-app-text-secondary text-xs ml-2">{{ 'orders.transitionBy' | translate: { user: performedName(t.performedBy) } }}</span>
              }
              <span class="text-app-text-tertiary text-xs ml-2">{{ t.occurredAt | localizedDate:'datetime':tenantTimezone() }}</span>
              @if (t.automatic) {
                <app-tag-badge [value]="'orders.automaticTransition' | translate" severity="secondary" class="ml-2"
                               [pTooltip]="'orders.automaticTransitionHint' | translate" tooltipPosition="top"></app-tag-badge>
              }
              @if (t.note) {
                <div class="text-app-text-secondary text-xs italic mt-0.5">{{ t.note }}</div>
              }
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class OrderHistoryTabComponent {
  order = input.required<Order>();
  tenantTimezone = input<string | null>(null);
  technicians = input<TenantDirectoryEntry[]>([]);

  /** Resolve o autor da transição para nome de utilizador — mesmo fallback de abreviação de id
   *  usado no quadro (autor que já saiu da empresa aparece só como ""#xxxxxxxx""). */
  performedName(userId: string): string {
    return this.technicians().find(u => u.id === userId)?.name ?? '#' + userId.slice(0, 8);
  }
}
