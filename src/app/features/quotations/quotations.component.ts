import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Observable, Subject, forkJoin, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, switchMap, tap } from 'rxjs/operators';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { AutoCompleteCompleteEvent, AutoCompleteSelectEvent } from 'primeng/types/autocomplete';
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';
import { ChipModule } from 'primeng/chip';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Textarea } from 'primeng/textarea';
import { QuotationService, Quotation, QuotationHistoryEntry, QuotationPage, QuotationStatus } from '../../core/services/quotation.service';
import {
  PaymentMethodService, PaymentCondition, PaymentMethod, PaymentConditionMethodSetting, CreditCardInstallmentPlan,
  PAYMENT_CONDITIONS,
} from '../../core/services/payment-method.service';
import { CustomerService, Customer } from '../../core/services/customer.service';
import { TenantService } from '../../core/services/tenant.service';
import { AuthService } from '../../core/auth/auth.service';
import { SupportedCountry, formatTaxIdForDisplay } from '../../shared/utils/tax-id.validator';
import { TagBadgeComponent } from '../../shared/components/tag-badge/tag-badge.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { CustomerQuickCreateComponent } from '../../shared/components/customer-quick-create/customer-quick-create.component';
import { TooltipModule } from 'primeng/tooltip';
import { Panel } from 'primeng/panel';
import {
  buildInstallmentOptions, formatQuotationNumber, paymentConditionLabel, paymentMethodLabel,
  quotationErrorMessage, quotationStatusSeverity, toIsoDate,
} from './quotation-form.utils';
import { TableStandardDirective } from '../../shared/directives/table-standard.directive';

/** Estados exibidos no filtro — mesma ordem do fluxo de negócio (CLAUDE.md §10), sem incluir
 *  nenhum estado técnico que não exista no domínio de Quotation. */
const ALL_QUOTATION_STATUSES: QuotationStatus[] = ['DRAFT', 'SENT', 'APPROVED', 'DECLINED', 'EXPIRED'];

/** Perfis que também podem cadastrar clientes — espelha {@code CustomerController.WRITE_ROLES}. Um
 *  COMMERCIAL puro (que tem acesso a orçamentos) não tem essa permissão; o botão de cadastro rápido
 *  fica escondido para ele em vez de deixar o backend recusar com 403. */
const CUSTOMER_WRITE_ROLES = ['OWNER', 'ADMIN', 'OPERATOR'];

/**
 * Listagem de orçamentos. A criação é um diálogo rápido aqui mesmo (só cliente + condições
 * iniciais); editar e visualizar já são telas próprias ({@link QuotationEditComponent},
 * {@link QuotationViewComponent}) por terem itens, envio e o resto do fluxo de negócio.
 */
