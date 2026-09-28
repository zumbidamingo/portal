import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { ToastModule } from 'primeng/toast';
import { Textarea } from 'primeng/textarea';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { SelectModule } from 'primeng/select';
import { QuotationPublicService, PublicDeclineReason, PublicQuotation, PublicQuotationItem, PublicQuotationSchedule } from '../../../core/services/quotation-public.service';
import { LocaleService } from '../../../core/services/locale.service';
import { LocalizedDatePipe } from '../../../shared/pipes/localized-date.pipe';
import { DurationMinutesPipe } from '../../../shared/pipes/duration-minutes.pipe';
import {
  formatQuotationNumber, paymentTermsDisplay, priceTypeUnitLabelKey, quotationItemsDiscountTotal,
  quotationItemsGrossSubtotal,
} from '../quotation-form.utils';
import { scheduleDurationMinutes } from '../../../shared/utils/schedule-window.util';

type ScreenState = 'loading' | 'view' | 'decided' | 'invalid' | 'alreadyDecided';

/**
 * Vista pública do orçamento (issue #140), sem autenticação — o token assinado na própria URL é
 * a única credencial. Mesma família de padrão de {@code AcceptInvitationComponent}: estados de
 * ecrã em vez de rotas separadas, porque o mesmo link cobre "ainda por decidir", "já decidido" e
 * "inválido/expirado".
 */
