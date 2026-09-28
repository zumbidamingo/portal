import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { FormControl, FormGroup, FormRecord, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DrawerModule } from 'primeng/drawer';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { MessageService } from 'primeng/api';
import {
  Commission, CommissionPayment, FinancialService, Money, PaymentMethod,
} from '../../../core/services/financial.service';
import { TagBadgeComponent, type BadgeSeverity } from '../../../shared/components/tag-badge/tag-badge.component';
import { LocalizedDatePipe } from '../../../shared/pipes/localized-date.pipe';
import { CommissionExplainerService } from './commission-explainer.service';

export type PayoutDrawerMode = 'pay' | 'paid';

/**
 * Um só painel para as duas perguntas que sobram depois de "quanto devo?": "o que estou a pagar
 * a este prestador?" (modo {@code pay}: tudo já marcado, só falta escolher como pagou e confirmar) e
 * "o que foi este pagamento?" (modo {@code paid}: leitura, com a opção de desfazer). Cada linha
 * abre, sem sair do painel, a explicação de por que aquele valor é aquele — nada de modal sobre
 * modal.
 */
@Component({
  selector: 'app-commission-payout-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe, CurrencyPipe, LocalizedDatePipe, ButtonModule,
    CheckboxModule, DrawerModule, InputTextModule, SelectModule, SkeletonModule, TagBadgeComponent,
  ],
  template: `
    <p-drawer [visible]="visible()" (visibleChange)="visible.set($event)" position="right" appendTo="body"
              [style]="{ width: '32rem', maxWidth: '100vw' }"
              [header]="(mode() === 'pay' ? 'financial.commissions.drawer.payTitle' : 'financial.commissions.drawer.paidTitle') | translate:{ name: providerName() }">
      @if (loading()) {
        <div class="space-y-3">
          <p-skeleton height="3rem"></p-skeleton>
          <p-skeleton height="3rem"></p-skeleton>
          <p-skeleton height="3rem"></p-skeleton>
        </div>
      } @else {
        <div class="flex flex-col gap-4">
          @if (mode() === 'paid' && payment(); as p) {
            <div class="bg-app-surface border border-app-border rounded-xl p-4 space-y-1">
              <p class="text-2xl font-medium text-app-text">{{ p.totalAmount.amount | currency:p.totalAmount.currency }}</p>
              <p class="text-sm text-app-text-secondary">
                {{ 'financial.commissions.drawer.paidOn' | translate:{ date: (p.paidAt | localizedDate), method: explainer.methodLabel(p.paymentMethod) } }}
              </p>
              @if (p.notes) { <p class="text-xs text-app-text-tertiary">{{ p.notes }}</p> }
              @if (p.status === 'REVERSED') {
                <p class="text-sm text-app-danger pt-1">
                  {{ 'financial.commissions.drawer.reversedNote' | translate:{ date: (p.reversedAt | localizedDate), reason: p.reverseReason } }}
                </p>
              }
            </div>
          }

          @if (mode() === 'pay' && toPayRows().length > 0) {
            <p class="text-sm text-app-text-secondary">{{ 'financial.commissions.drawer.payIntro' | translate }}</p>
          }

          @if (toPayRows().length > 0 || mode() === 'paid') {
            <ul class="divide-y divide-app-border-subtle border border-app-border rounded-xl bg-app-bg">
              @for (c of mode() === 'pay' ? toPayRows() : rows(); track c.id) {
                <ng-container *ngTemplateOutlet="row; context: { $implicit: c, selectable: mode() === 'pay' }"></ng-container>
              }
            </ul>
          }

          @if (mode() === 'pay' && toCalculateRows().length > 0) {
            <section class="border border-app-warning rounded-xl p-4 space-y-3 bg-app-bg">
              <div class="flex items-center gap-2">
                <i class="pi pi-clock text-app-warning" aria-hidden="true"></i>
                <h3 class="text-sm font-medium text-app-text">{{ 'financial.commissions.drawer.awaitingTitle' | translate }}</h3>
              </div>
              <p class="text-sm text-app-text-secondary">
                {{ 'financial.commissions.drawer.awaitingHint' | translate:{ name: providerName(), count: toCalculateRows().length } }}
              </p>
              <ul class="divide-y divide-app-border-subtle">
                @for (c of toCalculateRows(); track c.id) {
                  <ng-container *ngTemplateOutlet="row; context: { $implicit: c, selectable: false }"></ng-container>
                }
              </ul>
              @if (canManage()) {
                <p-button [label]="'financial.commissions.drawer.defineRate' | translate:{ name: providerName() }"
                          icon="pi pi-percentage" size="small" (onClick)="defineRate.emit()"></p-button>
              }
            </section>
          }

          @if (mode() === 'pay' && toPayRows().length === 0 && toCalculateRows().length === 0) {
            <p class="text-sm text-app-text-secondary">{{ 'financial.commissions.drawer.nothingToPay' | translate }}</p>
          }
        </div>
      }

      <ng-template pTemplate="footer">
        @if (mode() === 'pay' && toPayRows().length > 0 && canManage()) {
          <form class="flex flex-col gap-3" [formGroup]="payForm" (ngSubmit)="confirmPayment()">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'financial.commissions.drawer.methodLabel' | translate }}</label>
                <p-select [options]="methodOptions" formControlName="paymentMethod" optionLabel="label" optionValue="value"
                          appendTo="body" fluid></p-select>
              </div>
              <div>
                <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'financial.commissions.drawer.noteLabel' | translate }}</label>
                <input pInputText formControlName="notes" maxlength="200" fluid />
              </div>
            </div>
            <p-button type="submit" [disabled]="selectedIds().size === 0 || paying()" [loading]="paying()" icon="pi pi-check" fluid
                      [label]="'financial.commissions.drawer.confirmPay' | translate:{ amount: selectedTotalLabel() }"></p-button>
            <p class="text-xs text-app-text-tertiary">{{ 'financial.commissions.drawer.payHint' | translate }}</p>
          </form>
        }

        @if (mode() === 'paid' && payment()?.status === 'PAID' && canManage()) {
          @if (!reversing()) {
            <p-button [label]="'financial.commissions.drawer.reverse' | translate" [outlined]="true" severity="danger" icon="pi pi-undo"
                      (onClick)="reversing.set(true)"></p-button>
          } @else {
            <form class="flex flex-col gap-3" [formGroup]="reverseForm" (ngSubmit)="confirmReverse()">
              <div>
                <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'financial.commissions.drawer.reverseReason' | translate }}</label>
                <input pInputText formControlName="reason" fluid />
              </div>
              <div class="flex gap-2">
                <p-button type="submit" [label]="'financial.commissions.drawer.reverseConfirm' | translate" severity="danger"
                          [loading]="paying()" [disabled]="reverseForm.invalid || paying()"></p-button>
                <p-button type="button" [label]="'common.cancel' | translate" [outlined]="true" severity="secondary"
                          (onClick)="reversing.set(false)"></p-button>
              </div>
            </form>
          }
        }
      </ng-template>
    </p-drawer>

    <ng-template #row let-c let-selectable="selectable">
      <li>
        <div class="flex items-start gap-3 px-3 py-3">
          @if (selectable) {
            <p-checkbox class="mt-0.5" [binary]="true" [formControl]="selectionControl(c.id)"
                        [ariaLabel]="c.serviceSummary || ''"></p-checkbox>
          }
          <button type="button" class="flex-1 min-w-0 text-left cursor-pointer" [attr.aria-expanded]="expandedId() === c.id"
                  (click)="toggleExpanded(c.id)">
            <span class="block text-sm font-medium text-app-text truncate">
              {{ c.serviceSummary || ('financial.commissions.drawer.service' | translate) }}
            </span>
            <span class="block text-xs text-app-text-tertiary truncate">
              {{ c.customerName || '—' }} · {{ c.calculatedAt | localizedDate }}
            </span>
            <span class="inline-flex items-center gap-1 text-xs text-app-accent mt-1">
              <i class="pi" [class.pi-chevron-down]="expandedId() !== c.id" [class.pi-chevron-up]="expandedId() === c.id" aria-hidden="true"></i>
              {{ 'financial.commissions.drawer.why' | translate }}
            </span>
          </button>
          <div class="text-right shrink-0">
            @if (c.situation === 'TO_CALCULATE') {
              <app-tag-badge [value]="'financial.commissions.situation.TO_CALCULATE' | translate" severity="warn"></app-tag-badge>
            } @else {
              <p class="text-sm font-medium text-app-text">{{ c.computedAmount.amount | currency:c.computedAmount.currency }}</p>
              @if (c.needsReview) {
                <app-tag-badge [value]="'financial.commissions.needsReview' | translate" severity="warn"></app-tag-badge>
              }
            }
          </div>
        </div>

        @if (expandedId() === c.id) {
          <div class="mx-3 mb-3 rounded-lg bg-app-surface border border-app-border-subtle p-3 space-y-3">
            <p class="text-sm text-app-text">{{ explainer.explain(c) }}</p>
            <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
              <dt class="text-app-text-tertiary">{{ 'financial.commissions.detail.order' | translate }}</dt>
              <dd class="text-app-text">
                @if (c.orderNumber) {
                  <a [routerLink]="['/orders']" [queryParams]="{ open: c.orderId }" class="text-app-accent hover:underline">#{{ c.orderNumber }}</a>
                } @else { — }
              </dd>
              <dt class="text-app-text-tertiary">{{ 'financial.commissions.detail.serviceValue' | translate }}</dt>
              <dd class="text-app-text">{{ c.baseAmount.amount | currency:c.baseAmount.currency }}</dd>
              <dt class="text-app-text-tertiary">{{ 'financial.commissions.detail.rule' | translate }}</dt>
              <dd class="text-app-text">{{ c.situation === 'TO_CALCULATE' ? '—' : explainer.ruleLabel(c) }}</dd>
              <dt class="text-app-text-tertiary">{{ 'financial.commissions.detail.status' | translate }}</dt>
              <dd><app-tag-badge [value]="('financial.commissions.situation.' + c.situation) | translate" [severity]="severityOf(c)"></app-tag-badge></dd>
              @if (c.paidAt) {
                <dt class="text-app-text-tertiary">{{ 'financial.commissions.detail.paidOn' | translate }}</dt>
                <dd class="text-app-text">{{ c.paidAt | localizedDate }}</dd>
              }
              @if (c.needsReview && c.reviewReason) {
                <dt class="text-app-text-tertiary">{{ 'financial.commissions.needsReview' | translate }}</dt>
                <dd class="text-app-warning">{{ c.reviewReason }}</dd>
              }
            </dl>
          </div>
        }
      </li>
    </ng-template>
  `,
})
export class CommissionPayoutDrawerComponent {
  private readonly financialService = inject(FinancialService);
  private readonly messageService = inject(MessageService);
  private readonly translate = inject(TranslateService);
  protected readonly explainer = inject(CommissionExplainerService);