@Component({
  selector: 'app-quotations',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink, TranslatePipe, CurrencyPipe, DatePipe, ButtonModule,
    TableModule, DialogModule, SelectModule, AutoCompleteModule, InputTextModule, DatePickerModule, TagBadgeComponent, TooltipModule,
    PageHeaderComponent, EmptyStateComponent, CustomerQuickCreateComponent, Panel, Textarea, ChipModule, TableStandardDirective],
  template: `
    <div class="space-y-4 min-w-0">
      <app-page-header [title]="'quotations.title' | translate" [description]="'quotations.subtitle' | translate">
        @if (!quotationsEmpty()) {
          <p-button icon="pi pi-plus" [label]="'quotations.add' | translate" (onClick)="openCreate()" size="small" />
        }
      </app-page-header>

      @if (quotationsEmpty()) {
        <app-empty-state icon="pi pi-file-edit" [message]="'quotations.emptyTitle' | translate"
                          [subtitle]="'quotations.emptySubtitle' | translate">
        </app-empty-state>
        <div class="flex justify-center -mt-3">
          <p-button icon="pi pi-plus" [label]="'quotations.add' | translate" (onClick)="openCreate()"></p-button>
        </div>
      } @else {
      <p-panel>
      <div class="space-y-4 min-w-0">
      <!-- FILTERS — mesmo desenho reativo de customers.component.ts: cada mudança alimenta o
           pipeline de {@link wireFilters}, que busca a página filtrada no servidor. -->
      <div class="flex flex-wrap items-end gap-3">
        <div class="w-48">
          <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'quotations.statusFilter' | translate }}</label>
          <p-select [options]="statusOptions" [(ngModel)]="statusFilter" optionLabel="label" optionValue="value"
                    appendTo="body" fluid [showClear]="true"
                    [placeholder]="'quotations.allStatuses' | translate" (onChange)="applyFilters()" />
        </div>
        <div class="flex-1 min-w-56">
          <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5" for="quotationCustomerSearch">
            {{ 'quotations.customerFilter' | translate }}
          </label>
          <input pInputText id="quotationCustomerSearch" fluid [(ngModel)]="customerFilter"
                 [placeholder]="'quotations.customerSearchFilterPlaceholder' | translate"
                 autocomplete="off" (ngModelChange)="applyFilters()" />
        </div>
        <div class="w-64">
          <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'quotations.creationDateFilter' | translate }}</label>
          <p-datepicker [(ngModel)]="creationDateRange" selectionMode="range" [readonlyInput]="true"
                        appendTo="body" fluid [showClear]="true" dateFormat="dd/mm/yy"
                        [placeholder]="'quotations.allCreationDates' | translate" (onSelect)="applyFilters()"
                        (onClear)="applyFilters()" />
        </div>
        @if (hasActiveFilters()) {
          <p-button [label]="'common.clearFilters' | translate" icon="pi pi-filter-slash" [text]="true" size="small"
                    (onClick)="clearFilters()" />
        }
      </div>

        <p-table appTableStandard [value]="rows()" dataKey="id" class="p-datatable-sm"
                 [lazy]="true" [rows]="pageSize" [totalRecords]="total()" [loading]="loading()" [showLoader]="false"
                 [first]="first()" [sortField]="sortField" [sortOrder]="sortOrder"
                 [expandedRowKeys]="expandedRows" (onLazyLoad)="onLazyLoad($event)" (onRowExpand)="onRowExpand($event)">
          <ng-template pTemplate="header">
            <tr>
              <th pSortableColumn="quotationNumber">{{ 'quotations.number' | translate }} <p-sortIcon field="quotationNumber"></p-sortIcon></th>
              <th>{{ 'quotations.customer' | translate }}</th>
              <th>{{ 'common.status' | translate }}</th>
              <th pSortableColumn="createdAt">{{ 'quotations.createdAt' | translate }} <p-sortIcon field="createdAt"></p-sortIcon></th>
              <th pSortableColumn="validUntil">{{ 'quotations.validUntil' | translate }} <p-sortIcon field="validUntil"></p-sortIcon></th>
              <th>{{ 'quotations.total' | translate }}</th>
              <th class="text-right w-28">
                <span class="flex justify-center">{{ 'common.actions' | translate }}</span>
              </th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-q let-expanded="expanded">
            <tr class="group">
              <td class="font-medium whitespace-nowrap">
                <div class="flex items-center gap-1 h-6 -ml-1.5">
                  @if (q.revisionNumber > 1) {
                    <p-button [icon]="expanded ? 'pi pi-chevron-down' : 'pi pi-chevron-right'"
                              [text]="true" size="small" severity="secondary"
                              [pRowToggler]="q" [pTooltip]="(expanded ? 'quotations.collapseVersions' : 'quotations.expandVersions') | translate"
                              class="!w-6 !h-6"></p-button>
                  } @else {
                    <span class="inline-block w-6"></span>
                  }
                  <a [routerLink]="['/quotations', q.id]"
                     class="text-app-text hover:text-app-accent-hover hover:underline leading-6">
                    {{ formatQuotationNumber(q.quotationNumber) }}
                  </a>
                  @if (q.revisionNumber > 1) {
                    <p-chip [label]="previousVersionsLabel(q.revisionNumber - 1)" [pRowToggler]="q"
                                                    class="cursor-pointer !text-xs !py-0.5 !px-2"></p-chip>           
                  }                  
                </div>
              </td>
              <td class="font-medium">
                <a [routerLink]="['/customers']" [queryParams]="{ customerId: q.customerId }"
                   class="text-app-text hover:text-app-accent-hover hover:underline" (click)="$event.stopPropagation()">
                  {{ customerName(q.customerId) }}
                </a>
              </td>
              <td>
                <app-tag-badge [value]="('quotations.status' + q.status) | translate" [severity]="quotationStatusSeverity(q.status)"></app-tag-badge>
              </td>
              <td>{{ q.createdAt | date:'mediumDate' }}</td>
              <td>{{ q.validUntil | date:'mediumDate' }}</td>
              <td>{{ q.total | currency:q.currency }}</td>
              <td class="text-right whitespace-nowrap">
                <span class="flex justify-center">
                  <p-button [icon]="q.status === 'DRAFT' ? 'pi pi-pencil' : 'pi pi-eye'" [text]="true" size="small" severity="secondary"
                            [pTooltip]="(q.status === 'DRAFT' ? 'common.edit' : 'common.view') | translate"
                            (onClick)="q.status === 'DRAFT' ? editQuotation(q) : viewQuotation(q)"></p-button>
                  @if (q.status === 'DRAFT') {
                    <span [pTooltip]="q.items.length ? ('quotations.send' | translate) : ('quotations.sendDisabledHint' | translate)"
                          tooltipPosition="top">
                      <p-button icon="pi pi-send" [text]="true" size="small" severity="success"
                                [disabled]="!q.items.length" (onClick)="sendQuotation(q)"></p-button>
                    </span>
                    <p-button icon="pi pi-trash" [text]="true" size="small" severity="danger"
                              [pTooltip]="'common.delete' | translate" tooltipPosition="top"
                              [loading]="pendingDeleteId() === q.id" (onClick)="confirmDelete(q)"></p-button>
                  }
                </span>
              </td>
            </tr>
          </ng-template>
          <!-- PrimeNG 21 renomeou "rowexpansion" para "expandedrow" — o nome antigo é ignorado em silêncio. -->
          <ng-template pTemplate="expandedrow" let-q>
            <tr>
              <td colspan="7" class="bg-app-surface-hover">
                <div class="p-4">
                  <h4 class="text-xs font-semibold uppercase tracking-wide text-app-text-tertiary mb-2">
                    {{ 'quotations.previousVersionsTitle' | translate }}
                  </h4>
                  @if (!historyByQuotationId()[q.id]) {
                    <div class="text-sm text-app-text-secondary py-2 flex items-center gap-2">
                      <i class="pi pi-spin pi-spinner"></i>{{ 'common.loading' | translate }}
                    </div>
                  } @else {
                    <div class="overflow-x-auto min-w-0">
                      <table class="w-full text-sm">
                        <thead>
                          <tr class="text-left text-xs text-app-text-tertiary uppercase tracking-wide">
                            <th class="py-1.5 pr-3 font-medium">{{ 'quotations.number' | translate }}</th>
                            <th class="py-1.5 pr-3 font-medium">{{ 'common.status' | translate }}</th>
                            <th class="py-1.5 pr-3 font-medium">{{ 'common.date' | translate }}</th>
                            <th class="py-1.5 pr-3 font-medium">{{ 'quotations.subtotal' | translate }}</th>
                            <th class="py-1.5 pr-3 font-medium">{{ 'quotations.discount' | translate }}</th>
                            <th class="py-1.5 pr-3 font-medium">{{ 'quotations.total' | translate }}</th>
                            <th class="py-1.5 pr-3 font-medium">{{ 'quotations.validUntil' | translate }}</th>
                            <th class="py-1.5 pr-3 font-medium text-right">{{ 'common.actions' | translate }}</th>
                          </tr>
                        </thead>
                        <tbody>
                          @for (v of previousVersions(q.id); track v.id) {
                            <tr class="border-t border-app-border-subtle align-top">
                              <td class="py-2 pr-3 whitespace-nowrap">
                                {{ formatQuotationNumber(v.quotationNumber) }}
                                <span class="text-app-text-tertiary text-xs block">{{ 'quotations.revisionLabel' | translate: { number: v.revisionNumber } }}</span>
                              </td>
                              <td class="py-2 pr-3">
                                <app-tag-badge [value]="'quotations.supersededBadge' | translate" severity="secondary"></app-tag-badge>
                                @if (v.declineReason) {
                                  <div class="text-xs text-app-text-tertiary mt-1 max-w-[16rem]">
                                    {{ 'quotations.declineReasonLabel' | translate }}: {{ v.declineReason }}
                                  </div>
                                }
                              </td>
                              <td class="py-2 pr-3 whitespace-nowrap">{{ v.createdAt | date:'mediumDate' }}</td>
                              <td class="py-2 pr-3 whitespace-nowrap">{{ v.subtotal | currency:q.currency }}</td>
                              <td class="py-2 pr-3 whitespace-nowrap">{{ v.discountAmount > 0 ? (v.discountAmount | currency:q.currency) : '—' }}</td>
                              <td class="py-2 pr-3 whitespace-nowrap font-medium">{{ v.total | currency:q.currency }}</td>
                              <td class="py-2 pr-3 whitespace-nowrap">{{ v.validUntil | date:'mediumDate' }}</td>
                              <td class="py-2 pr-3 text-right">
                                <p-button icon="pi pi-eye" [text]="true" size="small" severity="secondary"
                                          [pTooltip]="'common.view' | translate" (onClick)="viewQuotation(v)"></p-button>
                              </td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                  }
                </div>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="7" class="text-center text-app-text-tertiary py-10">
                <i class="pi pi-search text-2xl mb-2 block"></i>
                <p class="text-sm font-medium text-app-text">{{ 'common.noResults' | translate }}</p>
                <p-button [label]="'common.clearFilters' | translate" [text]="true" size="small" class="inline-block mt-2"
                          (onClick)="clearFilters()"></p-button>
              </td>
            </tr>
          </ng-template>
        </p-table>
      </div>
      </p-panel>
      }

      <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '34rem', maxWidth: '95vw' }"
                [header]="'quotations.addTitle' | translate">
        <form [formGroup]="form" (ngSubmit)="createQuotation()" class="space-y-4">
          <p class="text-xs text-app-text-tertiary">{{ 'quotations.addHint' | translate }}</p>

          <section class="space-y-3">
            <h4 class="section-title">{{ 'quotations.sectionCustomer' | translate }}</h4>
            <div>
              <label class="label">{{ 'quotations.customer' | translate }} *</label>
              <p-autoComplete
                [ngModel]="customerFilterTerm" [ngModelOptions]="{ standalone: true }"
                (completeMethod)="searchCustomers($event)"
                (ngModelChange)="onCustomerType($event)"
                (onSelect)="onCustomerSelected($event)"
                (onClear)="onCustomerCleared()"
                [suggestions]="customerSuggestions()"
                [delay]="300" [minLength]="1"
                [dropdown]="true" [showClear]="true"
                optionLabel="name" appendTo="body" fluid
                [placeholder]="'quotations.customerPlaceholder' | translate">
                <ng-template let-c pTemplate="item">
                  <div class="flex flex-col py-0.5">
                    <span class="text-sm text-app-text">{{ c.name }}</span>
                    @if (c.taxId) { <span class="text-xs text-app-text-tertiary">{{ customerTaxIdDisplay(c.taxId) }}</span> }
                  </div>
                </ng-template>
                <ng-template pTemplate="empty">
                  <div class="p-3 text-center space-y-2">
                    <p class="text-sm text-app-text-tertiary">
                      {{ (customerFilterTerm.trim() ? 'quotations.noCustomerResultsTitle' : 'quotations.noCustomersYetTitle') | translate }}
                    </p>
                    <p class="text-xs text-app-text-tertiary">{{ 'quotations.noCustomerResultsHint' | translate }}</p>
                    @if (canCreateCustomer()) {
                      <p-button [label]="'quotations.createCustomerCta' | translate" icon="pi pi-plus" size="small"
                                (onClick)="openQuickCreateCustomer()"></p-button>
                    } @else {
                      <p class="text-xs text-app-text-tertiary">{{ 'quotations.createCustomerNoAccess' | translate }}</p>
                    }
                  </div>
                </ng-template>
              </p-autoComplete>
              @if (form.get('customerId')?.invalid && form.get('customerId')?.touched) {
                <small class="text-app-danger text-xs block mt-1">{{ 'errors.required' | translate }}</small>
              } @else {
                <p class="text-xs text-app-text-tertiary mt-1">{{ 'quotations.customerHelp' | translate }}</p>
              }
            </div>
          </section>

          <section class="space-y-3 border-t border-app-border pt-4">
            <h4 class="section-title">{{ 'quotations.sectionConditions' | translate }}</h4>
            <div>
              <label class="label">{{ 'quotations.validUntil' | translate }} *</label>
              <p-datepicker formControlName="validUntil" dateFormat="dd/mm/yy" appendTo="body" fluid [minDate]="today"></p-datepicker>
              <p class="text-xs text-app-text-tertiary mt-1">{{ 'quotations.validUntilHelp' | translate }}</p>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="label">{{ 'quotations.paymentConditionLabel' | translate }}</label>
                <p-select [options]="paymentConditionOptions()" [ngModel]="selectedPaymentCondition()" [ngModelOptions]="{ standalone: true }"
                          optionLabel="label" optionValue="value" appendTo="body" fluid [showClear]="true"
                          [placeholder]="'quotations.paymentConditionPlaceholder' | translate"
                          (ngModelChange)="onCreatePaymentConditionChange($event)"></p-select>
              </div>
              @if (selectedPaymentCondition(); as condition) {
                <div>
                  <label class="label">{{ 'quotations.paymentMethodLabel' | translate }}</label>
                  @if (paymentMethodOptionsForCondition(condition).length) {
                    <p-select [options]="paymentMethodOptionsForCondition(condition)" [ngModel]="selectedPaymentMethod()" [ngModelOptions]="{ standalone: true }"
                              optionLabel="label" optionValue="value" appendTo="body" fluid [showClear]="true"
                              [placeholder]="'quotations.paymentMethodPlaceholder' | translate"
                              (ngModelChange)="onCreatePaymentMethodChange($event)"></p-select>
                  } @else {
                    <p class="text-xs text-app-danger mt-1">{{ 'quotations.paymentMethodEmptyForCondition' | translate }}</p>
                  }
                </div>
              }
            </div>

            @if (selectedPaymentCondition() === 'DEFERRED' && selectedPaymentMethod() === 'CREDIT_CARD') {
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="label">{{ 'quotations.installmentsLabel' | translate }}</label>
                  <p-select [options]="installmentOptions()" [ngModel]="selectedInstallments()" [ngModelOptions]="{ standalone: true }"
                            optionLabel="label" optionValue="value" appendTo="body" fluid
                            [disabled]="!installmentOptions().length"
                            [placeholder]="'quotations.installmentsPlaceholder' | translate"
                            (ngModelChange)="selectedInstallments.set($event)"></p-select>
                  @if (!installmentOptions().length) {
                    <p class="text-xs text-app-danger mt-1">{{ 'quotations.installmentsNotConfigured' | translate }}</p>
                  }
                </div>
              </div>
            }

            <div>
              <label class="label">{{ 'quotations.observationsLabel' | translate }}</label>
              <textarea formControlName="terms" rows="2" class="w-full rounded border border-app-border p-2 text-sm"
                        [placeholder]="'quotations.observationsPlaceholder' | translate" pTextarea></textarea>
            </div>
          </section>

          <div class="flex justify-end gap-2 pt-1">
            <p-button type="button" [label]="'common.close' | translate" [outlined]="true" (onClick)="dialogVisible.set(false)"></p-button>
            <p-button type="submit" [label]="'common.save' | translate" icon="pi pi-check"
                      [loading]="saving()" [disabled]="form.invalid || creditCardInstallmentsMissing()"></p-button>
          </div>
        </form>
      </p-dialog>

      <app-customer-quick-create [visible]="quickCreateVisible()" (visibleChange)="onQuickCreateVisibilityChange($event)"
                                  [prefill]="quickCreatePrefill()"
                                  (customerCreated)="onCustomerCreated($event)"></app-customer-quick-create>
    </div>
  `,
  styles: [`
    @reference "../../../styles.css";
    .label { @apply block text-[11px] font-medium text-app-text-secondary mb-1.5; }
    .section-title { @apply text-[11px] font-semibold uppercase tracking-wide text-app-text-tertiary; }
  `],
})
export class QuotationsComponent implements OnInit {
  private quotationService = inject(QuotationService);
  private paymentMethodService = inject(PaymentMethodService);
  private customerService = inject(CustomerService);
  private tenantService = inject(TenantService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);
  private translate = inject(TranslateService);
  private auth = inject(AuthService);
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  readonly today = new Date();
  readonly canCreateCustomer = computed(() => CUSTOMER_WRITE_ROLES.includes(this.auth.userRole() ?? ''));
  /** Combinações condição+meio habilitadas pelo tenant (reestruturação de Formas de Pagamento).
   *  `null` até a config chegar: mostra tudo em vez de piscar as opções desaparecendo. */
  enabledConditionMethods = signal<PaymentConditionMethodSetting[] | null>(null);
  readonly paymentConditionOptions = computed(() =>
    PAYMENT_CONDITIONS
      .filter(c => (this.enabledConditionMethods() ?? []).some(s => s.condition === c))
      .map(c => ({ label: paymentConditionLabel(this.translate, c), value: c })));