@Component({
  selector: 'app-quotation-public',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [MessageService],
  imports: [CommonModule, FormsModule, TranslatePipe, CurrencyPipe, DatePipe, ButtonModule, TableModule, ToastModule, Textarea, SelectModule,
    LocalizedDatePipe, DurationMinutesPipe],
  template: `
    <p-toast position="top-right"></p-toast>

    <div class="min-h-screen bg-app-surface flex items-start sm:items-center justify-center p-4 sm:p-8">
      <div class="w-full max-w-2xl">

        @if (state() === 'loading') {
          <div class="text-center py-16">
            <i class="pi pi-spin pi-spinner text-3xl text-app-accent-hover"></i>
          </div>
        }

        @if (state() === 'invalid') {
          <div class="bg-app-bg border border-app-border rounded-xl p-8 text-center">
            <div class="w-16 h-16 bg-app-danger/10 rounded-full flex items-center justify-center mx-auto mb-5">
              <i class="pi pi-times-circle text-app-danger text-2xl"></i>
            </div>
            <p class="text-app-text font-semibold text-lg">{{ 'quotations.public.invalidTitle' | translate }}</p>
            <p class="text-app-text-secondary text-sm mt-2 leading-relaxed">{{ 'quotations.public.invalidDesc' | translate }}</p>
          </div>
        }

        @if (state() === 'decided' || state() === 'alreadyDecided') {
          <div class="bg-app-bg border border-app-border rounded-xl p-8 text-center">
            <div class="w-16 h-16 bg-app-accent-soft rounded-full flex items-center justify-center mx-auto mb-5">
              <i class="pi pi-check-circle text-app-accent-hover text-2xl"></i>
            </div>
            <p class="text-app-text font-semibold text-lg">{{ 'quotations.public.decidedTitle' | translate }}</p>
            <p class="text-app-text-secondary text-sm mt-2 leading-relaxed">{{ 'quotations.public.decidedDesc' | translate }}</p>
          </div>
        }

        @if (state() === 'view' && quotation(); as q) {
          <div class="bg-app-bg border border-app-border rounded-xl overflow-hidden">
            <div class="p-6 sm:p-8 border-b border-app-border">
              <p class="text-xs uppercase tracking-wide text-app-text-tertiary">{{ q.tenantName }}</p>
              <h1 class="text-2xl font-bold text-app-text mt-1">
                {{ 'quotations.numberShort' | translate: { number: formatQuotationNumber(q.quotationNumber) } }}
              </h1>
              <div class="flex flex-wrap gap-x-8 gap-y-1 mt-4 text-sm">
                <div>
                  <span class="text-app-text-tertiary">{{ 'quotations.public.customerLabel' | translate }}: </span>
                  <span class="text-app-text font-medium">{{ q.customerName }}</span>
                </div>
                <div>
                  <span class="text-app-text-tertiary">{{ 'quotations.validUntil' | translate }}: </span>
                  <span class="text-app-text font-medium">{{ q.validUntil | date:'mediumDate' }}</span>
                </div>
              </div>
            </div>

            <div class="p-6 sm:p-8 space-y-6">
              <div class="overflow-x-auto min-w-0">
              <p-table [value]="q.items" class="p-datatable-sm" [rowHover]="true">
                <ng-template pTemplate="header">
                  <tr>
                    <th>{{ 'common.name' | translate }}</th>
                    <th class="text-right w-24">{{ 'quotations.quantity' | translate }}</th>
                    <th class="text-right w-32">{{ 'quotations.unitPrice' | translate }}</th>
                    <th class="text-right w-28">{{ 'quotations.lineTotal' | translate }}</th>
                  </tr>
                </ng-template>
                <ng-template pTemplate="body" let-item>
                  <tr>
                    <td>{{ item.description }}</td>
                    <td class="text-right whitespace-nowrap">{{ quantityDisplay(item) }}</td>
                    <td class="text-right whitespace-nowrap">{{ item.unitPrice | currency:q.currency }}{{ unitLabel(item.priceType) ? '/' + unitLabel(item.priceType) : '' }}</td>
                    <td class="text-right">{{ item.lineTotal | currency:q.currency }}</td>
                  </tr>
                </ng-template>
              </p-table>
              </div>

              <div class="flex justify-end">
                <dl class="w-full sm:w-64 space-y-1.5 text-sm">
                  @if (quotationItemsDiscountTotal(q.items) > 0) {
                    <div class="flex justify-between">
                      <dt class="text-app-text-tertiary">{{ 'quotations.itemsGrossSubtotal' | translate }}</dt>
                      <dd class="text-app-text">{{ quotationItemsGrossSubtotal(q.items) | currency:q.currency }}</dd>
                    </div>
                    <div class="flex justify-between">
                      <dt class="text-app-text-tertiary">{{ 'quotations.itemsDiscountTotal' | translate }}</dt>
                      <dd class="text-app-text">-{{ quotationItemsDiscountTotal(q.items) | currency:q.currency }}</dd>
                    </div>
                    @if (q.discountAmount) {
                      <div class="flex justify-between">
                        <dt class="text-app-text-tertiary">{{ 'quotations.subtotalAfterItemDiscounts' | translate }}</dt>
                        <dd class="text-app-text">{{ q.subtotal | currency:q.currency }}</dd>
                      </div>
                    }
                  } @else {
                    <div class="flex justify-between">
                      <dt class="text-app-text-tertiary">{{ 'quotations.subtotal' | translate }}</dt>
                      <dd class="text-app-text">{{ q.subtotal | currency:q.currency }}</dd>
                    </div>
                  }
                  @if (q.discountAmount) {
                    <div class="flex justify-between">
                      <dt class="text-app-text-tertiary">{{ 'quotations.totalDiscountLabel' | translate }}</dt>
                      <dd class="text-app-text">-{{ q.discountAmount | currency:q.currency }}</dd>
                    </div>
                  }
                  @if (q.paymentMethod) {
                    @if (q.paymentCondition) {
                      <div class="flex justify-between">
                        <dt class="text-app-text-tertiary">{{ 'quotations.paymentConditionLabel' | translate }}</dt>
                        <dd class="text-app-text">{{ conditionLabel(q.paymentCondition) }}</dd>
                      </div>
                    }
                    <div class="flex justify-between">
                      <dt class="text-app-text-tertiary">{{ 'quotations.paymentMethodLabel' | translate }}</dt>
                      <dd class="text-app-text">{{ methodLabel(q.paymentMethod) }}</dd>
                    </div>
                    @if (q.installments) {
                      <div class="flex justify-between">
                        <dt class="text-app-text-tertiary">{{ 'quotations.installmentsLabel' | translate }}</dt>
                        <dd class="text-app-text">{{ q.installments }}x</dd>
                      </div>
                    }
                    @if (q.interestAmount) {
                      <div class="flex justify-between">
                        <dt class="text-app-text-tertiary">{{ 'quotations.amountBeforeInterest' | translate }}</dt>
                        <dd class="text-app-text">{{ q.amountBeforeInterest | currency:q.currency }}</dd>
                      </div>
                      <div class="flex justify-between">
                        <dt class="text-app-text-tertiary">{{ 'quotations.interestAmount' | translate: { percentage: q.paymentMethodInterestPercentage } }}</dt>
                        <dd class="text-app-text">+{{ q.interestAmount | currency:q.currency }}</dd>
                      </div>
                    }
                  }
                  <div class="flex justify-between text-base font-semibold border-t border-app-border pt-1.5 mt-1.5">
                    <dt class="text-app-text">{{ 'quotations.total' | translate }}</dt>
                    <dd class="text-app-text">{{ q.total | currency:q.currency }}</dd>
                  </div>
                </dl>
              </div>

              @if (q.schedules.length) {
                <div class="pt-2 border-t border-app-border text-sm">
                  <dt class="text-app-text-tertiary text-xs">{{ 'quotations.public.scheduleTitle' | translate }}</dt>
                  <dl class="mt-1 space-y-2">
                    @for (s of q.schedules; track s.executionMode) {
                      <div class="flex justify-between gap-3 flex-wrap">
                        <dd class="text-app-text-secondary">{{ ('catalog.services.executionMode' + s.executionMode) | translate }}</dd>
                        <dd class="text-right">
                          <div class="text-app-text font-medium">
                            {{ 'quotations.public.arrivalLabel' | translate }}: {{ s.scheduledStartAt | localizedDate:'datetime':q.tenantTimezone }}
                          </div>
                          <div class="text-xs text-app-text-tertiary">
                            {{ 'quotations.public.durationLabel' | translate: { duration: (scheduleDurationMinutes(s) | durationMinutes) } }}
                          </div>
                        </dd>
                      </div>
                    }
                  </dl>
                  <p class="text-xs text-app-text-tertiary mt-1">{{ 'quotations.public.scheduleHint' | translate }}</p>
                </div>
              }

              @if (q.paymentTerms || q.terms) {
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-app-border text-sm">
                  @if (q.paymentTerms) {
                    <div>
                      <dt class="text-app-text-tertiary text-xs">{{ 'quotations.paymentTermsLabel' | translate }}</dt>
                      <dd class="text-app-text mt-0.5">{{ paymentTermsText(q.paymentTerms) }}</dd>
                    </div>
                  }
                  @if (q.terms) {
                    <div>
                      <dt class="text-app-text-tertiary text-xs">{{ 'quotations.observationsLabel' | translate }}</dt>
                      <dd class="text-app-text mt-0.5 whitespace-pre-line">{{ q.terms }}</dd>
                    </div>
                  }
                </div>
              }

              @if (showDeclineReason()) {
                <div class="border-t border-app-border pt-4 space-y-2">
                  <label class="text-xs font-medium text-app-text-secondary">{{ 'quotations.public.declineReasonLabel' | translate }}</label>
                  <p-select [options]="declineReasonOptions" optionLabel="label" optionValue="value" [(ngModel)]="declineReasonCode"
                            [showClear]="true" appendTo="body" fluid
                            [placeholder]="'quotations.public.declineReasonCodePlaceholder' | translate"></p-select>
                  <textarea pTextarea rows="3" class="w-full" [(ngModel)]="declineReason"
                            [placeholder]="'quotations.public.declineReasonPlaceholder' | translate"></textarea>
                  <div class="flex flex-col sm:flex-row justify-end gap-2">
                    <p-button [label]="'common.close' | translate" [outlined]="true" [disabled]="!!deciding()"
                              (onClick)="showDeclineReason.set(false)"></p-button>
                    <p-button [label]="'quotations.public.declineConfirm' | translate" severity="danger"
                              [loading]="deciding() === 'decline'" [disabled]="!!deciding()" (onClick)="confirmDecline()"></p-button>
                  </div>
                </div>
              } @else {
                <div class="flex flex-col sm:flex-row justify-end gap-2 pt-2">
                  <p-button [label]="'quotations.public.decline' | translate" [outlined]="true" severity="danger"
                            [disabled]="!!deciding()" (onClick)="showDeclineReason.set(true)"></p-button>
                  <p-button [label]="'quotations.public.accept' | translate"
                            [loading]="deciding() === 'accept'" [disabled]="!!deciding()" (onClick)="decide('accept')"></p-button>
                </div>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class QuotationPublicComponent {
  private route = inject(ActivatedRoute);
  private quotationPublicService = inject(QuotationPublicService);
  private messageService = inject(MessageService);
  private translate = inject(TranslateService);
  private localeService = inject(LocaleService);

  private readonly token = this.route.snapshot.paramMap.get('token') ?? '';

  state = signal<ScreenState>('loading');
  quotation = signal<PublicQuotation | null>(null);
  deciding = signal<'accept' | 'decline' | null>(null);
  showDeclineReason = signal(false);
  declineReason = '';
  declineReasonCode: PublicDeclineReason | null = null;
  readonly declineReasonOptions = (['PRICE', 'SCHEDULE', 'COMPETITOR', 'QUALITY_CONCERN', 'OTHER'] as PublicDeclineReason[])
    .map(code => ({ label: this.translate.instant(`quotations.public.declineReasons.${code}`), value: code }));

  constructor() {
    if (!this.token) {
      this.state.set('invalid');
      return;
    }
    this.quotationPublicService.get(this.token).subscribe({
      next: q => {
        // Página da empresa, não do visitante — mostra-se no locale do tenant, nunca no do
        // browser de quem abriu o link (issue de tradução da linha do tenant no link público).
        const locale = this.localeService.normalize(q.tenantLocale) ?? 'en';
        this.translate.use(locale).subscribe(() => {
          this.quotation.set(q);
          this.state.set(q.status === 'APPROVED' || q.status === 'DECLINED' ? 'alreadyDecided' : 'view');
        });
      },
      error: () => this.state.set('invalid'),
    });
  }

  readonly quotationItemsGrossSubtotal = quotationItemsGrossSubtotal;
  readonly quotationItemsDiscountTotal = quotationItemsDiscountTotal;
  readonly formatQuotationNumber = formatQuotationNumber;

  paymentTermsText(value: string | null): string {
    return paymentTermsDisplay(value, this.translate);
  }

  methodLabel(method: string): string {
    return this.translate.instant(`financial.payments.method${method}`);
  }

  conditionLabel(condition: string): string {
    return this.translate.instant(`financial.payments.condition${condition}`);
  }

  unitLabel(priceType: PublicQuotationItem['priceType']): string {
    const key = priceTypeUnitLabelKey(priceType);
    return key ? this.translate.instant(key) : '';
  }

  quantityDisplay(item: PublicQuotationItem): string {
    const unit = this.unitLabel(item.priceType);
    return unit ? `${item.quantity} ${unit}` : `${item.quantity}`;
  }

  scheduleDurationMinutes(schedule: PublicQuotationSchedule): number {
    return scheduleDurationMinutes(schedule.scheduledStartAt, schedule.scheduledEndAt);
  }

  confirmDecline(): void {
    this.decide('decline');
  }

  decide(action: 'accept' | 'decline'): void {
    if (this.deciding()) return;
    this.deciding.set(action);
    const request = action === 'accept'
      ? this.quotationPublicService.accept(this.token)
      : this.quotationPublicService.decline(this.token, this.declineReason.trim() || undefined, this.declineReasonCode ?? undefined);
    request.subscribe({
      next: () => {
        this.deciding.set(null);
        this.state.set('decided');
      },
      error: (err: HttpErrorResponse) => {
        this.deciding.set(null);
        if (err.error?.errorCode === 'QUOTATION_PUBLIC_DECISION_EXISTS') {
          this.state.set('alreadyDecided');
          return;
        }
        this.messageService.add({ severity: 'error', summary: this.translate.instant('errors.serverError') });
      },
    });
  }
}
