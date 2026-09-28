import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { InputNumberModule } from 'primeng/inputnumber';
import { DatePickerModule } from 'primeng/datepicker';
import { TooltipModule } from 'primeng/tooltip';
import { SkeletonModule } from 'primeng/skeleton';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Textarea } from 'primeng/textarea';
import {
  QuotationService, Quotation, QuotationItem, DiscountType, ExecutionMode, QuotationSchedule, ScheduleSuggestion,
  SplitProposal, SplitStrategy,
} from '../../../core/services/quotation.service';
import { CustomerService } from '../../../core/services/customer.service';
import { ServiceService, CatalogService, ServiceCategoryService } from '../../../core/services/catalog.service';
import { SystemParamsDiscoveryService } from '../../../core/services/system-params-discovery.service';
import { TenantService, TenantSystemParameters } from '../../../core/services/tenant.service';
import {
  PaymentMethodService, PaymentConditionMethodSetting, PaymentCondition, PaymentMethod, CreditCardInstallmentPlan,
  PAYMENT_CONDITIONS,
} from '../../../core/services/payment-method.service';
import { TagBadgeComponent } from '../../../shared/components/tag-badge/tag-badge.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SlotCandidate, SlotCandidateTableComponent } from '../../../shared/components/slot-candidate-table/slot-candidate-table.component';
import { TeamSchedulePickerComponent, TeamScheduleChoice, TeamScheduleSource } from '../../../shared/components/team-schedule-picker/team-schedule-picker.component';
import { LocalizedDatePipe } from '../../../shared/pipes/localized-date.pipe';
import { DurationMinutesPipe } from '../../../shared/pipes/duration-minutes.pipe';
import { formatLocalizedDate, zonedNow, zonedWallClockToInstant } from '../../../shared/i18n/date-locale';
import {
  buildInstallmentOptions, formatQuotationNumber, itemDiscountPercent, itemGrossAmount,
  paymentConditionLabel, paymentMethodLabel, parseIsoDate, priceTypeQuantityConfig, priceTypeUnitLabelKey,
  quotationDiscountPercent, quotationErrorMessage, quotationItemsDiscountTotal, quotationItemsGrossSubtotal,
  quotationStatusSeverity, toIsoDate,
} from '../quotation-form.utils';
import { scheduleDurationMinutes, technicianNamesLabel } from '../../../shared/utils/schedule-window.util';

/**
 * Edição de um orçamento em DRAFT (condições comerciais + itens). Rota própria
 * (`/quotations/:id/edit`) — se o orçamento carregado não estiver em DRAFT (ex.: link
 * obsoleto, ou já enviado por outra aba), redireciona para a vista de detalhes, que é a única
 * leitura válida para os demais estados.
 */