  /** Condição e meio de pagamento estruturados (juros + parcelas) escolhidos no diálogo de
   *  criação — opcionais aqui como no quotation-edit; se não escolhidos agora, dá pra escolher
   *  depois na edição. Não são `FormControl` de {@link form} porque não viajam no POST de
   *  criação: são aplicados à parte, logo depois, pelo mesmíssimo
   *  {@link QuotationService#setPaymentMethod} que o quotation-edit usa — mesma validação, mesma
   *  resolução de juro, zero divergência entre as duas telas (reestruturação de Formas de
   *  Pagamento). */
  selectedPaymentCondition = signal<PaymentCondition | null>(null);
  selectedPaymentMethod = signal<PaymentMethod | null>(null);
  selectedInstallments = signal<number | null>(null);
  paymentMethodOptionsForCondition(condition: PaymentCondition): { label: string; value: PaymentMethod }[] {
    return (this.enabledConditionMethods() ?? [])
      .filter(s => s.condition === condition)
      .map(s => ({ label: paymentMethodLabel(this.translate, s.method), value: s.method }));
  }
  /** Faixas de parcelamento do tenant, carregadas sob demanda na primeira vez que "Cartão de
   *  crédito" é escolhido no diálogo — mesmo dado e mesma função de opções de
   *  {@link QuotationEditComponent}, nunca uma segunda lista que possa divergir. */
  creditCardInstallmentPlan = signal<CreditCardInstallmentPlan | null>(null);
  private creditCardPlanRequested = false;
  readonly installmentOptions = computed(() => buildInstallmentOptions(this.creditCardInstallmentPlan(), this.translate));
  /** Trava o salvar: cartão de crédito a prazo exige parcela escolhida — o backend recusa a
   *  combinação sem ela (CLAUDE.md §6: nunca deixar salvar algo que o backend vai rejeitar em
   *  seguida). */
  readonly creditCardInstallmentsMissing = computed(() =>
    this.selectedPaymentCondition() === 'DEFERRED' && this.selectedPaymentMethod() === 'CREDIT_CARD' && !this.selectedInstallments());
  readonly pageSize = 20;

