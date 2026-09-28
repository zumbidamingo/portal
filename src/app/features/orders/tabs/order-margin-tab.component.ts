import { ChangeDetectionStrategy, Component, DestroyRef, OnChanges, SimpleChanges, inject, input, output, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, PercentPipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { MessageService } from 'primeng/api';
import { Order, OrderMargin, OrderMarginHealth, OrderService } from '../../../core/services/order.service';
import { LocalizedDatePipe } from '../../../shared/pipes/localized-date.pipe';
import { TagBadgeComponent, BadgeSeverity } from '../../../shared/components/tag-badge/tag-badge.component';

/**
 * Resultado financeiro da OS em linguagem de dono: o que entrou, o que custou, o que sobrou.
 * Tudo é calculado no backend (`OrderMarginPolicy`) — receita e comissão vêm sozinhas; o dono só
 * confirma os custos que o sistema não tem como saber (material, deslocamento, mão de obra).
 */
@Component({
  selector: 'app-order-margin-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, CurrencyPipe, PercentPipe, ReactiveFormsModule, RouterLink, TranslatePipe, ButtonModule,
    InputNumberModule, LocalizedDatePipe, TagBadgeComponent],
  template: `
    <div class="space-y-4 text-sm py-4">
      @if (loading() && !margin()) {
        <div class="text-app-text-tertiary text-xs">{{ 'common.loading' | translate }}</div>
      } @else if (loadFailed()) {
        <div class="text-app-danger text-xs">{{ 'orders.margin.loadError' | translate }}</div>
      } @else if (margin(); as m) {
        <!-- 1. A resposta: quanto sobrou e se está bom -->
        <div class="rounded-xl border p-4" [class]="heroClass(m.health)">
          <div class="text-[11px] font-medium text-app-text-secondary mb-1">{{ ('orders.margin.basis.' + m.basis) | translate }}</div>
          <div class="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <div class="text-xs text-app-text-secondary">
                {{ (m.result.amount < 0 ? 'orders.margin.lost' : 'orders.margin.left') | translate }}
              </div>
              <div class="text-2xl font-semibold" [class.text-app-danger]="m.result.amount < 0" [class.text-app-text]="m.result.amount >= 0">
                {{ absAmount(m.result.amount) | currency:m.result.currency }}
              </div>
            </div>
            @if (m.percent !== null) {
              <div class="text-right">
                <div class="text-xs text-app-text-secondary">{{ 'orders.margin.margin' | translate }}</div>
                <div class="text-2xl font-semibold text-app-text">{{ m.percent / 100 | percent:'1.0-1' }}</div>
              </div>
            }
          </div>
          <div class="mt-2 flex items-center gap-2 flex-wrap">
            <app-tag-badge [value]="('orders.margin.health.' + m.health) | translate" [severity]="healthSeverity(m.health)"></app-tag-badge>
            <span class="text-xs text-app-text-secondary">{{ ('orders.margin.healthHint.' + m.health) | translate }}</span>
          </div>
          <p class="mt-2 text-xs text-app-text-tertiary">{{ 'orders.margin.help' | translate }}</p>
        </div>

        <!-- 2. Como chegamos nesse valor -->
        <div>
          <div class="text-[11px] font-medium text-app-text-secondary mb-2">{{ 'orders.margin.howTitle' | translate }}</div>
          <dl class="space-y-1.5">
            <div class="flex justify-between gap-3">
              <dt class="text-app-text-secondary">{{ 'orders.margin.orderValue' | translate }}</dt>
              <dd class="text-app-text">{{ m.orderValue.amount | currency:m.orderValue.currency }}</dd>
            </div>
            @if (m.discount.amount > 0) {
              <div class="flex justify-between gap-3">
                <dt class="text-app-text-secondary">{{ 'orders.margin.discount' | translate }}</dt>
                <dd class="text-app-text">− {{ m.discount.amount | currency:m.discount.currency }}</dd>
              </div>
            }
            <div class="flex justify-between gap-3 pt-1.5 border-t border-app-border-subtle">
              <dt class="font-medium text-app-text">
                {{ 'orders.margin.revenue' | translate }}
                <span class="block text-[11px] font-normal text-app-text-tertiary">
                  {{ (m.basis === 'CANCELLED' ? 'orders.margin.revenueCancelled' : 'orders.margin.revenueSource') | translate }}
                </span>
              </dt>
              <dd class="font-medium text-app-text">{{ m.revenue.amount | currency:m.revenue.currency }}</dd>
            </div>

            <div class="text-[11px] font-medium text-app-text-secondary pt-3">{{ 'orders.margin.costsTitle' | translate }}</div>
            @for (line of costLines(m); track line.key) {
              <div class="flex justify-between gap-3">
                <dt class="text-app-text-secondary">{{ ('orders.margin.' + line.key) | translate }}</dt>
                <dd [class.text-app-text-tertiary]="!line.money" class="text-app-text">
                  @if (line.money) {
                    {{ line.money.amount | currency:line.money.currency }}
                  } @else {
                    {{ 'orders.margin.notInformed' | translate }}
                  }
                </dd>
              </div>
            }
            @if (m.commissionState !== 'NONE') {
              <div class="flex justify-between gap-3">
                <dt class="text-app-text-secondary">
                  {{ 'orders.margin.commission' | translate }}
                  <span class="block text-[11px] text-app-text-tertiary">{{ ('orders.margin.commissionState.' + m.commissionState) | translate }}</span>
                </dt>
                <dd class="text-app-text" [class.text-app-text-tertiary]="!m.commission">
                  @if (m.commission) {
                    {{ m.commission.amount | currency:m.commission.currency }}
                  } @else {
                    {{ 'orders.margin.notCalculatedYet' | translate }}
                  }
                </dd>
              </div>
            }
            <div class="flex justify-between gap-3 pt-1.5 border-t border-app-border-subtle">
              <dt class="font-medium text-app-text">{{ 'orders.margin.totalCosts' | translate }}</dt>
              <dd class="font-medium text-app-text">{{ m.totalCosts.amount | currency:m.totalCosts.currency }}</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-app-text-tertiary text-xs">{{ 'orders.margin.date' | translate }}</dt>
              <dd class="text-app-text-tertiary text-xs">
                {{ (order().scheduledStartAt ?? order().createdAt) | localizedDate:'date':tenantTimezone() }}
              </dd>
            </div>
          </dl>
        </div>

        <!-- 3. O que falta: só o que o sistema não consegue saber sozinho -->
        <div class="rounded-xl border border-app-border p-3 space-y-2">
          <div class="text-[11px] font-medium text-app-text-secondary">{{ 'orders.margin.todoTitle' | translate }}</div>

          @if (!m.costsInformed) {
            <p class="text-app-text">{{ 'orders.margin.todoCosts' | translate }}</p>
            <div class="flex gap-2 flex-wrap">
              <p-button [label]="'orders.margin.noCostsButton' | translate" icon="pi pi-check" size="small"
                        [loading]="saving()" (onClick)="confirmNoCosts(m)"></p-button>
              <p-button [label]="'orders.margin.fillCosts' | translate" severity="secondary" [outlined]="true" size="small"
                        (onClick)="editing.set(true)"></p-button>
            </div>
          }
          @if (m.commissionState === 'AWAITING_RATE') {
            <p class="text-app-text">{{ 'orders.margin.todoRate' | translate }}</p>
            <p-button [label]="'orders.margin.setRate' | translate" icon="pi pi-arrow-right" iconPos="right" [text]="true" size="small"
                      routerLink="/financial/commissions"></p-button>
          }
          @if (m.health === 'NEGATIVE' || m.health === 'LOW') {
            <p class="text-app-text">{{ ('orders.margin.todo.' + m.health) | translate }}</p>
          }
          @if (m.costsInformed && m.commissionState !== 'AWAITING_RATE' && (m.health === 'GOOD' || m.health === 'NO_REVENUE')) {
            <p class="text-app-text-secondary">{{ 'orders.margin.todoNothing' | translate }}</p>
          }
          @if (m.costsInformed && !editing()) {
            <p-button [label]="'orders.margin.editCosts' | translate" icon="pi pi-pencil" [text]="true" size="small"
                      (onClick)="editing.set(true)"></p-button>
          }
        </div>

        @if (editing()) {
          <form [formGroup]="costsForm" (ngSubmit)="saveCosts(m)" class="rounded-xl border border-app-border p-3 space-y-3">
            <div class="text-[11px] font-medium text-app-text-secondary">{{ 'orders.margin.costsFormTitle' | translate }}</div>
            @for (f of costFields; track f.control) {
              <div>
                <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ ('orders.margin.' + f.label) | translate }}</label>
                <p-inputNumber [formControlName]="f.control" mode="currency" [currency]="order().currencyCode" [min]="0" fluid
                               [placeholder]="'orders.margin.notInformed' | translate"></p-inputNumber>
              </div>
            }
            @if (formWouldLose(m)) {
              <p class="text-xs text-app-danger"><i class="pi pi-exclamation-triangle text-[10px]"></i> {{ 'orders.margin.formLossWarning' | translate }}</p>
            }
            <p class="text-[11px] text-app-text-tertiary">{{ 'orders.margin.costsFormHint' | translate }}</p>
            <div class="flex justify-end gap-2">
              <p-button type="button" [label]="'common.cancel' | translate" severity="secondary" [text]="true" size="small"
                        (onClick)="editing.set(false)"></p-button>
              <p-button type="submit" [label]="'orders.margin.saveCosts' | translate" icon="pi pi-check" size="small"
                        [loading]="saving()"></p-button>
            </div>
          </form>
        }
      }
    </div>
  `,
})
export class OrderMarginTabComponent implements OnChanges {
  order = input.required<Order>();
  tenantTimezone = input<string | null>(null);
  /** Custos gravados: o pai refresca a ordem aberta (mesmo contrato da aba de itens). */
  orderUpdated = output<Order>();