@Component({
  selector: 'app-quotation-edit',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink, TranslatePipe, CurrencyPipe, DatePipe, DecimalPipe,
    ButtonModule, TableModule, SelectModule, SelectButtonModule, InputNumberModule,
    DatePickerModule, TooltipModule, SkeletonModule, TagBadgeComponent, PageHeaderComponent, Textarea, LocalizedDatePipe,
    DurationMinutesPipe, SlotCandidateTableComponent, TeamSchedulePickerComponent],
  template: `
    <div>
      <app-page-header [title]="ready() ? ('quotations.numberShort' | translate: { number: formatQuotationNumber(ready()!.quotationNumber) }) : ('quotations.editor' | translate)"
                        [description]="ready() ? ('quotations.editor' | translate) : (loading() ? ('common.loading' | translate) : '')">
        @if (ready(); as q) {
          <ng-container badge>
            @if (customerName()) {
              <a [routerLink]="['/customers']" [queryParams]="{ customerId: q.customerId }"
                 class="inline-flex items-center gap-1 text-sm text-app-text-secondary hover:text-app-accent-hover hover:underline">
                <i class="pi pi-user text-xs" aria-hidden="true"></i> {{ customerName() }}
              </a>
            }
            <app-tag-badge [value]="('quotations.status' + q.status) | translate" [severity]="quotationStatusSeverity(q.status)"></app-tag-badge>
          </ng-container>
        }
        <p-button [label]="'quotations.backToList' | translate" icon="pi pi-arrow-left" [outlined]="true" (onClick)="back()"></p-button>
        @if (ready(); as q) {
          @if (directQuotationApprovalEnabled()) {
            <span [pTooltip]="hasItems() ? null : ('quotations.sendDisabledHint' | translate)" tooltipPosition="top">
              <p-button [label]="'quotations.approveDirectly' | translate" icon="pi pi-check-circle" severity="success"
                        [outlined]="true" [disabled]="!hasItems()" [loading]="approvingDirectly()" (onClick)="confirmApproveDirectly()"></p-button>
            </span>
          }
          <span [pTooltip]="hasItems() ? null : ('quotations.sendDisabledHint' | translate)" tooltipPosition="top">
            <p-button [label]="'quotations.send' | translate" icon="pi pi-send"
                      [disabled]="!hasItems()" [loading]="sending()" (onClick)="sendQuotation()"></p-button>
          </span>
        }
      </app-page-header>

      @if (loading()) {
        <div class="bg-app-bg rounded-md border border-app-border p-5 space-y-5">
          <div class="rounded-md border border-app-border bg-app-surface p-4 space-y-3">
            <p-skeleton height="0.875rem" width="10rem"></p-skeleton>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <p-skeleton height="2.25rem"></p-skeleton>
              <p-skeleton height="2.25rem"></p-skeleton>
              <p-skeleton height="2.25rem" class="sm:col-span-3"></p-skeleton>
            </div>
          </div>
          <p-skeleton height="9rem"></p-skeleton>
        </div>
      } @else if (ready(); as q) {
        <div class="bg-app-bg rounded-md border border-app-border p-5 space-y-5">
          <section class="rounded-md border border-app-border bg-app-surface p-4 space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-semibold text-app-text">{{ 'quotations.sectionConditions' | translate }}</h3>
              @if (!editingConditions()) {
                <p-button [label]="'quotations.editConditions' | translate" icon="pi pi-pencil" [text]="true" size="small"
                          (onClick)="startEditConditions()"></p-button>
              }
            </div>

            @if (!editingConditions()) {
              <dl class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div>
                  <dt class="text-app-text-tertiary text-xs">{{ 'quotations.validUntil' | translate }}</dt>
                  <dd class="text-app-text">{{ q.validUntil | date:'mediumDate' }}</dd>
                </div>
                <div class="sm:col-span-3">
                  <dt class="text-app-text-tertiary text-xs">{{ 'quotations.observationsLabel' | translate }}</dt>
                  <dd class="text-app-text whitespace-pre-line">{{ q.terms || '—' }}</dd>
                </div>
              </dl>
            } @else {
              <form [formGroup]="conditionsForm" (ngSubmit)="saveConditions()" class="space-y-3">
                <div>
                  <label class="label">{{ 'quotations.validUntil' | translate }} *</label>
                  <p-datepicker formControlName="validUntil" dateFormat="dd/mm/yy" appendTo="body" fluid [minDate]="today()"></p-datepicker>
                  <p class="text-xs text-app-text-tertiary mt-1">{{ 'quotations.validUntilHelp' | translate }}</p>
                </div>
                <div>
                  <label class="label">{{ 'quotations.observationsLabel' | translate }}</label>
                  <textarea formControlName="terms" rows="2" class="w-full rounded border border-app-border p-2 text-sm"
                            [placeholder]="'quotations.observationsPlaceholder' | translate" pTextarea></textarea>
                </div>
                <div class="flex justify-end gap-2">
                  <p-button type="button" [label]="'common.close' | translate" [outlined]="true" (onClick)="cancelEditConditions()"></p-button>
                  <p-button type="submit" [label]="'common.save' | translate" icon="pi pi-check"
                            [loading]="savingConditions()" [disabled]="conditionsForm.invalid"></p-button>
                </div>
              </form>
            }
          </section>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="space-y-2 min-w-0">
              <h3 class="text-sm font-semibold text-app-text">{{ 'quotations.addItem' | translate }}</h3>
              <div class="flex flex-wrap items-center gap-x-2 gap-y-3 min-w-0">
                <p-select [options]="services()" [ngModel]="selectedServiceId()" (ngModelChange)="onServiceChange($event)"
                          optionLabel="name" optionValue="id"
                          [filter]="true" filterBy="name" appendTo="body" class="flex-1 min-w-[10rem]" [disabled]="addingItem()"
                          [loading]="servicesLoading()" [placeholder]="'quotations.selectService' | translate"
                          [emptyMessage]="'quotations.noServicesAvailable' | translate"
                          [emptyFilterMessage]="'quotations.noServiceResults' | translate">
                  <ng-template #item let-s>
                    <div class="flex flex-col py-0.5">
                      <span class="text-sm text-app-text">{{ s.name }}</span>
                      @if (categoryName(s.categoryId); as catName) {
                        <span class="text-xs text-app-text-tertiary">{{ catName }}</span>
                      }
                    </div>
                  </ng-template>
                </p-select>

                @if (quantityConfig(); as cfg) {
                  @if (cfg.fixed) {
                    <span class="shrink-0 inline-flex items-center px-3 h-[2.5rem] text-sm text-app-text-secondary border border-app-border rounded bg-app-surface">
                      {{ 'quotations.fixedQuantityHint' | translate }}
                    </span>
                  } @else {
                    <p-inputNumber [ngModel]="itemQuantity()" (ngModelChange)="itemQuantity.set($event ?? cfg.min)"
                                    mode="decimal" [minFractionDigits]="cfg.decimals" [maxFractionDigits]="cfg.decimals"
                                    [min]="cfg.min" [step]="cfg.step" [suffix]="' ' + unitLabel(selectedService()!.priceType)"
                                    class="shrink-0" inputStyleClass="w-24" [disabled]="addingItem()"></p-inputNumber>
                  }
                }
                <p-button [label]="'common.add' | translate" icon="pi pi-plus" class="shrink-0" [disabled]="!canAddItem()"
                          [loading]="addingItem()" (onClick)="addItem()"></p-button>
              </div>
              @if (selectedService(); as svc) {
                @if (svc.price != null && svc.currency) {
                  <p class="text-xs text-app-text-tertiary">
                    {{ 'quotations.unitPriceHint' | translate }}:
                    {{ svc.price | currency:svc.currency }}{{ unitLabel(svc.priceType) ? '/' + unitLabel(svc.priceType) : '' }}
                  </p>
                }
              }
            </div>

            <div class="bg-app-surface p-4 rounded border border-app-border space-y-2">
              @if (itemDiscountEnabled()) {
                <div class="flex justify-between text-sm text-app-text">
                  <span>{{ 'quotations.itemsGrossSubtotal' | translate }}</span>
                  <span>{{ quotationItemsGrossSubtotal(q.items) | currency:q.currency }}</span>
                </div>
                @if (quotationItemsDiscountTotal(q.items) > 0) {
                  <div class="flex justify-between text-sm text-app-text">
                    <span>{{ 'quotations.itemsDiscountTotal' | translate }}</span>
                    <span>-{{ quotationItemsDiscountTotal(q.items) | currency:q.currency }}</span>
                  </div>
                }
                @if (totalDiscountEnabled()) {
                  <div class="flex justify-between text-sm text-app-text">
                    <span>{{ 'quotations.subtotalAfterItemDiscounts' | translate }}</span>
                    <span>{{ q.subtotal | currency:q.currency }}</span>
                  </div>
                }
              } @else {
                <div class="flex justify-between text-sm text-app-text">
                  <span>{{ 'quotations.subtotal' | translate }}</span>
                  <span>{{ q.subtotal | currency:q.currency }}</span>
                </div>
              }

              @if (totalDiscountEnabled()) {
                <div class="flex items-center justify-between gap-2 text-sm text-app-text">
                  <span>{{ 'quotations.totalDiscountLabel' | translate }}</span>
                  <div class="flex items-center gap-1.5">
                    <p-selectbutton [options]="discountTypeOptions(q.currency)" optionLabel="label" optionValue="value"
                                     [ngModel]="q.discountType" [allowEmpty]="false"
                                     [disabled]="savingTotalDiscount()"
                                     (ngModelChange)="onTotalDiscountTypeChange($event)"></p-selectbutton>
                    <p-inputnumber [ngModel]="q.discountValue" inputStyleClass="w-18" [size]="'small'"
                                    [disabled]="savingTotalDiscount()" [min]="0"
                                    [max]="q.discountType === 'PERCENTAGE' ? 100 : null"
                                    [maxFractionDigits]="2"
                                    (onInput)="pendingTotalDiscountValue = $event.value ?? 0"
                                    (onBlur)="onTotalDiscountValueChange()"></p-inputnumber>
                  </div>
                </div>
                @if (q.discountAmount > 0) {
                  <p class="text-xs text-app-text-tertiary text-right">
                    -{{ q.discountAmount | currency:q.currency }} ({{ quotationDiscountPercent(q) | number:'1.0-1' }}%)
                  </p>
                }
              } @else if (q.discountAmount > 0) {
                <div class="flex justify-between text-sm text-app-text">
                  <span>{{ 'quotations.discount' | translate }}</span>
                  <span>{{ q.discountAmount | currency:q.currency }}</span>
                </div>
              }

              @if (hasItems()) {
                <div class="flex items-center justify-between gap-2 text-sm text-app-text border-t border-app-border pt-2">
                  <span>{{ 'quotations.paymentConditionLabel' | translate }}</span>
                  <p-select [options]="paymentConditionOptions()" [ngModel]="selectedPaymentCondition()" optionLabel="label" optionValue="value"
                            appendTo="body" [disabled]="savingPaymentMethod()"
                            [placeholder]="'quotations.paymentConditionPlaceholder' | translate"
                            (ngModelChange)="onPaymentConditionChange($event)"></p-select>
                </div>
                @if (selectedPaymentCondition(); as condition) {
                  <div class="flex items-center justify-between gap-2 text-sm text-app-text">
                    <span>{{ 'quotations.paymentMethodLabel' | translate }}</span>
                    @if (paymentMethodOptionsForCondition(condition).length) {
                      <p-select [options]="paymentMethodOptionsForCondition(condition)" [ngModel]="displayedPaymentMethod()" optionLabel="label" optionValue="value"
                                appendTo="body" [disabled]="savingPaymentMethod()"
                                [placeholder]="'quotations.paymentMethodPlaceholder' | translate"
                                (ngModelChange)="onPaymentMethodChange($event)"></p-select>
                    } @else {
                      <span class="text-xs text-app-danger text-right">{{ 'quotations.paymentMethodEmptyForCondition' | translate }}</span>
                    }
                  </div>
                }
                @if (selectedPaymentCondition() === 'DEFERRED' && (displayedPaymentMethod() === 'CREDIT_CARD' || showInstallmentPicker())) {
                  <div class="flex items-center justify-between gap-2 text-sm text-app-text">
                    <span>{{ 'quotations.installmentsLabel' | translate }}</span>
                    <p-select [options]="installmentOptions()" [ngModel]="q.installments" optionLabel="label" optionValue="value"
                              appendTo="body" [disabled]="savingPaymentMethod() || !installmentOptions().length"
                              [placeholder]="'quotations.installmentsPlaceholder' | translate"
                              (ngModelChange)="onInstallmentsChange($event)"></p-select>
                  </div>
                  @if (!installmentOptions().length) {
                    <p class="text-xs text-app-danger text-right">{{ 'quotations.installmentsNotConfigured' | translate }}</p>
                  }
                }
                @if (q.paymentMethod && q.interestAmount > 0) {
                  <div class="flex justify-between text-sm text-app-text">
                    <span>{{ 'quotations.amountBeforeInterest' | translate }}</span>
                    <span>{{ q.amountBeforeInterest | currency:q.currency }}</span>
                  </div>
                  <div class="flex justify-between text-sm text-app-text">
                    <span>{{ 'quotations.interestAmount' | translate: { percentage: q.paymentMethodInterestPercentage } }}</span>
                    <span>+{{ q.interestAmount | currency:q.currency }}</span>
                  </div>
                }
              }

              <div class="flex justify-between text-base font-bold text-app-text border-t border-app-border pt-2">
                <span>{{ 'quotations.total' | translate }}</span>
                <span>{{ q.total | currency:q.currency }}</span>
              </div>

              @if (showParamsHint()) {
                <div class="flex items-start gap-2 border-t border-app-border pt-2 text-xs text-app-text-secondary">
                  <i class="pi pi-sliders-v mt-0.5 text-app-text-tertiary" aria-hidden="true"></i>
                  <p class="min-w-0 flex-1">
                    {{ 'quotations.paramsHint.text' | translate }}
                    <a routerLink="/administration/system-parameters" class="font-medium text-app-accent-hover hover:underline">{{ 'quotations.paramsHint.link' | translate }}</a>
                  </p>
                  <button type="button" (click)="dismissParamsHint()" class="p-0.5 text-app-text-tertiary hover:text-app-text"
                          [attr.aria-label]="'quotations.paramsHint.dismiss' | translate">
                    <i class="pi pi-times text-[10px]" aria-hidden="true"></i>
                  </button>
                </div>
              }
            </div>
          </div>

          <div class="overflow-x-auto min-w-0">
            <p-table [value]="q.items" class="p-datatable-sm" [rowHover]="true">
              <ng-template pTemplate="header">
                <tr>
                  <th>{{ 'common.name' | translate }}</th>
                  <th>{{ 'quotations.quantity' | translate }}</th>
                  <th>{{ 'quotations.unitPrice' | translate }}</th>
                  <th>{{ 'quotations.subtotalBeforeDiscount' | translate }}</th>
                  <th class="min-w-[13rem]">{{ 'quotations.discount' | translate }}</th>
                  <th>{{ 'quotations.lineTotal' | translate }}</th>
                  <th class="text-right w-12">{{ 'common.actions' | translate }}</th>
                </tr>
              </ng-template>
              <ng-template pTemplate="body" let-item>
                <tr class="group">
                  <td>
                    <div class="flex flex-col">
                      <span>{{ item.description }}</span>
                      @if (categoryNameForService(item.serviceId); as catName) {
                        <span class="text-xs text-app-text-tertiary">{{ catName }}</span>
                      }
                    </div>
                  </td>
                  <td class="whitespace-nowrap">{{ quantityDisplay(item) }}</td>
                  <td class="whitespace-nowrap">{{ item.unitPrice | currency:q.currency }}{{ unitLabel(item.priceType) ? '/' + unitLabel(item.priceType) : '' }}</td>
                  <td class="whitespace-nowrap">{{ itemGrossAmount(item) | currency:q.currency }}</td>
                  <td>
                    @if (itemDiscountEnabled()) {
                      <div class="flex items-center gap-1.5">
                        <p-selectbutton [options]="discountTypeOptions(q.currency)" optionLabel="label" optionValue="value"
                                         [ngModel]="item.discountType" [allowEmpty]="false"
                                         [disabled]="savingDiscountItemId() === item.id"
                                         (ngModelChange)="onDiscountTypeChange(item, $event)"></p-selectbutton>
                        <p-inputnumber [ngModel]="item.discountValue" inputStyleClass="w-20" [size]="'small'"
                                        [disabled]="savingDiscountItemId() === item.id" [min]="0"
                                        [max]="item.discountType === 'PERCENTAGE' ? 100 : null"
                                        [maxFractionDigits]="2"
                                        (onInput)="pendingItemDiscountValue.set(item.id, $event.value ?? 0)"
                                        (onBlur)="onDiscountValueChange(item)"></p-inputnumber>
                      </div>
                      @if (item.discountAmount > 0) {
                        <p class="text-xs text-app-text-tertiary mt-1">
                          -{{ item.discountAmount | currency:q.currency }} ({{ itemDiscountPercent(item) | number:'1.0-1' }}%)
                        </p>
                      }
                    } @else if (item.discountAmount > 0) {
                      <span class="text-app-text">{{ item.discountAmount | currency:q.currency }}</span>
                      <span class="text-app-text-tertiary text-xs">({{ itemDiscountPercent(item) | number:'1.0-1' }}%)</span>
                    } @else {
                      <span class="text-app-text-tertiary">—</span>
                    }
                  </td>
                  <td class="whitespace-nowrap font-medium">{{ item.lineTotal | currency:q.currency }}</td>
                  <td class="text-right whitespace-nowrap">
                    <span>
                      <p-button icon="pi pi-trash" [text]="true" size="small" severity="danger"
                                [loading]="removingItemId() === item.id" (onClick)="removeItem(item)"></p-button>
                    </span>
                  </td>
                </tr>
              </ng-template>
              <ng-template pTemplate="emptymessage">
                <tr>
                  <td colspan="7" class="text-center text-sm text-app-text-tertiary py-6">
                    {{ 'quotations.noItemsYet' | translate }}
                  </td>
                </tr>
              </ng-template>
            </p-table>
          </div>

          <!-- AGENDAMENTO POR MODO DE EXECUÇÃO (issue #177) -->
          @if (executionModeGroups().length) {
            <section class="rounded-md border border-app-border bg-app-surface p-4 space-y-4">
              <div>
                <h3 class="text-sm font-semibold text-app-text">{{ 'quotations.schedule.title' | translate }}</h3>
                <p class="text-xs text-app-text-tertiary">{{ 'quotations.schedule.hint' | translate }}</p>
              </div>

              @for (group of executionModeGroups(); track group) {
                <div class="border border-app-border rounded p-3 space-y-3">
                  <div class="flex items-center justify-between gap-3 flex-wrap">
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-medium text-app-text">
                        {{ ('catalog.services.executionMode' + group) | translate }}
                      </span>
                      <span class="text-xs text-app-text-tertiary">
                        {{ 'quotations.schedule.groupDuration' | translate: { duration: (groupDurationMinutes(group) | durationMinutes) } }}
                      </span>
                    </div>
                    <p-button [label]="'quotations.schedule.loadSuggestions' | translate" icon="pi pi-search"
                              size="small" [outlined]="true" [loading]="loadingSuggestionsFor() === group"
                              (onClick)="loadSuggestions(group)" />
                  </div>

                  @if (chosenSchedulesFor(group).length) {
                    <div class="space-y-2">
                      @for (chosen of chosenSchedulesFor(group); track chosen.sequence; let first = $first) {
                        <div class="flex items-center gap-2 text-sm text-app-text bg-app-surface-hover rounded px-3 py-2">
                          <i class="pi pi-check-circle text-app-success"></i>
                          @if (chosenSchedulesFor(group).length > 1) {
                            <span class="text-xs font-semibold text-app-text-tertiary shrink-0">
                              {{ 'quotations.schedule.split.visit' | translate: { n: chosen.sequence } }}
                            </span>
                          }
                          <span>{{ technicianNamesLabel(chosen.technicianNames) }}</span>
                          <span class="text-app-text-secondary">
                            {{ 'common.estimatedArrival' | translate }}: {{ chosen.scheduledStartAt | localizedDate:'datetime':tenantTimezone() }}
                            <span class="text-app-text-tertiary">· {{ 'common.estimatedDuration' | translate: { duration: (scheduleDurationMinutes(chosen.scheduledStartAt, chosen.scheduledEndAt) | durationMinutes) } }}</span>
                          </span>
                          @if (!chosen.routeId) {
                            <span class="text-xs text-app-text-tertiary">{{ 'quotations.schedule.newRoute' | translate }}</span>
                          }
                          @if (first) {
                            <p-button icon="pi pi-times" [text]="true" size="small" severity="danger" class="ml-auto"
                                      [pTooltip]="(chosenSchedulesFor(group).length > 1 ? 'quotations.schedule.split.cancelBoth' : 'quotations.schedule.cancel') | translate"
                                      tooltipPosition="top"
                                      [loading]="cancelingScheduleFor() === group" (onClick)="confirmCancelSchedule(group)"></p-button>
                          }
                        </div>
                      }
                    </div>
                  }

                  @if (suggestionsFor() === group) {
                    @if (splitProposal(); as proposal) {
                      @if (!proposal.splitPossible) {
                        <div class="space-y-3">
                          <div class="text-sm text-app-text bg-app-surface-hover rounded px-3 py-2">
                            {{ 'quotations.schedule.joint.intro' | translate: { required: (proposal.requiredMinutes | durationMinutes) } }}
                          </div>

<app-team-schedule-picker [source]="teamSourceFor(group)" [saving]="savingSchedule()"
                                                    [tenantTimezone]="tenantTimezone()" (choose)="onTeamChosen(group, $event)" />
                        </div>
                      } @else if (!splitStrategy()) {
                        <div class="space-y-3">
                          <div class="text-sm text-app-text bg-app-surface-hover rounded px-3 py-2">
                            {{ 'quotations.schedule.split.warning' | translate: {
                              required: (proposal.requiredMinutes | durationMinutes),
                              max: (proposal.maxSingleWindowMinutes | durationMinutes)
                            } }}
                          </div>
                          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <button type="button"
                                    class="text-left border border-app-border rounded p-3 hover:border-app-accent transition-colors"
                                    (click)="chooseSplitStrategy(group, 'SAME')">
                              <div class="font-medium text-sm text-app-text">{{ 'quotations.schedule.split.optionSameTechnician' | translate }}</div>
                              <div class="text-xs text-app-text-tertiary mt-1">{{ 'quotations.schedule.split.optionSameTechnicianHint' | translate }}</div>
                            </button>
                            <button type="button"
                                    class="text-left border border-app-border rounded p-3 hover:border-app-accent transition-colors"
                                    (click)="chooseSplitStrategy(group, 'TWO')">
                              <div class="font-medium text-sm text-app-text">{{ 'quotations.schedule.split.optionTwoTechnicians' | translate }}</div>
                              <div class="text-xs text-app-text-tertiary mt-1">{{ 'quotations.schedule.split.optionTwoTechniciansHint' | translate }}</div>
                            </button>
                          </div>
                        </div>
                      } @else {
                        <div class="space-y-3">
                          <p-button [label]="'common.back' | translate" icon="pi pi-arrow-left" [text]="true" size="small"
                                    (onClick)="backToSplitOptions()" />

                          @for (visit of proposal.visits; track $index) {
                            @if ($index === 0 || splitVisitsChosen()[$index - 1]) {
                              <div class="space-y-1.5">
                                <div class="text-xs font-semibold text-app-text-tertiary">{{ 'quotations.schedule.split.visit' | translate: { n: $index + 1 } }}</div>
                                @if (splitVisitsChosen()[$index]; as v) {
                                  <div class="flex items-center gap-2 text-sm text-app-text bg-app-surface-hover rounded px-3 py-2">
                                    <i class="pi pi-check-circle text-app-success"></i>
                                    <span>{{ v.technicianName ?? '—' }}</span>
                                    <span class="text-app-text-secondary">{{ v.startAt | localizedDate:'datetime':tenantTimezone() }}</span>
                                  </div>
                                } @else {
                                  <app-slot-candidate-table [candidates]="splitStepSlotCandidates()" [choosing]="loadingSplitStep()"
                                                            [emptyMessage]="'quotations.schedule.noSuggestions' | translate"
                                                            (choose)="onChooseSplitVisit($index, $event)" />
                                }
                              </div>
                            }
                          }

                          @if (allSplitVisitsChosen()) {
                            <p-button [label]="'quotations.schedule.split.confirm' | translate" icon="pi pi-check"
                                      [loading]="savingSchedule()" (onClick)="confirmSplit(group)" />
                          }
                        </div>
                      }
                    } @else if (teamOpenFor() === group) {
                      <div class="space-y-3">
                        <div class="flex items-center justify-between">
                          <span class="text-sm font-medium text-app-text">{{ 'orders.schedule.joint.title' | translate }}</span>
                          <p-button [label]="'common.back' | translate" icon="pi pi-arrow-left" [text]="true" size="small"
                                    (onClick)="teamOpenFor.set(null)" />
                        </div>
                        <p class="text-xs text-app-text-tertiary">
                          {{ (suggestions().length === 0 ? 'orders.schedule.joint.noSingleTechnician' : 'orders.schedule.joint.intro') | translate }}
                        </p>
                        <app-team-schedule-picker [source]="teamSourceFor(group)" [saving]="savingSchedule()"
                                                  [tenantTimezone]="tenantTimezone()" (choose)="onTeamChosen(group, $event)" />
                      </div>
                    } @else {
                      <app-slot-candidate-table [candidates]="candidates()" [choosing]="savingSchedule()"
                                                [emptyMessage]="'quotations.schedule.noSuggestions' | translate"
                                                [allowCustomTime]="true"
                                                [customTimeLabel]="'quotations.schedule.pickCustomTime' | translate"
                                                [customTimeSearchLabel]="'quotations.schedule.search' | translate"
                                                [customTimePlaceholder]="'quotations.schedule.customTimePlaceholder' | translate"
                                                [customTimeEmptyMessage]="'quotations.schedule.noSuggestionsAtTime' | translate"
                                                [clearLabel]="'common.clear' | translate"
                                                [confirmLabel]="'common.confirm' | translate"
                                                [minDate]="today()" [tenantTimezone]="tenantTimezone()"
                                                [customTimeCandidates]="customTimeSlotCandidates()"
                                                [customTimeSearching]="loadingCustomTime()"
                                                [customTimeSearched]="customTimeSearched()"
                                                (choose)="onChooseCandidate(group, $event)"
                                                (customTimeSearch)="searchCustomTime(group, $event)"
                                                (customTimeClose)="resetCustomTimeState()" />
                      <div class="flex items-center justify-between gap-3 flex-wrap border-t border-app-border-subtle pt-3">
                        <span class="text-xs text-app-text-tertiary">{{ 'orders.schedule.joint.hint' | translate }}</span>
                        <p-button [label]="'orders.schedule.joint.open' | translate" icon="pi pi-users" size="small"
                                  [outlined]="true" (onClick)="teamOpenFor.set(group)" />
                      </div>
                    }
                  }
                </div>
              }
            </section>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    @reference "../../../../styles.css";
    .label { @apply block text-[11px] font-medium text-app-text-secondary mb-1.5; }
  `],
})
export class QuotationEditComponent implements OnInit {
  private quotationService = inject(QuotationService);
  private customerService = inject(CustomerService);
  private serviceService = inject(ServiceService);
  private serviceCategoryService = inject(ServiceCategoryService);
  private tenantService = inject(TenantService);
  private paymentMethodService = inject(PaymentMethodService);
  private confirmationService = inject(ConfirmationService);
  private messageService = inject(MessageService);
  private translate = inject(TranslateService);
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  /** "Hoje" no fuso do tenant, não no do browser — ver {@link zonedNow}. */
  today = computed(() => zonedNow(this.tenantTimezone()));