  rows = signal<Quotation[]>([]);
  total = signal(0);
  first = signal(0);
  loading = signal(false);
  /** Baseado em {@link total}, não no tamanho da página atual — vazio aqui é sempre onboarding
   *  (nenhum orçamento existe), nunca "sem resultado do filtro" (esse caso é o emptymessage da tabela). */
  quotationsEmpty = computed(() => !this.loading() && this.total() === 0 && !this.hasActiveFilters());
  customers = signal<Customer[]>([]);
  customersById = computed(() => new Map(this.customers().map(c => [c.id, c])));
  /** Resultado da busca servidor-a-servidor do painel de cliente no diálogo de criação — nunca
   *  deriva de {@link customers} (aí só os primeiros ativos entram, além de nomes para a lista). */
  customerSuggestions = signal<Customer[]>([]);
  dialogVisible = signal(false);
  saving = signal(false);
  pendingDeleteId = signal<string | null>(null);
  /** Estado de expansão da linha, no formato que o `p-table` espera (chave = id, mutado no lugar
   *  pelo próprio `pRowToggler` — mesmo padrão de {@code UserAccessComponent}). */
  expandedRows: Record<string, boolean> = {};
  /** Cadeia completa (histórico) por orçamento vigente, buscada sob demanda ao expandir a linha —
   *  nunca pré-carregada para toda a listagem (evitaria N+1 de orçamento × versões). */
  historyByQuotationId = signal<Record<string, QuotationHistoryEntry[]>>({});