  private orderService = inject(OrderService);
  private messageService = inject(MessageService);
  private translate = inject(TranslateService);
  private destroyRef = inject(DestroyRef);

  margin = signal<OrderMargin | null>(null);
  loading = signal(false);
  loadFailed = signal(false);
  saving = signal(false);
  editing = signal(false);

  readonly costFields = [
    { control: 'material', label: 'material' },
    { control: 'travel', label: 'travel' },
    { control: 'labor', label: 'labor' },
  ] as const;

  readonly costsForm = new FormGroup({
    material: new FormControl<number | null>(null),
    travel: new FormControl<number | null>(null),
    labor: new FormControl<number | null>(null),
  });

  private formTotal = signal(0);

  /** Aviso antes de salvar: os custos digitados (mais a comissão já conhecida) passam da receita. */
  formWouldLose(m: OrderMargin): boolean {
    return m.revenue.amount - this.formTotal() - (m.commission?.amount ?? 0) < 0;
  }

  constructor() {
    this.trackFormTotal();
  }

  ngOnChanges(changes: SimpleChanges): void {
    const change = changes['order'];
    // Recarrega quando a ordem muda de facto (outra ordem, ou atualizada) — o resultado depende
    // do estado, dos itens e dos custos.
    if (change && (change.firstChange || change.previousValue?.id !== change.currentValue.id
        || change.previousValue?.updatedAt !== change.currentValue.updatedAt)) {
      this.load();
    }
  }