  loading = signal(true);
  current = signal<Quotation | null>(null);
  /** Só não-nulo quando o carregamento inicial terminou — a guarda que o template usa para
   *  decidir entre skeleton e conteúdo real, e para liberar as ações do cabeçalho (badge, enviar). */
  ready = computed(() => (this.loading() ? null : this.current()));
  customerName = signal('');
  hasItems = computed(() => (this.current()?.items.length ?? 0) > 0);

  services = signal<CatalogService[]>([]);
  servicesById = computed(() => new Map(this.services().map(s => [s.id, s])));
  servicesLoading = signal(false);
  selectedServiceId = signal<string | null>(null);
  selectedService = computed(() => this.services().find(s => s.id === this.selectedServiceId()) ?? null);
  /** Nome da categoria por id — só para o subtítulo do serviço no seletor e na lista de itens
   *  (contexto visual, não persistido: o item do orçamento não guarda categoria própria). */
  private categoryNamesById = signal<Map<string, string>>(new Map());
  quantityConfig = computed(() => {
    const svc = this.selectedService();
    return svc ? priceTypeQuantityConfig(svc.priceType) : null;
  });
  itemQuantity = signal(1);
  canAddItem = computed(() => {
    const svc = this.selectedService();
    if (!svc) return false;
    const cfg = this.quantityConfig()!;
    return cfg.fixed || this.itemQuantity() > 0;
  });
  addingItem = signal(false);
  removingItemId = signal<string | null>(null);
  savingDiscountItemId = signal<string | null>(null);
  savingTotalDiscount = signal(false);
  pendingTotalDiscountValue = 0;
  pendingItemDiscountValue = new Map<string, number>();