  /** Filtros — paginação/ordenação real no servidor (lazy load), mesmo pipeline reativo de
   *  customers.component.ts: debounce evita 1 request por tecla, distinctUntilChanged ignora
   *  disparos sem mudança real, switchMap cancela a busca anterior. */
  statusFilter: QuotationStatus | null = null;
  /** Busca livre por nome do cliente — o backend resolve o nome digitado para ids antes de
   *  filtrar orçamentos (nunca em memória: filtraria só a página atual, não o total). */
  customerFilter = '';
  creationDateRange: Date[] | null = null;
  sortField = 'quotationNumber';
  sortOrder = -1;
  private page = 0;
  private filterChange$ = new Subject<void>();
  statusOptions = ALL_QUOTATION_STATUSES.map(s => ({ value: s, label: this.translate.instant('quotations.status' + s) }));

  customerFilterTerm = '';
  quickCreateVisible = signal(false);
  quickCreatePrefill = signal<{ name?: string; taxId?: string } | null>(null);
  /** O cadastro rápido abre por cima do diálogo "Novo orçamento" (G8 #229): fecha-se o diálogo
   *  ao abrir e devolve-se ao fechar o drawer (criado ou cancelado), sem perder o preenchido. */
  private dialogWasOpenBeforeQuickCreate = false;

  /** Dias de validade padrão do orçamento — Parâmetro do Sistema da empresa (30 até carregar). */
  private defaultValidityDays = signal(30);

  /** País operacional do tenant — decide a formatação do documento na lista de clientes (CLAUDE.md §7A). */
  private country = signal<SupportedCountry>('BR');

  form = this.fb.group({
    customerId: ['', Validators.required],
    validUntil: [this.defaultValidUntil(), Validators.required],
    terms: [''],
  });