  readonly visible = model(false);
  readonly mode = input<PayoutDrawerMode>('pay');
  readonly providerId = input<string | null>(null);
  readonly providerName = input('');
  readonly payment = input<CommissionPayment | null>(null);
  readonly canManage = input(false);
  readonly defaultMethod = input<PaymentMethod>('PIX');

  readonly changed = output<void>();
  readonly defineRate = output<void>();

  readonly loading = signal(false);
  readonly paying = signal(false);
  readonly reversing = signal(false);
  readonly rows = signal<Commission[]>([]);
  readonly expandedId = signal<string | null>(null);
  readonly selectedIds = signal<Set<string>>(new Set());

  readonly toPayRows = computed(() => this.rows().filter(c => c.situation === 'TO_PAY'));
  readonly toCalculateRows = computed(() => this.rows().filter(c => c.situation === 'TO_CALCULATE'));
  readonly selectedTotal = computed<Money>(() => {
    const chosen = this.toPayRows().filter(c => this.selectedIds().has(c.id));
    const currency = chosen[0]?.computedAmount.currency ?? this.toPayRows()[0]?.computedAmount.currency ?? 'BRL';
    return { amount: chosen.reduce((sum, c) => sum + c.computedAmount.amount, 0), currency };
  });
  readonly selectedTotalLabel = computed(() => this.explainer.money(this.selectedTotal()));