  /** Combinações condição+meio habilitadas pelo tenant (reestruturação de Formas de Pagamento) —
   *  só estas aparecem nos seletores em cascata; o backend recusa qualquer outra. */
  enabledConditionMethods = signal<PaymentConditionMethodSetting[] | null>(null);
  paymentConditionOptions = computed(() =>
    PAYMENT_CONDITIONS
      .filter(c => (this.enabledConditionMethods() ?? []).some(s => s.condition === c))
      .map(c => ({ label: this.conditionLabel(c), value: c })));
  paymentMethodOptionsForCondition(condition: PaymentCondition): { label: string; value: PaymentMethod }[] {
    return (this.enabledConditionMethods() ?? [])
      .filter(s => s.condition === condition)
      .map(s => ({ label: this.methodLabel(s.method), value: s.method }));
  }
  /** Condição escolhida na tela — fonte de verdade do seletor em cascata, distinta de
   *  `current().paymentCondition` (persistido) enquanto o usuário troca a condição mas ainda não
   *  escolheu um meio dela (o backend exige as duas juntas — não dá pra persistir só a condição). */
  selectedPaymentCondition = signal<PaymentCondition | null>(null);
  /** Meio mostrado no seletor: o persistido quando a condição escolhida ainda é a mesma que já
   *  estava salva; `null` (seletor limpo) assim que o usuário troca de condição, para nunca
   *  mostrar pré-selecionado um meio que pode nem pertencer à condição nova. */
  displayedPaymentMethod = computed<PaymentMethod | null>(() => {
    const q = this.current();
    if (!q) return null;
    return this.selectedPaymentCondition() === q.paymentCondition ? q.paymentMethod : null;
  });
  savingPaymentMethod = signal(false);