  ngOnInit(): void {
    // O dashboard comercial abre a lista já filtrada (ex.: ?status=SENT), para o número que o
    // comercial clicou e os registos que vê serem os mesmos.
    const requestedStatus = this.router.parseUrl(this.router.url).queryParams['status'];
    if (ALL_QUOTATION_STATUSES.includes(requestedStatus)) {
      this.statusFilter = requestedStatus;
    }
    this.wireFilters();
    this.loadQuotations();
    // O fim do onboarding leva aqui com ?new=1 para o dono cair direto no formulário de orçamento.
    if (this.router.parseUrl(this.router.url).queryParams['new']) {
      this.openCreate();
      this.router.navigate([], { queryParams: { new: null }, queryParamsHandling: 'merge', replaceUrl: true });
    }
    // Corre em paralelo com loadQuotations() — se este responder primeiro,
    // resolveMissingCustomers já terá buscado e anexado o cliente que faltava.
    // .set() aqui apagaria esse anexo; merge por id preserva ambos.
    this.customerService.list({ active: true, size: 100, sort: 'name,asc' }).subscribe(c => {
      this.customers.update(current => {
        const merged = new Map(current.map(x => [x.id, x]));
        c.content.forEach(x => merged.set(x.id, x));
        return [...merged.values()];
      });
    });
    // Validade padrão do orçamento é um Parâmetro do Sistema (Definições da Empresa) — buscado
    // aqui para pré-preencher a data ao abrir "Novo orçamento", nunca fixo no código.
    this.tenantService.getMe().subscribe(t => {
      const days = t.systemParameters?.defaultQuotationValidityDays;
      if (days) this.defaultValidityDays.set(days);
      if (t.countryCode) this.country.set(t.countryCode as SupportedCountry);
    });
    this.paymentMethodService.listEnabled().subscribe({
      next: settings => this.enabledConditionMethods.set(settings),
      error: () => {},
    });
  }

  /** Status/cliente/período disparam aqui; debounce+distinctUntilChanged evitam requests
   *  supérfluos, switchMap cancela a busca anterior quando uma nova é iniciada. */
  private wireFilters(): void {
    const sub = this.filterChange$.pipe(
      debounceTime(300),
      map(() => this.filterKey()),
      distinctUntilChanged(),
      tap(() => { this.page = 0; this.first.set(0); this.loading.set(true); }),
      switchMap(() => this.fetchQuotations$().pipe(
        catchError(() => {
          this.messageService.add({ severity: 'error', summary: this.errorMessage(undefined, 'quotations.loadError') });
          return of(null);
        }),
      )),
    ).subscribe(result => {
      this.loading.set(false);
      if (result) {
        this.rows.set(result.content);
        this.total.set(result.page.totalElements);
        this.resolveMissingCustomers(result.content);
      }
    });
    this.destroyRef.onDestroy(() => sub.unsubscribe());
  }

  private filterKey(): string {
    return [this.statusFilter ?? '', this.customerFilter ?? '', this.creationDateRange?.[0]?.getTime() ?? '',
      this.creationDateRange?.[1]?.getTime() ?? ''].join('|');
  }

  private fetchQuotations$(): Observable<QuotationPage> {
    return this.quotationService.list({
      status: this.statusFilter,
      customerName: this.customerFilter,
      createdAtFrom: this.creationDateRange?.[0] ? toIsoDate(this.creationDateRange[0]) : undefined,
      createdAtTo: this.creationDateRange?.[1] ? toIsoDate(this.creationDateRange[1]) : (this.creationDateRange?.[0] ? toIsoDate(this.creationDateRange[0]) : undefined),
      page: this.page, size: this.pageSize,
      sort: `${this.sortField},${this.sortOrder === -1 ? 'desc' : 'asc'}`,
    });
  }

  private defaultValidUntil(): Date {
    return new Date(this.today.getFullYear(), this.today.getMonth(), this.today.getDate() + this.defaultValidityDays());
  }

  customerName(customerId: string): string {
    return this.customersById().get(customerId)?.name ?? '—';
  }

  /** Disparado a cada seleção/período — alimenta o pipeline reativo em {@link wireFilters}. */
  applyFilters(): void {
    this.filterChange$.next();
  }

  hasActiveFilters(): boolean {
    return this.statusFilter !== null || !!this.customerFilter.trim() || !!this.creationDateRange;
  }

  clearFilters(): void {
    this.statusFilter = null;
    this.customerFilter = '';
    this.creationDateRange = null;
    this.applyFilters();
  }

  readonly quotationStatusSeverity = quotationStatusSeverity;
  readonly formatQuotationNumber = formatQuotationNumber;

  customerTaxIdDisplay(taxId: string | null): string | null {
    return formatTaxIdForDisplay(taxId, this.country());
  }

  /** Busca clientes no servidor (nunca em memória): a carga fixa de 100 ativos não alcançava
   *  clientes além do recorte. Termo digitado = FTS do backend sobre {nome, documento, telefones}
   *  com tenant isolado; termo vazio (abrir o painel / clicar na seta) = primeiros ativos. */
  searchCustomers(event: AutoCompleteCompleteEvent): void {
    const q = (event.query ?? '').trim();
    this.customerFilterTerm = q;
    this.customerService.list({ search: q || null, active: true, size: 20, sort: 'name,asc' }).subscribe({
      next: page => this.customerSuggestions.set(page.content),
      error: () => this.customerSuggestions.set([]),
    });
  }

