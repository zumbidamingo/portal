import { CommonModule, CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { SkeletonModule } from 'primeng/skeleton';

/** Forma `{amount, currency}` que o backend devolve (`MoneyResponse`) — nunca formatado por lá. */
export interface KpiMoneyValue {
  amount: number;
  currency: string;
}

/**
 * Cartão de KPI partilhado pelas 5 dashboards segmentadas por perfil (issue #118). Formata
 * dinheiro com `CurrencyPipe` no próprio componente, com o locale ativo do portal (`LOCALE_ID`
 * já resolvido globalmente) — nunca recebe um valor pré-formatado.
 *
 * `null` em {@link money} e {@link plainValue} significa "sem dado ainda", distinto de um `0`
 * real — nunca inventa um zero (CLAUDE.md §17.6).
 */
@Component({
  selector: 'app-kpi-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full' },
  imports: [CommonModule, TranslatePipe, SkeletonModule, CurrencyPipe],
  template: `
    <div class="dashboard-kpi h-full flex flex-col gap-2 min-w-0">
      <div class="flex items-center gap-2 text-app-text-tertiary text-xs">
        <i [class]="'pi ' + icon()" aria-hidden="true"></i>
        <span class="truncate">{{ label() }}</span>
      </div>

      @if (loading()) {
        <p-skeleton height="2rem" width="70%"></p-skeleton>
      } @else if (!hasData()) {
        <p class="text-[28px] leading-8 font-medium text-app-text-disabled" aria-hidden="true">—</p>
        <span class="text-xs text-app-text-tertiary">{{ 'dashboard.kpi.noData' | translate }}</span>
      } @else {
        <p class="text-[28px] leading-8 font-medium truncate" [class]="isZero() ? 'text-app-text-tertiary' : 'text-app-text'">
          @if (money(); as m) {
            {{ m.amount | currency:m.currency }}
          } @else {
            {{ plainValue() }}
          }
        </p>
        @if (hint()) {
          <span class="text-xs text-app-text-secondary">{{ hint() }}</span>
        }
        @if (variationPct() !== null) {
          <span class="text-xs font-medium inline-flex items-center gap-1"
                [class]="(variationPct() ?? 0) >= 0 ? 'text-app-success' : 'text-app-danger'">
            <i [class]="'pi ' + ((variationPct() ?? 0) >= 0 ? 'pi-arrow-up' : 'pi-arrow-down')" aria-hidden="true"></i>
            {{ variationPct() }}{{ variationSuffix() }}
            <span class="text-app-text-tertiary font-normal">{{ variationLabelKey() | translate }}</span>
          </span>
        }
      }
    </div>
  `,
})
export class KpiCardComponent {
  label = input.required<string>();
  icon = input<string>('pi pi-chart-line');
  money = input<KpiMoneyValue | null>(null);
  plainValue = input<string | number | null>(null);
  variationPct = input<number | null>(null);
  variationSuffix = input('%');
  variationLabelKey = input('dashboard.kpi.vsLastMonth');
  /** Linha secundária opcional já traduzida/formatada pelo chamador. */
  hint = input<string | null>(null);
  loading = input(false);

  hasData = computed(() => this.money() !== null || this.plainValue() !== null);

  /** Zero real (não "sem dado"): mostrado esmaecido para uma conta vazia não parecer cheia de números. */
  isZero = computed(() => {
    const money = this.money();
    if (money) return money.amount === 0;
    const plain = this.plainValue();
    return plain !== null && Number(String(plain).replace('%', '')) === 0;
  });
}