  /** Faixas de parcelamento do tenant (reestruturação de Formas de Pagamento — parcelamento),
   *  carregadas sob demanda na primeira vez que cartão de crédito é escolhido. */
  creditCardInstallmentPlan = signal<CreditCardInstallmentPlan | null>(null);
  private creditCardPlanRequested = false;
  /** `true` só entre escolher "Cartão de crédito" no seletor e escolher a quantidade de
   *  parcelas — o backend não grava a forma de pagamento sem parcelas, então o seletor de
   *  parcelas precisa aparecer mesmo antes de `q.paymentMethod` ter mudado. */
  showInstallmentPicker = signal(false);
  /** Mesma função usada pelo diálogo de criação de orçamento (quotations.component.ts) — as duas
   *  telas têm de mostrar exatamente as mesmas opções de parcela para o mesmo plano do tenant. */
  installmentOptions = computed(() => buildInstallmentOptions(this.creditCardInstallmentPlan(), this.translate));

  /** Parâmetros do Sistema do tenant (Perfil → Parâmetros do Sistema) — governa quais modalidades
   *  de desconto a UI oferece (CLAUDE.md §7). Fallback replica o default de novo tenant enquanto
   *  a busca não termina, evitando o flash da UI errada. */
  private systemParams = signal<TenantSystemParameters | null>(null);
  private discovery = inject(SystemParamsDiscoveryService);
  showParamsHint = this.discovery.showQuotationHint;
  dismissParamsHint(): void { this.discovery.dismissHint(); }
  totalDiscountEnabled = computed(() => this.systemParams()?.totalDiscountEnabled ?? true);
  itemDiscountEnabled = computed(() => this.systemParams()?.itemDiscountEnabled ?? false);
  directQuotationApprovalEnabled = computed(() => this.systemParams()?.directQuotationApprovalEnabled ?? true);

  // ── Agendamento por modo de execução (issue #177) ────────────────────────────────
  /** Grupos presentes no orçamento — um agendamento por grupo, tal como há uma ordem por grupo. */
  executionModeGroups = computed<ExecutionMode[]>(() => {
    const items = this.current()?.items ?? [];
    return [...new Set(items.map(i => i.executionMode))];
  });
  suggestions = signal<ScheduleSuggestion[]>([]);
  candidates = computed<SlotCandidate[]>(() => this.suggestions().map(s => this.toSlotCandidate(s)));
  /** Para que grupo é a lista atualmente mostrada — sem isto, abrir um grupo mostraria as
   *  sugestões do outro. */
  suggestionsFor = signal<ExecutionMode | null>(null);
  loadingSuggestionsFor = signal<ExecutionMode | null>(null);
  savingSchedule = signal(false);
  cancelingScheduleFor = signal<ExecutionMode | null>(null);
  schedules = signal<QuotationSchedule[]>([]);

  // ── "Escolher outra data e horário" (nenhuma sugestão automática serviu) ─────────
  customTimeCandidates = signal<ScheduleSuggestion[]>([]);
  customTimeSlotCandidates = computed<SlotCandidate[]>(() => this.customTimeCandidates().map(s => this.toSlotCandidate(s)));
  loadingCustomTime = signal(false);
  customTimeSearched = signal(false);

  // ── Split de atendimento (grupo que não cabe numa única janela de nenhum técnico) ─
  /** Preenchido quando o grupo atualmente aberto (`suggestionsFor`) não cabe numa única janela —
   *  `null` significa "cabe normalmente", nunca "ainda não sabemos" (só é lido depois de
   *  `loadSuggestions` resolver). */
  splitProposal = signal<SplitProposal | null>(null);
  splitStrategy = signal<SplitStrategy | null>(null);
  /** Uma entrada por visita de `splitProposal().visits` (N, não só 2) — `null` enquanto essa
   *  visita ainda não foi escolhida. Preenchida sequencialmente: a visita `i` só é buscada depois
   *  de `i-1` estar escolhida. */
  splitVisitsChosen = signal<(ScheduleSuggestion | null)[]>([]);
  allSplitVisitsChosen = computed(() => {
    const list = this.splitVisitsChosen();
    return list.length > 0 && list.every(v => v !== null);
  });
  splitStepCandidates = signal<ScheduleSuggestion[]>([]);
  splitStepSlotCandidates = computed<SlotCandidate[]>(() => this.splitStepCandidates().map(s => this.toSlotCandidate(s)));
  loadingSplitStep = signal(false);
  /** Fuso do tenant (não o do browser): slots sugeridos são hora local do técnico em campo,
   *  não do dispositivo de quem está a agendar (pode ser noutro país/fuso). */
  tenantTimezone = signal<string | null>(null);

  // ── Atendimento com mais de um técnico (serviço grande demais para um só, ou sem técnico livre) ──
  /** Grupo cujo painel de equipes está aberto — o sistema propõe equipes e horários, ver
   *  {@link TeamSchedulePickerComponent}. */
  teamOpenFor = signal<ExecutionMode | null>(null);

  editingConditions = signal(false);
  savingConditions = signal(false);
  sending = signal(false);
  approvingDirectly = signal(false);

  conditionsForm = this.fb.group({
    validUntil: [new Date(), Validators.required],
    terms: [''],
  });