  /** Texto livre não altera a seleção — só escolher uma opção patcheia o formulário (mesmo
   *  comportamento do AddressAutocomplete). O termo digitado alimenta o cadastro rápido. */
  onCustomerType(value: string | Customer): void {
    if (typeof value === 'string') this.customerFilterTerm = value;
  }

  onCustomerSelected(event: AutoCompleteSelectEvent): void {
    const customer = event.value as Customer;
    this.form.patchValue({ customerId: customer.id });
    this.customerFilterTerm = customer.name;
  }

  onCustomerCleared(): void {
    this.form.patchValue({ customerId: '' });
    this.customerFilterTerm = '';
  }

  /** Heurística simples: 8+ dígitos sugere documento (CPF/CNPJ/NIF formatado ou não); senão é nome. */
  private looksLikeTaxId(term: string): boolean {
    return (term.match(/\d/g)?.length ?? 0) >= 8;
  }

  openQuickCreateCustomer(): void {
    const term = this.customerFilterTerm.trim();
    this.quickCreatePrefill.set(term && this.looksLikeTaxId(term) ? { taxId: term } : { name: term });
    this.dialogWasOpenBeforeQuickCreate = true;
    this.dialogVisible.set(false);
    this.quickCreateVisible.set(true);
  }

  /** Drawer fechou (criou cliente ou foi cancelado/descartado) — devolve o diálogo pai se era
   *  dele que o cadastro rápido partiu; o formulário continua preenchido para a escolha seguinte. */
  onQuickCreateVisibilityChange(visible: boolean): void {
    if (!visible && this.dialogWasOpenBeforeQuickCreate) {
      this.dialogWasOpenBeforeQuickCreate = false;
      this.dialogVisible.set(true);
    }
  }

  onCustomerCreated(customer: Customer): void {
    this.customers.update(list => [customer, ...list]);
    this.customerSuggestions.update(list => [customer, ...list]);
    this.form.patchValue({ customerId: customer.id });
    this.customerFilterTerm = customer.name;
  }

  onLazyLoad(event: TableLazyLoadEvent): void {
    this.page = Math.floor((event.first ?? 0) / (event.rows ?? this.pageSize));
    this.first.set(event.first ?? 0);
    if (typeof event.sortField === 'string') {
      this.sortField = event.sortField;
      this.sortOrder = event.sortOrder === -1 ? -1 : 1;
    }
    this.loadQuotations();
  }

  loadQuotations(): void {
    this.loading.set(true);
    // Cada linha é sempre a ponta vigente de sua cadeia (o backend já esconde superados por
    // padrão) — versões anteriores só existem dentro da expansão, buscadas sob demanda.
    this.expandedRows = {};
    this.historyByQuotationId.set({});
    this.fetchQuotations$().subscribe({
      next: res => {
        this.rows.set(res.content);
        this.total.set(res.page.totalElements);
        this.loading.set(false);
        this.resolveMissingCustomers(res.content);
      },
      error: () => this.loading.set(false),
    });
  }

  /** Rótulo do indicador/controlo de expansão — "1 versão anterior" / "N versões anteriores",
   *  nunca mostrado quando não há nenhuma ({@code revisionNumber} da ponta vigente já é a
   *  contagem total da cadeia, sem precisar de outra consulta). */
  previousVersionsLabel(count: number): string {
    const key = count === 1 ? 'quotations.previousVersionsCountOne' : 'quotations.previousVersionsCountOther';
    return this.translate.instant(key, { count });
  }

  /** Carrega a cadeia completa ao expandir e guarda em cache — reabrir a mesma linha não refaz a
   *  consulta. */
  onRowExpand(event: { data: Quotation }): void {
    const quotationId = event.data.id;
    if (this.historyByQuotationId()[quotationId]) return;
    this.quotationService.history(quotationId).subscribe({
      next: chain => this.historyByQuotationId.update(current => ({ ...current, [quotationId]: chain })),
      error: () => this.messageService.add({ severity: 'error', summary: this.errorMessage(undefined, 'quotations.historyLoadError') }),
    });
  }

  /** Versões anteriores da cadeia, da mais recente para a mais antiga (a ponta vigente, mostrada
   *  na própria linha principal, fica de fora daqui). */
  previousVersions(quotationId: string): QuotationHistoryEntry[] {
    const chain = this.historyByQuotationId()[quotationId] ?? [];
    return chain.filter(v => v.id !== quotationId).slice().reverse();
  }

  /** Pré-carga em ngOnInit traz só os 100 primeiros clientes ativos por nome — orçamento cujo
   *  cliente ficou fora desse recorte (mais clientes cadastrados depois, ou inativo) mostrava
   *  "—" em vez do nome. Busca sob demanda os que faltam, mesmo padrão de Rotas. */
  private resolveMissingCustomers(quotations: Quotation[]): void {
    const known = this.customersById();
    const missingIds = [...new Set(quotations.map(q => q.customerId).filter(id => !known.has(id)))];
    if (!missingIds.length) return;
    forkJoin(missingIds.map(id => this.customerService.get(id))).subscribe(fetched => {
      this.customers.update(list => {
        const merged = new Map(list.map(x => [x.id, x]));
        fetched.forEach(x => merged.set(x.id, x));
        return [...merged.values()];
      });
    });
  }