  private readonly selection = new FormRecord<FormControl<boolean>>({});

  readonly methodOptions: { label: string; value: PaymentMethod }[] = (
    ['PIX', 'CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'DEBIT_CARD', 'BOLETO', 'OTHER'] as PaymentMethod[]
  ).map(value => ({ label: this.translate.instant(`financial.payments.method${value}`), value }));

  readonly payForm = new FormGroup({
    paymentMethod: new FormControl<PaymentMethod>('PIX', { nonNullable: true }),
    notes: new FormControl('', { nonNullable: true }),
  });
  readonly reverseForm = new FormGroup({
    reason: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/\S/)] }),
  });

  constructor() {
    this.selection.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.syncSelection());
    effect(() => {
      if (this.visible()) {
        untracked(() => this.load());
      }
    });
  }

  selectionControl(id: string): FormControl<boolean> {
    return this.selection.controls[id];
  }

  toggleExpanded(id: string): void {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }

  severityOf(c: Commission): BadgeSeverity {
    return c.situation === 'PAID' ? 'success' : c.situation === 'TO_PAY' ? 'info' : 'warn';
  }

  private load(): void {
    this.expandedId.set(null);
    this.reversing.set(false);
    this.reverseForm.reset({ reason: '' });
    this.payForm.reset({ paymentMethod: this.defaultMethod(), notes: '' });

    const source = this.mode() === 'pay'
      ? (this.providerId() ? this.financialService.listPendingForPayment(this.providerId()!) : null)
      : (this.payment() ? this.financialService.listPaymentCommissions(this.payment()!.id) : null);
    if (!source) {
      this.rows.set([]);
      return;
    }
    this.loading.set(true);
    source.subscribe({
      next: commissions => {
        const ordered = [...commissions].sort((a, b) => a.calculatedAt.localeCompare(b.calculatedAt));
        this.rows.set(ordered);
        this.resetSelection(ordered.filter(c => c.situation === 'TO_PAY'));
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.rows.set([]);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('financial.loadError') });
      },
    });
  }

  private resetSelection(payable: Commission[]): void {
    for (const key of Object.keys(this.selection.controls)) {
      this.selection.removeControl(key, { emitEvent: false });
    }
    for (const c of payable) {
      this.selection.addControl(c.id, new FormControl<boolean>(true, { nonNullable: true }), { emitEvent: false });
    }
    this.syncSelection();
  }

  private syncSelection(): void {
    const chosen = Object.entries(this.selection.controls).filter(([, control]) => control.value).map(([id]) => id);
    this.selectedIds.set(new Set(chosen));
  }

  confirmPayment(): void {
    const providerId = this.providerId();
    const ids = [...this.selectedIds()];
    if (!providerId || ids.length === 0 || this.paying()) return;
    const value = this.payForm.getRawValue();
    const total = this.selectedTotalLabel();
    this.paying.set(true);
    this.financialService.registerCommissionPayment({
      providerId, commissionIds: ids, paymentMethod: value.paymentMethod,
      paymentReference: null, notes: value.notes.trim() || null,
    }).subscribe({
      next: () => {
        this.paying.set(false);
        this.visible.set(false);
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('financial.commissions.drawer.paySuccess', { amount: total, name: this.providerName() }),
        });
        this.changed.emit();
      },
      error: (err: HttpErrorResponse) => {
        this.paying.set(false);
        this.messageService.add({ severity: 'error', summary: this.businessError(err, 'financial.commissions.drawer.payError') });
        this.load();
      },
    });
  }

  confirmReverse(): void {
    const payment = this.payment();
    const reason = this.reverseForm.getRawValue().reason.trim();
    if (!payment || !reason || this.paying()) return;
    this.paying.set(true);
    this.financialService.reverseCommissionPayment(payment.id, reason).subscribe({
      next: () => {
        this.paying.set(false);
        this.visible.set(false);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('financial.commissions.drawer.reversed') });
        this.changed.emit();
      },
      error: (err: HttpErrorResponse) => {
        this.paying.set(false);
        this.messageService.add({ severity: 'error', summary: this.businessError(err, 'financial.commissions.drawer.reverseError') });
      },
    });
  }

  private businessError(err: HttpErrorResponse, fallbackKey: string): string {
    const code = (err.error as { errorCode?: string } | null)?.errorCode;
    if (code) {
      const key = `financial.errors.${code}`;
      const translated = this.translate.instant(key);
      if (translated !== key) return translated;
    }
    return this.translate.instant(fallbackKey);
  }
}