  absAmount(amount: number): number {
    return Math.abs(amount);
  }

  costLines(m: OrderMargin): { key: string; money: OrderMargin['material'] }[] {
    return [
      { key: 'material', money: m.material },
      { key: 'travel', money: m.travel },
      { key: 'labor', money: m.labor },
    ];
  }

  healthSeverity(health: OrderMarginHealth): BadgeSeverity {
    return health === 'GOOD' ? 'success' : health === 'LOW' ? 'warn' : health === 'NEGATIVE' ? 'danger' : 'secondary';
  }

  heroClass(health: OrderMarginHealth): string {
    return health === 'NEGATIVE' ? 'border-app-danger bg-app-surface'
      : health === 'LOW' ? 'border-app-warning bg-app-surface'
      : 'border-app-border bg-app-surface';
  }

  private load(): void {
    this.loading.set(true);
    this.loadFailed.set(false);
    const sub = this.orderService.getMargin(this.order().id).subscribe({
      next: m => {
        this.margin.set(m);
        this.loading.set(false);
        const costs = this.order().costs;
        this.costsForm.reset({
          material: costs.material?.amount ?? null,
          travel: costs.travel?.amount ?? null,
          labor: costs.labor?.amount ?? null,
        });
      },
      error: () => {
        this.loading.set(false);
        this.loadFailed.set(true);
      },
    });
    this.destroyRef.onDestroy(() => sub.unsubscribe());
  }

  private trackFormTotal(): void {
    const sub = this.costsForm.valueChanges.subscribe(v =>
      this.formTotal.set((v.material ?? 0) + (v.travel ?? 0) + (v.labor ?? 0)));
    this.destroyRef.onDestroy(() => sub.unsubscribe());
  }

  /** "Confirmar" em vez de "configurar": um clique diz ao sistema que não houve custos extras. */
  confirmNoCosts(m: OrderMargin): void {
    this.persistCosts({ material: 0, travel: 0, labor: 0 }, m.revenue.currency);
  }

  saveCosts(m: OrderMargin): void {
    this.persistCosts(this.costsForm.getRawValue(), m.revenue.currency);
  }

  private persistCosts(costs: { material: number | null; travel: number | null; labor: number | null }, currency: string): void {
    this.saving.set(true);
    const money = (v: number | null) => (v != null ? currency : null);
    this.orderService.updateCosts(this.order().id, {
      materialAmount: costs.material, materialCurrency: money(costs.material),
      travelAmount: costs.travel, travelCurrency: money(costs.travel),
      laborAmount: costs.labor, laborCurrency: money(costs.labor),
    }).subscribe({
      next: updated => {
        this.saving.set(false);
        this.editing.set(false);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('orders.margin.saved') });
        this.orderUpdated.emit(updated);
      },
      error: () => {
        this.saving.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('orders.margin.saveError') });
      },
    });
  }
}