  openCreate(): void {
    this.form.reset({
      customerId: '', validUntil: this.defaultValidUntil(), terms: '',
    });
    this.customerFilterTerm = '';
    this.customerSuggestions.set([]);
    this.selectedPaymentCondition.set(null);
    this.selectedPaymentMethod.set(null);
    this.selectedInstallments.set(null);
    this.dialogVisible.set(true);
  }

  onCreatePaymentConditionChange(condition: PaymentCondition | null): void {
    this.selectedPaymentCondition.set(condition);
    this.selectedPaymentMethod.set(null);
    this.selectedInstallments.set(null);
  }

  onCreatePaymentMethodChange(method: PaymentMethod | null): void {
    this.selectedPaymentMethod.set(method);
    this.selectedInstallments.set(null);
    if (this.selectedPaymentCondition() === 'DEFERRED' && method === 'CREDIT_CARD') {
      this.loadCreditCardInstallmentPlan();
    }
  }

  private loadCreditCardInstallmentPlan(): void {
    if (this.creditCardPlanRequested) return;
    this.creditCardPlanRequested = true;
    this.paymentMethodService.getCreditCardInstallmentPlan().subscribe({
      next: plan => this.creditCardInstallmentPlan.set(plan),
      error: () => { this.creditCardPlanRequested = false; },
    });
  }

  createQuotation(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.creditCardInstallmentsMissing()) return;
    this.saving.set(true);
    const v = this.form.value;
    this.quotationService.create({
      customerId: v.customerId!,
      validUntil: toIsoDate(v.validUntil!),
      terms: v.terms || undefined,
    }).subscribe({
      next: q => this.applySelectedPaymentMethodThenFinish(q),
      error: (err) => {
        this.saving.set(false);
        this.messageService.add({ severity: 'error', summary: this.errorMessage(err, 'quotations.saveError') });
      },
    });
  }

  /** Recém-criado ainda não tem itens — o percentual de juros congela aqui, mas o valor em
   *  dinheiro só passa a refletir a realidade quando itens forem adicionados no quotation-edit
   *  (Quotation#recalculateInterest, no backend). Mesmo endpoint que o quotation-edit usa: zero
   *  divergência de validação entre criar e editar. Falhar aqui não impede seguir para a edição —
   *  o orçamento já existe e a forma de pagamento pode ser escolhida de novo lá. */
  private applySelectedPaymentMethodThenFinish(quotation: Quotation): void {
    const condition = this.selectedPaymentCondition();
    const method = this.selectedPaymentMethod();
    const finish = () => {
      this.saving.set(false);
      this.dialogVisible.set(false);
      this.messageService.add({
        severity: 'success',
        summary: this.translate.instant('quotations.createdNextStep', { number: formatQuotationNumber(quotation.quotationNumber) }),
      });
      this.router.navigate(['/quotations', quotation.id, 'edit']);
    };
    if (!condition || !method) {
      finish();
      return;
    }
    this.quotationService.setPaymentMethod(quotation.id, condition, method, this.selectedInstallments()).subscribe({
      next: finish,
      error: () => {
        this.messageService.add({ severity: 'error', summary: this.translate.instant('quotations.paymentMethodSaveError') });
        finish();
      },
    });
  }

  /** Lápis da linha, só em DRAFT — sempre edição, nunca a vista somente-leitura. */
  editQuotation(q: Quotation): void {
    this.router.navigate(['/quotations', q.id, 'edit']);
  }

  /** Número e olho da linha — sempre a vista somente-leitura, mesmo em DRAFT (editar é só pelo lápis).
   *  Aceita tanto o orçamento vigente quanto um elo do histórico (revisão anterior): a mesma tela de
   *  detalhe já cobre qualquer id da cadeia (link "orçamento anterior"/"renegociado como"). */
  viewQuotation(q: { id: string }): void {
    this.router.navigate(['/quotations', q.id]);
  }

  /** Detalhe de negócio do backend quando existe; senão a mensagem genérica traduzida. */
  private errorMessage(err: unknown, fallbackKey: string): string {
    return quotationErrorMessage(err, this.translate, fallbackKey);
  }

  sendQuotation(q: Quotation): void {
    this.quotationService.send(q.id).subscribe({
      next: res => {
        navigator.clipboard?.writeText(`${window.location.origin}/quotations/public/${res.publicToken}`);
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('quotations.linkCopied', { number: formatQuotationNumber(q.quotationNumber) }),
        });
        this.loadQuotations();
      },
      error: (err) => this.messageService.add({ severity: 'error', summary: this.errorMessage(err, 'quotations.sendError') }),
    });
  }

  confirmDelete(q: Quotation): void {
    this.confirmationService.confirm({
      message: this.translate.instant('quotations.deleteConfirm'),
      header: this.translate.instant('quotations.deleteConfirmTitle'),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.translate.instant('common.delete'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => this.deleteQuotation(q),
    });
  }

  private deleteQuotation(q: Quotation): void {
    if (this.pendingDeleteId()) return;
    this.pendingDeleteId.set(q.id);
    this.quotationService.delete(q.id).subscribe({
      next: () => {
        this.pendingDeleteId.set(null);
        this.rows.set(this.rows().filter(r => r.id !== q.id));
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('quotations.deleted', { number: formatQuotationNumber(q.quotationNumber) }),
        });
        this.loadQuotations();
      },
      error: (err) => {
        this.pendingDeleteId.set(null);
        this.messageService.add({ severity: 'error', summary: this.errorMessage(err, 'quotations.deleteError') });
      },
    });
  }
}
