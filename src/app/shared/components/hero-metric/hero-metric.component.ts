import { CommonModule, CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { SkeletonModule } from 'primeng/skeleton';
import { KpiMoneyValue } from '../kpi-card/kpi-card.component';

export type { KpiMoneyValue };

/**
 * Métrica principal em destaque, usada no topo da visão OWNER/ADMIN (issue #119) — faturamento
 * previsto vs. realizado. Compara com um segundo {@link KpiMoneyValue} opcional (período
 * anterior); sem ele, mostra só a métrica principal.
 */
@Component({
  selector: 'app-hero-metric',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslatePipe, SkeletonModule, CurrencyPipe],
  // Custom elements default to `display: inline`, which silently drops the `space-y-*`
  // margin-top the parent applies to this host tag (margin has no effect on inline boxes).
  styles: ':host { display: block; }',
  template: `
    <div class="bg-app-bg border border-app-border rounded-xl p-6 flex flex-col gap-2">
      <div class="flex items-center gap-2 text-app-text-secondary text-sm">
        <i [class]="'pi ' + icon()" aria-hidden="true"></i>
        <span>{{ label() }}</span>
      </div>

      @if (loading()) {
        <p-skeleton height="2.5rem" width="60%"></p-skeleton>
      } @else if (money() === null) {
        <p class="text-sm text-app-text-tertiary">{{ 'dashboard.kpi.noData' | translate }}</p>
      } @else {
        <p class="text-3xl font-medium text-app-text">
          {{ money()!.amount | currency:money()!.currency }}
        </p>
        @if (comparisonMoney(); as c) {
          <p class="text-sm text-app-text-secondary">
            {{ comparisonLabel() }}: <span class="font-medium text-app-text">{{ c.amount | currency:c.currency }}</span>
          </p>
        }
      }
    </div>
  `,
})
export class HeroMetricComponent {
  label = input.required<string>();
  icon = input<string>('pi pi-chart-line');
  money = input<KpiMoneyValue | null>(null);
  comparisonMoney = input<KpiMoneyValue | null>(null);
  comparisonLabel = input<string>('');
  loading = input(false);
}