  constructor() {
    // Limpar sugestões joint quando itens do orçamento mudam (skills requeridas mudam)
    effect(() => {
      const itemCount = this.current()?.items.length ?? 0;
      if (itemCount > 0) {
        this.resetJointState();
      }
    });
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.quotationService.get(id).subscribe({
      next: q => {
        if (q.status !== 'DRAFT') {
          // replaceUrl: sem isto, esta rota fica no histórico como entrada própria — o botão
          // "voltar" do detalhe bate aqui de novo e re-redireciona pra frente, parecendo travado.
          this.router.navigate(['/quotations', q.id], { replaceUrl: true });
          return;
        }
        this.current.set(q);
        this.loading.set(false);
        this.selectedPaymentCondition.set(q.paymentCondition);
        if (q.paymentCondition === 'DEFERRED' && q.paymentMethod === 'CREDIT_CARD') {
          this.loadCreditCardInstallmentPlan();
        }
        this.customerService.get(q.customerId).subscribe(c => this.customerName.set(c.name));
        this.quotationService.schedules(q.id).subscribe({
          next: s => this.schedules.set(s),
          error: () => { },
        });
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: this.translate.instant('quotations.notFound') });
        this.router.navigate(['/quotations']);
      },
    });
    this.servicesLoading.set(true);
    this.serviceService.list({ size: 100, active: true }).subscribe({
      next: s => { this.services.set(s.content); this.servicesLoading.set(false); },
      error: () => this.servicesLoading.set(false),
    });
    this.serviceCategoryService.list({ size: 100 }).subscribe({
      next: c => this.categoryNamesById.set(new Map(c.content.map(cat => [cat.id, cat.name]))),
      error: () => { },
    });
    this.tenantService.getMe().subscribe(t => {
      this.systemParams.set(t.systemParameters ?? null);
      if (t.timezone) this.tenantTimezone.set(t.timezone);
    });
    this.paymentMethodService.listEnabled().subscribe({
      next: settings => this.enabledConditionMethods.set(settings),
      error: () => { },
    });
  }

  conditionLabel(condition: PaymentCondition): string {
    return paymentConditionLabel(this.translate, condition);
  }

  methodLabel(method: PaymentMethod): string {
    return paymentMethodLabel(this.translate, method);
  }

  /** Troca de condição não persiste sozinha — o backend exige condição+meio juntos
   *  (`SetQuotationPaymentMethodUseCase`). Só limpa o seletor de meio (via {@link displayedPaymentMethod})
   *  e espera a próxima escolha. */
  onPaymentConditionChange(condition: PaymentCondition): void {
    this.selectedPaymentCondition.set(condition);
    this.showInstallmentPicker.set(false);
  }

  /** Cartão de crédito a prazo não persiste ao trocar o seletor — precisa da quantidade de
   *  parcelas primeiro (o backend recusa {@code CREDIT_CARD} sem ela nessa condição). As demais
   *  combinações persistem de imediato, como antes. */
  onPaymentMethodChange(method: PaymentMethod): void {
    const condition = this.selectedPaymentCondition();
    if (!condition) return;
    if (condition === 'DEFERRED' && method === 'CREDIT_CARD') {
      this.showInstallmentPicker.set(true);
      this.loadCreditCardInstallmentPlan();
      return;
    }
    this.showInstallmentPicker.set(false);
    this.persistPaymentMethod(condition, method, null);
  }

  onInstallmentsChange(installments: number): void {
    const condition = this.selectedPaymentCondition();
    if (!condition) return;
    this.persistPaymentMethod(condition, 'CREDIT_CARD', installments);
  }

  private loadCreditCardInstallmentPlan(): void {
    if (this.creditCardPlanRequested) return;
    this.creditCardPlanRequested = true;
    this.paymentMethodService.getCreditCardInstallmentPlan().subscribe({
      next: plan => this.creditCardInstallmentPlan.set(plan),
      error: () => { this.creditCardPlanRequested = false; },
    });
  }

  private persistPaymentMethod(condition: PaymentCondition, method: PaymentMethod, installments: number | null): void {
    const q = this.current();
    if (!q) return;
    this.savingPaymentMethod.set(true);
    this.quotationService.setPaymentMethod(q.id, condition, method, installments).subscribe({
      next: updated => {
        this.savingPaymentMethod.set(false);
        this.showInstallmentPicker.set(false);
        this.current.set(updated);
        this.selectedPaymentCondition.set(updated.paymentCondition);
      },
      error: () => {
        this.savingPaymentMethod.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('quotations.paymentMethodSaveError') });
      },
    });
  }

  /** Soma das durações congeladas das linhas do grupo (issue #172) — o que o quadro de
   *  disponibilidade tem de encaixar. A folga é resolvida no backend, contra o catálogo vivo. */
  groupDurationMinutes(group: ExecutionMode): number {
    return (this.current()?.items ?? [])
      .filter(i => i.executionMode === group)
      .reduce((total, i) => total + i.durationMinutes, 0);
  }

  /** Ordenadas por sequence — normalmente 1 entrada, 2 quando o grupo foi dividido em visitas
   *  (split de atendimento). */
  chosenSchedulesFor(group: ExecutionMode): QuotationSchedule[] {
    return this.schedules()
      .filter(s => s.executionMode === group)
      .sort((a, b) => a.sequence - b.sequence);
  }

  private toSlotCandidate(s: ScheduleSuggestion): SlotCandidate {
    return {
      technicianId: s.technicianUserId,
      technicianLabel: s.technicianName ?? '—',
      primaryText: formatLocalizedDate(s.startAt, this.translate.getCurrentLang(), 'weekdayDatetime', this.tenantTimezone()),
      secondaryText: (s.routeId
        ? this.translate.instant('quotations.schedule.existingRoute')
        : this.translate.instant('quotations.schedule.newRoute')) + ` · +${s.extraKm.toFixed(1)} km`,
      raw: s,
    };
  }

  private resetSplitState(): void {
    this.splitProposal.set(null);
    this.splitStrategy.set(null);
    this.splitVisitsChosen.set([]);
    this.splitStepCandidates.set([]);
    this.resetJointState();
  }

  private resetJointState(): void {
    this.teamOpenFor.set(null);
  }

  /** Equipe escolhida (sugestão ou montagem manual já validada): uma única escolha (sequence 1) com
   *  N technicianIds — todos os itens do grupo, mesma janela para todos (execução em paralelo). */
  onTeamChosen(group: ExecutionMode, choice: TeamScheduleChoice): void {
    const q = this.current();
    if (!q || !choice.technicianIds.length) return;

    const others = this.otherGroupChoices(group);
    const itemIds = q.items.filter(i => i.executionMode === group).map(i => i.id);

    this.savingSchedule.set(true);
    this.quotationService
      .setSchedules(q.id, [
        ...others,
        { executionMode: group, sequence: 1, itemIds, technicianIds: choice.technicianIds,
          scheduledStartAt: choice.startAt, scheduledEndAt: choice.endAt, routeId: null },
      ])
      .subscribe({
        next: saved => {
          this.savingSchedule.set(false);
          this.schedules.set(saved);
          this.suggestionsFor.set(null);
          this.resetSplitState();
          this.resetCustomTimeState();
          this.messageService.add({ severity: 'success', summary: this.translate.instant('quotations.schedule.saved') });
        },
        error: err => {
          this.savingSchedule.set(false);
          this.messageService.add({
            severity: 'error',
            summary: quotationErrorMessage(err, this.translate, 'quotations.schedule.saveError'),
          });
        },
      });
  }

  /** Um seletor de equipes por grupo, criado uma vez — o componente só conhece o grupo por estes
   *  três pontos de acesso, a regra de viabilidade é do backend. */
  teamSourceFor(group: ExecutionMode): TeamScheduleSource {
    let source = this.teamSources.get(group);
    if (!source) {
      const id = () => this.current()!.id;
      source = {
        suggest: days => this.quotationService.jointSuggestions(id(), group, days),
        eligible: () => this.quotationService.eligibleProviders(id(), group),
        check: (ids, startIso) => this.quotationService.jointCompatibility(id(), group, ids, startIso),
      };
      this.teamSources.set(group, source);
    }
    return source;
  }
  private readonly teamSources = new Map<ExecutionMode, TeamScheduleSource>();


  resetCustomTimeState(): void {
    this.customTimeCandidates.set([]);
    this.customTimeSearched.set(false);
    this.loadingCustomTime.set(false);
  }

  /** Busca de "Escolher outra data e horário": quais técnicos elegíveis conseguem exatamente o
   *  instante escolhido pelo utilizador — não é mais uma janela de dias, é a pergunta oposta
   *  (issue: sugestão automática não serviu, cliente já sabe quando quer). */
  searchCustomTime(group: ExecutionMode, at: Date): void {
    const q = this.current();
    if (!q) return;
    this.loadingCustomTime.set(true);
    this.customTimeSearched.set(false);
    const instant = zonedWallClockToInstant(at, this.tenantTimezone());
    this.quotationService.scheduleSuggestions(q.id, group, { at: instant.toISOString() }).subscribe({
      next: res => {
        this.loadingCustomTime.set(false);
        this.customTimeSearched.set(true);
        this.customTimeCandidates.set(res.candidates);
      },
      error: err => {
        this.loadingCustomTime.set(false);
        this.customTimeSearched.set(true);
        this.customTimeCandidates.set([]);
        this.messageService.add({
          severity: 'error',
          summary: quotationErrorMessage(err, this.translate, 'quotations.schedule.suggestionsError'),
        });
      },
    });
  }

  private itemIdsFor(mode: ExecutionMode, sequence: number): string[] {
    return (this.current()?.items ?? [])
      .filter(i => i.executionMode === mode && i.scheduleSequence === sequence)
      .map(i => i.id);
  }

  /** Escolhas já gravadas para todos os grupos MENOS `excludeGroup` — recompõe `itemIds` a partir
   *  dos itens atuais do orçamento (a resposta de `QuotationSchedule` não carrega itens). */
  private otherGroupChoices(excludeGroup: ExecutionMode) {
    return this.schedules()
      .filter(s => s.executionMode !== excludeGroup)
      .map(s => ({
        executionMode: s.executionMode,
        sequence: s.sequence,
        itemIds: this.itemIdsFor(s.executionMode, s.sequence),
        technicianIds: s.technicianIds,
        scheduledStartAt: s.scheduledStartAt,
        scheduledEndAt: s.scheduledEndAt,
        routeId: s.routeId,
      }));
  }

  loadSuggestions(group: ExecutionMode): void {
    const q = this.current();
    if (!q) return;
    this.loadingSuggestionsFor.set(group);
    this.resetSplitState();
    this.resetCustomTimeState();
    this.quotationService.scheduleSuggestions(q.id, group).subscribe({
      next: res => {
        this.loadingSuggestionsFor.set(null);
        this.suggestions.set(res.candidates);
        this.splitProposal.set(res.splitProposal);
        this.suggestionsFor.set(group);
        if (!res.splitProposal && res.candidates.length === 0) {
          // Ninguém sozinho no horizonte: já mostra as equipes possíveis em vez de um beco sem saída.
          this.teamOpenFor.set(group);
        }
      },
      error: err => {
        this.loadingSuggestionsFor.set(null);
        this.suggestions.set([]);
        this.splitProposal.set(null);
        this.suggestionsFor.set(group);
        this.messageService.add({
          severity: 'error',
          summary: quotationErrorMessage(err, this.translate, 'quotations.schedule.suggestionsError'),
        });
      },
    });
  }

  onChooseCandidate(group: ExecutionMode, candidate: SlotCandidate): void {
    this.chooseSlot(group, candidate.raw as ScheduleSuggestion);
  }

  /**
   * Grava a escolha do utilizador para o grupo inteiro, sem split (sequence 1, todos os itens do
   * modo). Não reserva nada: o slot é revalidado quando o orçamento for aprovado, e é por isso
   * que o painel diz "estimado" em vez de "confirmado". Também serve para desfazer um split
   * anterior — o backend remove a visita 2 órfã e devolve todos os itens do modo à sequence 1.
   */
  chooseSlot(group: ExecutionMode, suggestion: ScheduleSuggestion): void {
    const q = this.current();
    if (!q) return;
    const others = this.otherGroupChoices(group);
    const itemIds = q.items.filter(i => i.executionMode === group).map(i => i.id);

    this.savingSchedule.set(true);
    this.quotationService
      .setSchedules(q.id, [
        ...others,
        {
          executionMode: group,
          sequence: 1,
          itemIds,
          technicianIds: [suggestion.technicianUserId],
          scheduledStartAt: suggestion.startAt,
          scheduledEndAt: suggestion.endAt,
          routeId: suggestion.routeId,
        },
      ])
      .subscribe({
        next: saved => {
          this.savingSchedule.set(false);
          this.schedules.set(saved);
          this.suggestionsFor.set(null);
          this.resetSplitState();
          this.resetCustomTimeState();
          this.messageService.add({ severity: 'success', summary: this.translate.instant('quotations.schedule.saved') });
        },
        error: err => {
          this.savingSchedule.set(false);
          this.messageService.add({
            severity: 'error',
            summary: quotationErrorMessage(err, this.translate, 'quotations.schedule.saveError'),
          });
        },
      });
  }

  /** Usuário escolheu entre "mesmo prestador" e "prestadores diferentes" — busca a 1ª visita
   *  (índice 0). */
  chooseSplitStrategy(group: ExecutionMode, strategy: SplitStrategy): void {
    const proposal = this.splitProposal();
    this.splitStrategy.set(strategy);
    this.splitVisitsChosen.set((proposal?.visits ?? []).map(() => null));
    this.loadSplitVisitCandidates(group, 0);
  }

  backToSplitOptions(): void {
    this.splitStrategy.set(null);
    this.splitVisitsChosen.set([]);
    this.splitStepCandidates.set([]);
  }

  onChooseSplitVisit(index: number, candidate: SlotCandidate): void {
    const group = this.suggestionsFor();
    if (!group) return;
    const suggestion = candidate.raw as ScheduleSuggestion;
    this.splitVisitsChosen.update(list => list.map((v, i) => i === index ? suggestion : v));
    const nextIndex = index + 1;
    if (nextIndex < this.splitVisitsChosen().length) {
      this.loadSplitVisitCandidates(group, nextIndex);
    }
  }

  /**
   * Candidatos da visita `index` (0-based) — sem restrição de técnico na primeira (índice 0), ou
   * restrita conforme a estratégia a partir da 2ª: mesmo técnico que já ficou com a 1ª visita e só
   * depois do fim da visita anterior ("mesmo prestador", a mesma pessoa em todas as N visitas), ou
   * qualquer técnico menos o da visita imediatamente anterior ("prestadores diferentes" — o filtro
   * do backend só exclui um técnico por busca, então só garante que visitas consecutivas não
   * repetem o mesmo prestador, não as N inteiras).
   */
  private loadSplitVisitCandidates(group: ExecutionMode, index: number): void {
    const q = this.current();
    const proposal = this.splitProposal();
    const strategy = this.splitStrategy();
    const plan = proposal?.visits?.[index];
    if (!q || !strategy || !plan) return;

    const options: { itemIds: string[]; technicianId?: string; excludeTechnicianId?: string; notBefore?: string } = {
      itemIds: plan.itemIds,
    };
    if (index > 0) {
      const chosen = this.splitVisitsChosen();
      const previous = chosen[index - 1];
      const first = chosen[0];
      if (first && strategy === 'SAME') {
        options.technicianId = first.technicianUserId;
        options.notBefore = previous?.endAt;
      } else if (previous && strategy === 'TWO') {
        options.excludeTechnicianId = previous.technicianUserId;
      }
    }

    this.loadingSplitStep.set(true);
    this.splitStepCandidates.set([]);
    this.quotationService.scheduleSuggestions(q.id, group, options).subscribe({
      next: res => {
        this.loadingSplitStep.set(false);
        this.splitStepCandidates.set(res.candidates);
      },
      error: err => {
        this.loadingSplitStep.set(false);
        this.splitStepCandidates.set([]);
        this.messageService.add({
          severity: 'error',
          summary: quotationErrorMessage(err, this.translate, 'quotations.schedule.suggestionsError'),
        });
      },
    });
  }

  /** Grava as N visitas do split como N choices (sequence 1..N) do mesmo grupo. */
  confirmSplit(group: ExecutionMode): void {
    const q = this.current();
    const proposal = this.splitProposal();
    const chosen = this.splitVisitsChosen();
    if (!q || !proposal?.visits?.length || chosen.length !== proposal.visits.length || !this.allSplitVisitsChosen()) return;

    const others = this.otherGroupChoices(group);
    const visits = chosen.map((v, i) => {
      const suggestion = v as ScheduleSuggestion;
      return {
        executionMode: group, sequence: i + 1, itemIds: proposal.visits[i].itemIds,
        technicianIds: [suggestion.technicianUserId], scheduledStartAt: suggestion.startAt,
        scheduledEndAt: suggestion.endAt, routeId: suggestion.routeId,
      };
    });

    this.savingSchedule.set(true);
    this.quotationService
      .setSchedules(q.id, [...others, ...visits])
      .subscribe({
        next: saved => {
          this.savingSchedule.set(false);
          this.schedules.set(saved);
          this.suggestionsFor.set(null);
          this.resetSplitState();
          this.resetCustomTimeState();
          this.messageService.add({ severity: 'success', summary: this.translate.instant('quotations.schedule.saved') });
        },
        error: err => {
          this.savingSchedule.set(false);
          this.messageService.add({
            severity: 'error',
            summary: quotationErrorMessage(err, this.translate, 'quotations.schedule.saveError'),
          });
        },
      });
  }

  confirmCancelSchedule(group: ExecutionMode): void {
    this.confirmationService.confirm({
      message: this.translate.instant('quotations.schedule.cancelConfirm'),
      header: this.translate.instant('quotations.schedule.cancelConfirmTitle'),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.translate.instant('quotations.schedule.cancel'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => this.cancelSchedule(group),
    });
  }

  private cancelSchedule(group: ExecutionMode): void {
    const q = this.current();
    if (!q) return;
    this.cancelingScheduleFor.set(group);
    this.quotationService.cancelSchedule(q.id, group).subscribe({
      next: () => {
        this.cancelingScheduleFor.set(null);
        this.schedules.update(list => list.filter(s => s.executionMode !== group));
        if (this.suggestionsFor() === group) { this.resetSplitState(); this.resetCustomTimeState(); }
        this.messageService.add({ severity: 'success', summary: this.translate.instant('quotations.schedule.cancelled') });
      },
      error: err => {
        this.cancelingScheduleFor.set(null);
        this.messageService.add({
          severity: 'error',
          summary: quotationErrorMessage(err, this.translate, 'quotations.schedule.cancelError'),
        });
      },
    });
  }

  back(): void {
    this.router.navigate(['/quotations']);
  }

  readonly quotationStatusSeverity = quotationStatusSeverity;
  readonly formatQuotationNumber = formatQuotationNumber;
  readonly scheduleDurationMinutes = scheduleDurationMinutes;
  readonly technicianNamesLabel = technicianNamesLabel;
  readonly itemGrossAmount = itemGrossAmount;
  readonly itemDiscountPercent = itemDiscountPercent;
  readonly quotationItemsGrossSubtotal = quotationItemsGrossSubtotal;
  readonly quotationItemsDiscountTotal = quotationItemsDiscountTotal;
  readonly quotationDiscountPercent = quotationDiscountPercent;

  unitLabel(priceType: CatalogService['priceType']): string {
    const key = priceTypeUnitLabelKey(priceType);
    return key ? this.translate.instant(key) : '';
  }

  quantityDisplay(item: QuotationItem): string {
    const unit = this.unitLabel(item.priceType);
    return unit ? `${item.quantity} ${unit}` : `${item.quantity}`;
  }

  categoryName(categoryId: string | null | undefined): string | null {
    return categoryId ? (this.categoryNamesById().get(categoryId) ?? null) : null;
  }

  categoryNameForService(serviceId: string): string | null {
    return this.categoryName(this.servicesById().get(serviceId)?.categoryId);
  }

  discountTypeOptions(currency: string): { label: string; value: DiscountType }[] {
    return [
      { label: '%', value: 'PERCENTAGE' },
      { label: currency, value: 'AMOUNT' },
    ];
  }

  private errorMessage(err: unknown, fallbackKey: string): string {
    return quotationErrorMessage(err, this.translate, fallbackKey);
  }

  startEditConditions(): void {
    const q = this.current()!;
    this.conditionsForm.reset({
      validUntil: parseIsoDate(q.validUntil),
      terms: q.terms ?? '',
    });
    this.editingConditions.set(true);
  }

  cancelEditConditions(): void {
    this.editingConditions.set(false);
  }

  saveConditions(): void {
    this.conditionsForm.markAllAsTouched();
    if (this.conditionsForm.invalid) return;
    this.savingConditions.set(true);
    const v = this.conditionsForm.value;
    this.quotationService.updateConditions(this.current()!.id, {
      validUntil: toIsoDate(v.validUntil!),
      terms: v.terms || undefined,
    }).subscribe({
      next: updated => {
        this.savingConditions.set(false);
        this.current.set(updated);
        this.editingConditions.set(false);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('quotations.conditionsSaved') });
      },
      error: (err) => {
        this.savingConditions.set(false);
        this.messageService.add({ severity: 'error', summary: this.errorMessage(err, 'quotations.conditionsSaveError') });
      },
    });
  }

  onServiceChange(id: string | null): void {
    this.selectedServiceId.set(id);
    const svc = this.services().find(s => s.id === id) ?? null;
    const cfg = svc ? priceTypeQuantityConfig(svc.priceType) : null;
    this.itemQuantity.set(cfg && !cfg.fixed ? cfg.min : 1);
  }

  addItem(): void {
    const svc = this.selectedService();
    if (!svc) return;
    const cfg = priceTypeQuantityConfig(svc.priceType);
    const quantity = cfg.fixed ? 1 : this.itemQuantity();
    this.addingItem.set(true);
    this.quotationService.addItem(this.current()!.id, { serviceId: svc.id, quantity }).subscribe({
      next: q => {
        this.addingItem.set(false);
        this.current.set(q);
        this.selectedServiceId.set(null);
        this.itemQuantity.set(1);
      },
      error: (err) => {
        this.addingItem.set(false);
        this.messageService.add({ severity: 'error', summary: this.errorMessage(err, 'quotations.itemError') });
      },
    });
  }

  onDiscountTypeChange(item: QuotationItem, type: DiscountType): void {
    this.saveDiscount(item, type, 0);
  }

  onDiscountValueChange(item: QuotationItem): void {
    let value = this.pendingItemDiscountValue.get(item.id) ?? item.discountValue;
    value = item.discountType === 'PERCENTAGE'
      ? Math.min(Math.max(value, 0), 100)
      : Math.min(Math.max(value, 0), itemGrossAmount(item));
    this.saveDiscount(item, item.discountType, value);
  }

  private saveDiscount(item: QuotationItem, discountType: DiscountType, discountValue: number): void {
    this.savingDiscountItemId.set(item.id);
    this.quotationService.setItemDiscount(this.current()!.id, item.id, { discountType, discountValue }).subscribe({
      next: q => {
        this.savingDiscountItemId.set(null);
        this.current.set(q);
      },
      error: (err) => {
        this.savingDiscountItemId.set(null);
        this.messageService.add({ severity: 'error', summary: this.errorMessage(err, 'quotations.discountError') });
      },
    });
  }

  onTotalDiscountTypeChange(type: DiscountType): void {
    this.saveTotalDiscount(type, 0);
  }

  onTotalDiscountValueChange(): void {
    const q = this.current()!;
    let value = this.pendingTotalDiscountValue;
    value = q.discountType === 'PERCENTAGE'
      ? Math.min(Math.max(value, 0), 100)
      : Math.min(Math.max(value, 0), q.subtotal);
    this.saveTotalDiscount(q.discountType, value);
  }

  private saveTotalDiscount(discountType: DiscountType, discountValue: number): void {
    this.savingTotalDiscount.set(true);
    this.quotationService.setDiscount(this.current()!.id, { discountType, discountValue }).subscribe({
      next: q => {
        this.savingTotalDiscount.set(false);
        this.current.set(q);
      },
      error: (err) => {
        this.savingTotalDiscount.set(false);
        this.messageService.add({ severity: 'error', summary: this.errorMessage(err, 'quotations.discountError') });
      },
    });
  }

  removeItem(item: QuotationItem): void {
    if (this.removingItemId()) return;
    this.removingItemId.set(item.id);
    this.quotationService.removeItem(this.current()!.id, item.id).subscribe({
      next: q => {
        this.removingItemId.set(null);
        this.current.set(q);
      },
      error: (err) => {
        this.removingItemId.set(null);
        this.messageService.add({ severity: 'error', summary: this.errorMessage(err, 'quotations.removeItemError') });
      },
    });
  }

  confirmApproveDirectly(): void {
    if (!this.hasItems()) return;
    this.confirmationService.confirm({
      message: this.translate.instant('quotations.approveDirectlyConfirm'),
      header: this.translate.instant('quotations.approveDirectlyConfirmTitle'),
      icon: 'pi pi-question-circle',
      acceptLabel: this.translate.instant('quotations.approveDirectly'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'success' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => this.approveDirectly(),
    });
  }

  private approveDirectly(): void {
    this.approvingDirectly.set(true);
    const id = this.current()!.id;
    const number = this.current()!.quotationNumber;
    this.quotationService.approveDirectly(id).subscribe({
      next: () => {
        this.approvingDirectly.set(false);
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('quotations.approveDirectlySuccess', { number: formatQuotationNumber(number) }),
        });
        this.router.navigate(['/quotations', id]);
      },
      error: (err) => {
        this.approvingDirectly.set(false);
        this.messageService.add({ severity: 'error', summary: this.errorMessage(err, 'quotations.approveDirectlyError') });
      },
    });
  }

  sendQuotation(): void {
    if (!this.hasItems()) return;
    this.sending.set(true);
    const id = this.current()!.id;
    const number = this.current()!.quotationNumber;
    this.quotationService.send(id).subscribe({
      next: res => {
        this.sending.set(false);
        navigator.clipboard?.writeText(`${window.location.origin}/quotations/public/${res.publicToken}`);
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('quotations.linkCopied', { number: formatQuotationNumber(number) }),
        });
        this.router.navigate(['/quotations', id]);
      },
      error: (err) => {
        this.sending.set(false);
        this.messageService.add({ severity: 'error', summary: this.errorMessage(err, 'quotations.sendError') });
      },
    });
  }
}
