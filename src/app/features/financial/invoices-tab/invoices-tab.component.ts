import { ChangeDetectionStrategy, Component, OnInit, computed, inject, output, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { DialogModule } from 'primeng/dialog';
import { DrawerModule } from 'primeng/drawer';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  FinancialService, Invoice, InvoiceStatus, PaymentMethod, EligibleOrder, Payment,
} from '../../../core/services/financial.service';
import { CustomerService, Customer } from '../../../core/services/customer.service';
import { OrderService } from '../../../core/services/order.service';
import {
  PaymentMethodService, PaymentConditionMethodSetting, PaymentCondition, PAYMENT_CONDITIONS,
} from '../../../core/services/payment-method.service';
import { TagBadgeComponent } from '../../../shared/components/tag-badge/tag-badge.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { Panel } from 'primeng/panel';
import { RouterLink } from '@angular/router';
import { TableStandardDirective } from '../../../shared/directives/table-standard.directive';
import { formatInvoiceNumber } from '../invoice.utils';

const PAGE_SIZE = 20;
const ALL_STATUSES = 'ALL';

type StatusFilterOption = { label: string; value: InvoiceStatus | typeof ALL_STATUSES };
type OrderOption = { label: string; value: string };

@Component({
  selector: 'app-invoices-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule, RouterLink, TranslatePipe, CurrencyPipe, DatePipe, TableModule, ButtonModule,
    InputTextModule, InputNumberModule, TextareaModule, TooltipModule, SelectModule, DialogModule, DrawerModule,
    TagBadgeComponent, PageHeaderComponent, EmptyStateComponent, Panel, TableStandardDirective,
  ],
  template: `
    <app-page-header [title]="'financial.tabInvoices' | translate" [description]="'financial.invoices.subtitle' | translate">
      @if (!invoicesEmpty()) {
        <p-button [label]="'financial.invoices.issueFromOrder' | translate" icon="pi pi-plus" size="small"
                  (onClick)="openIssueInvoice()"></p-button>
      }
    </app-page-header>

    @if (invoicesEmpty()) {
      <app-empty-state icon="pi pi-file" [message]="'financial.invoices.empty' | translate"></app-empty-state>
      <div class="flex justify-center -mt-3">
        <p-button [label]="'financial.invoices.issueFromOrder' | translate" icon="pi pi-plus" (onClick)="openIssueInvoice()"></p-button>
      </div>
    } @else {
    <div class="mt-3 space-y-3">
    <p-panel>
    <div class="space-y-4">
      <!-- Filtros (issue #184): estado + cliente + nº da fatura — reativos, sem botão -->
      <div class="flex flex-wrap items-end gap-3" [formGroup]="filterForm">
        <div>
          <label class="label">{{ 'financial.invoices.status' | translate }}</label>
          <p-select [options]="statusFilterOptions" formControlName="status" optionLabel="label" optionValue="value"
                    [showClear]="false" appendTo="body" class="w-48" fluid
                    (onChange)="applyFilters()"></p-select>
        </div>
        <div class="flex-1 min-w-56">
          <label class="label">{{ 'financial.invoices.customer' | translate }}</label>
          <input pInputText fluid [ngModel]="customerFilterTerm" [ngModelOptions]="{ standalone: true }"
                 [placeholder]="'financial.invoices.customerSearchPlaceholder' | translate"
                 autocomplete="off" (ngModelChange)="onCustomerFilterType($event)" />
        </div>
        <div>
          <label class="label">{{ 'financial.invoices.filterNumber' | translate }}</label>
          <p-inputNumber formControlName="invoiceNumber" mode="decimal" [useGrouping]="false" fluid
                         (ngModelChange)="applyFilters()"></p-inputNumber>
        </div>
        @if (hasActiveFilters()) {
          <p-button [label]="'common.clearFilters' | translate" icon="pi pi-filter-slash" [text]="true" size="small"
                    (onClick)="clearFilters()" />
        }
      </div>

      <p-table appTableStandard [value]="invoices()" dataKey="id" class="p-datatable-sm"
               [lazy]="true" [rows]="pageSize" [totalRecords]="invoicesTotal()"
               [loading]="invoicesLoading()" [first]="invoicesFirst()"
               [sortField]="sortField" [sortOrder]="sortOrder"
               (onLazyLoad)="loadInvoices($event)">
        <ng-template pTemplate="header">
          <tr>
            <th pSortableColumn="invoiceNumber">{{ 'financial.invoices.number' | translate }} <p-sortIcon field="invoiceNumber"></p-sortIcon></th>
            <th>{{ 'financial.invoices.customer' | translate }}</th>
            <th>{{ 'common.status' | translate }}</th>
            <th pSortableColumn="dueDate">{{ 'financial.invoices.dueDate' | translate }} <p-sortIcon field="dueDate"></p-sortIcon></th>
            <th pSortableColumn="total">{{ 'financial.invoices.total' | translate }} <p-sortIcon field="total"></p-sortIcon></th>
            <th>{{ 'financial.invoices.paid' | translate }}</th>
            <th>{{ 'financial.invoices.outstanding' | translate }}</th>
            <th pSortableColumn="issuedAt">{{ 'financial.invoices.issuedAt' | translate }} <p-sortIcon field="issuedAt"></p-sortIcon></th>
              <th class="text-right w-28">
                <span class="flex justify-center">{{ 'common.actions' | translate }}</span>
              </th>            
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr class="group">
            <td class="font-medium whitespace-nowrap">
              <a [routerLink]="['/invoices', row.id]"
                 class="text-app-text hover:text-app-accent-hover hover:underline">
                {{ formatInvoiceNumber(row.invoiceNumber) }}
              </a>
            </td>
            <td class="font-medium">
                {{ customerNamesMap().get(row.customerId) || '—' }}
            </td>
            <td>
              <div class="flex items-center gap-1.5">
                <app-tag-badge [value]="('financial.invoices.status' + row.status) | translate"
                               [severity]="invoiceSeverity(row.status)"></app-tag-badge>
                @if (row.overdue) {
                  <app-tag-badge [value]="'financial.invoices.overdue' | translate" severity="danger"></app-tag-badge>
                }
              </div>
            </td>
            <td>{{ row.dueDate ? (row.dueDate | date:'short') : '—' }}</td>
            <td>{{ row.total.amount | currency:row.total.currency }}</td>
            <td>{{ row.paidAmount.amount | currency:row.paidAmount.currency }}</td>
            <td>{{ row.outstanding.amount | currency:row.outstanding.currency }}</td>
            <td>{{ row.issuedAt | date:'short' }}</td>
            <td class="text-center whitespace-nowrap">
              <span class="flex justify-center gap-1">
                <p-button icon="pi pi-eye" [text]="true" size="small" severity="secondary"
                          [pTooltip]="'financial.invoices.details' | translate" tooltipPosition="top"
                          (onClick)="openDetails(row)"></p-button>
                @if (row.status !== 'CANCELLED' && row.status !== 'PAID') {
                  <p-button icon="pi pi-money-bill" [text]="true" size="small" severity="success"
                            [pTooltip]="'financial.invoices.recordPayment' | translate" tooltipPosition="top"
                            (onClick)="openRecordPayment(row)"></p-button>
                }
              </span>
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr>
            <td colspan="9" class="text-center text-app-text-tertiary py-10">
              <i class="pi pi-search text-2xl mb-2 block"></i>
              <p class="text-sm font-medium text-app-text">{{ 'common.noResults' | translate }}</p>
            </td>
          </tr>
        </ng-template>
      </p-table>
    </div>
    </p-panel>
    </div>
    }

    <!-- Dialog: emitir fatura (issue #185 — seletor de ordens elegíveis, nunca texto livre) -->
    <p-dialog [(visible)]="issueVisible" [modal]="true" [style]="{ width: '30rem' }"
              [header]="'financial.invoices.issueFromOrderTitle' | translate">
      <div class="space-y-4" [formGroup]="issueForm">
        <div>
          <label class="label">{{ 'financial.invoices.selectOrder' | translate }} *</label>
          @if (eligibleOrders().length > 0) {
            <p-select [options]="eligibleOrders()" formControlName="orderId" optionLabel="label" optionValue="value"
                      [filter]="true" filterBy="label" appendTo="body" fluid></p-select>
          } @else {
            <p class="text-sm text-app-text-secondary">{{ 'financial.invoices.eligibleOrdersEmpty' | translate }}</p>
          }
        </div>
        <div class="flex justify-end gap-2">
          <p-button type="button" [label]="'common.close' | translate" [outlined]="true" (onClick)="issueVisible.set(false)"></p-button>
          <p-button [label]="'financial.invoices.issue' | translate" icon="pi pi-check" [loading]="issuing()"
                    [disabled]="!issueForm.controls.orderId.value" (onClick)="issueInvoice()"></p-button>
        </div>
      </div>
    </p-dialog>

    <!-- Drawer: detalhes da fatura (#179/#181/#182) — drawer, não dialog: ações internas
         (registar pagamento, cancelar) abrem um p-dialog próprio, e dialog sobre dialog empilha mal. -->
    <p-drawer [(visible)]="detailsVisible" position="right" [dismissible]="true" [closeOnEscape]="true"
              styleClass="w-full! sm:w-[28rem]! lg:w-[44rem]!">
      <ng-template #header>
        @if (detailsInvoice(); as inv) {
          <div class="flex items-center gap-2 min-w-0">
            <span class="font-semibold text-app-text truncate">#{{ inv.invoiceNumber }}</span>
            <app-tag-badge [value]="('financial.invoices.status' + inv.status) | translate"
                           [severity]="invoiceSeverity(inv.status)"></app-tag-badge>
            @if (inv.overdue) {
              <app-tag-badge [value]="'financial.invoices.overdue' | translate" severity="danger"></app-tag-badge>
            }
          </div>
        } @else {
          <span class="font-semibold text-app-text">{{ 'financial.invoices.details' | translate }}</span>
        }
      </ng-template>
      @if (detailsInvoice(); as inv) {
        <div class="space-y-5 pb-4">
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <span class="label">{{ 'financial.invoices.dueDate' | translate }}</span>
              <span class="text-app-text">{{ inv.dueDate ? (inv.dueDate | date:'short') : '—' }}</span>
            </div>
            <div>
              <span class="label">{{ 'financial.invoices.issuedAt' | translate }}</span>
              <span class="text-app-text">{{ inv.issuedAt | date:'short' }}</span>
            </div>
            <div>
              <span class="label">{{ 'financial.invoices.customer' | translate }}</span>
              <span class="text-app-text">{{ detailsCustomerName() || '—' }}</span>
            </div>
          </div>

          <div class="rounded-md border border-app-border bg-app-surface p-3 space-y-2 text-sm">
            <div class="font-semibold text-app-text">{{ 'financial.invoices.agreementTerms' | translate }}</div>
            @if (inv.plannedPaymentCondition) {
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <span class="label">{{ 'financial.invoices.conditionLabel' | translate }}</span>
                  <span class="text-app-text">{{ ('financial.payments.condition' + inv.plannedPaymentCondition) | translate }}</span>
                </div>
                <div>
                  <span class="label">{{ 'financial.payments.methodLabel' | translate }}</span>
                  <span class="text-app-text">{{ ('financial.payments.method' + inv.plannedPaymentMethod) | translate }}</span>
                </div>
                @if (inv.plannedInstallments && inv.plannedPaymentMethod === 'CREDIT_CARD') {
                  <div>
                    <span class="label">{{ 'quotations.installmentsLabel' | translate }}</span>
                    <span class="text-app-text">{{ inv.plannedInstallments }}x</span>
                  </div>
                }
              </div>
            } @else {
              <p class="text-xs text-app-text-secondary">{{ 'financial.invoices.noAgreementTerms' | translate }}</p>
            }
          </div>

          @if (inv.orderIds.length > 0) {
            <div>
              <span class="label">{{ 'financial.invoices.coveredOrders' | translate }}</span>
              <div class="flex flex-wrap gap-2 mt-1">
                @for (orderId of inv.orderIds; track orderId) {
                  <a [routerLink]="['/orders']" [queryParams]="{ open: orderId }"
                     class="text-xs px-2 py-1 rounded-md border border-app-border text-app-accent hover:underline">
                    #{{ detailsOrderNumbers().get(orderId) ?? orderId.slice(0, 8) }}
                  </a>
                }
              </div>
            </div>
          }

          @if (inv.cancelledAt) {
            <div class="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
              {{ 'financial.invoices.cancelledAt' | translate }}: {{ inv.cancelledAt | date:'short' }}
              @if (inv.cancelReason) {
                <span class="block mt-1">“{{ inv.cancelReason }}”</span>
              }
            </div>
          }

          <p-table [value]="inv.items" styleClass="p-datatable-sm">
            <ng-template pTemplate="header">
              <tr>
                <th>{{ 'financial.invoices.itemDescription' | translate }}</th>
                <th class="w-16">{{ 'financial.invoices.quantity' | translate }}</th>
                <th class="w-28 text-right">{{ 'financial.invoices.unitPrice' | translate }}</th>
                <th class="w-28 text-right">{{ 'financial.invoices.gross' | translate }}</th>
                <th class="w-28 text-right">{{ 'financial.invoices.discount' | translate }}</th>
                <th class="w-28 text-right">{{ 'financial.invoices.net' | translate }}</th>
              </tr>
            </ng-template>
            <ng-template pTemplate="body" let-item>
              <tr>
                <td>{{ item.description || '—' }}</td>
                <td>{{ item.quantity }}</td>
                <td class="text-right">{{ item.unitPrice.amount | currency:item.unitPrice.currency }}</td>
                <td class="text-right">{{ item.grossAmount.amount | currency:item.grossAmount.currency }}</td>
                <td class="text-right">{{ item.discountAmount.amount | currency:item.discountAmount.currency }}</td>
                <td class="text-right font-medium text-app-text">{{ item.total.amount | currency:item.total.currency }}</td>
              </tr>
            </ng-template>
          </p-table>

          <div>
            <span class="label">{{ 'financial.invoices.paymentsHistory' | translate }}</span>
            @if (detailsPayments().length > 0) {
              <p-table [value]="detailsPayments()" styleClass="p-datatable-sm mt-1">
                <ng-template pTemplate="header">
                  <tr>
                    <th>{{ 'financial.payments.methodLabel' | translate }}</th>
                    <th class="text-right">{{ 'financial.invoices.total' | translate }}</th>
                    <th>{{ 'financial.invoices.issuedAt' | translate }}</th>
                    <th>{{ 'financial.payments.referenceLabel' | translate }}</th>
                  </tr>
                </ng-template>
                <ng-template pTemplate="body" let-payment>
                  <tr>
                    <td>{{ ('financial.payments.method' + payment.method) | translate }}</td>
                    <td class="text-right">{{ payment.amount.amount | currency:payment.amount.currency }}</td>
                    <td>{{ payment.paidAt | date:'short' }}</td>
                    <td>{{ payment.reference || '—' }}</td>
                  </tr>
                </ng-template>
              </p-table>
            } @else {
              <p class="text-sm text-app-text-secondary mt-1">{{ 'financial.invoices.noPayments' | translate }}</p>
            }
          </div>

          <div class="flex justify-end">
            <div class="w-72 space-y-1 text-sm">
              <div class="flex justify-between text-app-text-secondary">
                <span>{{ 'financial.invoices.subtotal' | translate }}</span>
                <span>{{ inv.subtotal.amount | currency:inv.subtotal.currency }}</span>
              </div>
              <div class="flex justify-between text-app-text-secondary">
                <span>{{ 'financial.invoices.tax' | translate }}</span>
                <span>{{ inv.taxAmount.amount | currency:inv.taxAmount.currency }}</span>
              </div>
              <div class="flex justify-between font-semibold text-app-text">
                <span>{{ 'financial.invoices.total' | translate }}</span>
                <span>{{ inv.total.amount | currency:inv.total.currency }}</span>
              </div>
              <div class="flex justify-between text-app-text-secondary">
                <span>{{ 'financial.invoices.paid' | translate }}</span>
                <span>{{ inv.paidAmount.amount | currency:inv.paidAmount.currency }}</span>
              </div>
              <div class="flex justify-between text-app-text">
                <span>{{ 'financial.invoices.outstanding' | translate }}</span>
                <span>{{ inv.outstanding.amount | currency:inv.outstanding.currency }}</span>
              </div>
            </div>
          </div>
        </div>
        <ng-template #footer>
          @if (inv.status !== 'CANCELLED' && inv.status !== 'PAID') {
            <div class="flex justify-end gap-2">
              <p-button [label]="'financial.invoices.cancelInvoice' | translate" severity="danger"
                        (onClick)="openCancel(inv)"></p-button>
              <p-button [label]="'financial.invoices.recordPayment' | translate" icon="pi pi-check"
                        (onClick)="openRecordPayment(inv)"></p-button>
            </div>
          }
        </ng-template>
      }
    </p-drawer>

    <!-- Dialog: cancelar fatura (issue #180 — motivo obrigatório) -->
    <p-dialog [(visible)]="cancelVisible" [modal]="true" [style]="{ width: '28rem' }"
              [header]="'financial.invoices.cancelTitle' | translate">
      @if (cancellingInvoice(); as inv) {
        <div class="space-y-4" [formGroup]="cancelForm">
          <p class="text-sm text-app-text">#{{ inv.invoiceNumber }}</p>
          <div>
            <label class="label">{{ 'financial.invoices.cancelReasonLabel' | translate }} *</label>
            <textarea pTextarea formControlName="reason" rows="3" placeholder="{{ 'financial.invoices.cancelReasonPlaceholder' | translate }}" fluid></textarea>
          </div>
          <div class="flex justify-end gap-2">
            <p-button type="button" [label]="'common.close' | translate" [outlined]="true" (onClick)="cancelVisible.set(false)"></p-button>
            <p-button [label]="'financial.invoices.cancelInvoice' | translate" icon="pi pi-times" severity="danger"
                      [loading]="cancelling()" [disabled]="!cancelForm.controls.reason.value.trim()"
                      (onClick)="cancelInvoice(inv)"></p-button>
          </div>
        </div>
      }
    </p-dialog>

    <!-- Dialog: registar pagamento -->
    <p-dialog [(visible)]="paymentVisible" [modal]="true" [style]="{ width: '28rem' }"
              [header]="'financial.payments.recordTitle' | translate">
      @if (payingInvoice(); as inv) {
        <div class="space-y-4" [formGroup]="paymentForm">
          <div>
            <label class="label">{{ 'financial.payments.amountLabel' | translate }} ({{ inv.currencyCode }})</label>
            <p-inputNumber formControlName="amount" mode="decimal" [minFractionDigits]="2" [min]="0" [max]="inv.outstanding.amount" fluid></p-inputNumber>
          </div>
          <div>
            <label class="label">{{ 'financial.invoices.conditionLabel' | translate }}</label>
            <p-select [options]="paymentConditionOptions()" formControlName="condition" optionLabel="label" optionValue="value"
                      appendTo="body" fluid (onChange)="onPaymentConditionChange()"></p-select>
          </div>
          @if (paymentForm.controls.condition.value; as condition) {
            <div>
              <label class="label">{{ 'financial.payments.methodLabel' | translate }}</label>
              @if (methodOptionsForCondition(condition).length > 0) {
                <p-select [options]="methodOptionsForCondition(condition)" formControlName="method" optionLabel="label" optionValue="value"
                          appendTo="body" fluid></p-select>
              } @else {
                <span class="text-xs text-app-danger">{{ 'quotations.paymentMethodEmptyForCondition' | translate }}</span>
              }
            </div>
          }
          <div>
            <label class="label">{{ 'financial.payments.referenceLabel' | translate }}</label>
            <input pInputText formControlName="reference" fluid />
          </div>
          <div class="flex justify-end gap-2">
            <p-button type="button" [label]="'common.close' | translate" [outlined]="true" (onClick)="paymentVisible.set(false)"></p-button>
            <p-button [label]="'financial.payments.save' | translate" icon="pi pi-check" [loading]="recordingPayment()"
                      [disabled]="!paymentForm.controls.amount.value || !paymentForm.controls.method.value" (onClick)="recordPayment(inv)"></p-button>
          </div>
        </div>
      }
    </p-dialog>
  `,
  styles: [`
    @reference "../../../../styles.css";
    .label { @apply block text-[11px] font-medium text-app-text-secondary mb-1.5; }
  `],
})
export class InvoicesTabComponent implements OnInit {
  private financialService = inject(FinancialService);
  private route = inject(ActivatedRoute);
  private customerService = inject(CustomerService);
  private orderService = inject(OrderService);
  private paymentMethodService = inject(PaymentMethodService);
  private messageService = inject(MessageService);
  private translate = inject(TranslateService);

  readonly pageSize = PAGE_SIZE;
  readonly formatInvoiceNumber = formatInvoiceNumber;
  sortField = 'invoiceNumber';
  sortOrder = -1;

  /** Combinações condição+meio habilitadas pelo tenant (billing/payment-conditions) — o seletor
   *  de pagamento nunca mostra meio fora do que o tenant configurou, mesmo estilo em cascata do
   *  formulário de orçamento (quotation-edit.component.ts). */
  private enabledConditionMethods = signal<PaymentConditionMethodSetting[] | null>(null);
  paymentConditionOptions = computed(() =>
    PAYMENT_CONDITIONS
      .filter(c => (this.enabledConditionMethods() ?? []).some(s => s.condition === c))
      .map(c => ({ label: this.translate.instant('financial.payments.condition' + c), value: c })));
  methodOptionsForCondition(condition: PaymentCondition): { label: string; value: PaymentMethod }[] {
    return (this.enabledConditionMethods() ?? [])
      .filter(s => s.condition === condition)
      .map(s => ({ label: this.translate.instant('financial.payments.method' + s.method), value: s.method }));
  }

  readonly statusFilterOptions: StatusFilterOption[] = [
    { label: this.translate.instant('financial.invoices.allStatuses'), value: ALL_STATUSES },
    { label: this.translate.instant('financial.invoices.statusISSUED'), value: 'ISSUED' },
    { label: this.translate.instant('financial.invoices.statusPARTIALLY_PAID'), value: 'PARTIALLY_PAID' },
    { label: this.translate.instant('financial.invoices.statusPAID'), value: 'PAID' },
    { label: this.translate.instant('financial.invoices.statusCANCELLED'), value: 'CANCELLED' },
  ];

  paymentRecorded = output<void>();

  invoices = signal<Invoice[]>([]);
  invoicesTotal = signal(0);
  invoicesFirst = signal(0);
  invoicesLoading = signal(false);
  invoicesEmpty = computed(() => !this.invoicesLoading() && this.invoicesTotal() === 0);
  private invoicesPage = 0;

  readonly filterForm = new FormGroup({
    status: new FormControl<InvoiceStatus | typeof ALL_STATUSES>(ALL_STATUSES, { nonNullable: true }),
    customerName: new FormControl<string>('', { nonNullable: true }),
    invoiceNumber: new FormControl<number | null>(null),
  });
  customerFilterTerm = '';

  issueVisible = signal(false);
  issuing = signal(false);
  eligibleOrders = signal<OrderOption[]>([]);
  readonly issueForm = new FormGroup({
    orderId: new FormControl<string | null>(null),
  });

  detailsVisible = signal(false);
  detailsInvoice = signal<Invoice | null>(null);
  detailsCustomerName = signal<string | null>(null);
  detailsPayments = signal<Payment[]>([]);
  /** Nº das ordens cobertas pela fatura em detalhe — sem isto o bloco "Ordens cobertas" mostrava
   *  o UUID cru (`#4d009a8f`), sem sentido nenhum pra quem lê. */
  detailsOrderNumbers = signal<Map<string, number>>(new Map());

  /** Nomes dos clientes em cache — evita N requisições ao detalhar fatura. */
  customerNamesMap = signal<Map<string, string>>(new Map());

  cancelVisible = signal(false);
  cancellingInvoice = signal<Invoice | null>(null);
  cancelling = signal(false);
  readonly cancelForm = new FormGroup({
    reason: new FormControl('', { nonNullable: true }),
  });

  paymentVisible = signal(false);
  payingInvoice = signal<Invoice | null>(null);
  recordingPayment = signal(false);
  readonly paymentForm = new FormGroup({
    amount: new FormControl<number | null>(null),
    condition: new FormControl<PaymentCondition | null>(null),
    method: new FormControl<PaymentMethod | null>(null),
    reference: new FormControl('', { nonNullable: true }),
  });

  ngOnInit(): void {
    this.loadInvoices();
    // Vindo de uma notificação: `?open=<id>` abre a fatura no painel de detalhe.
    const openId = this.route.snapshot.queryParamMap.get('open');
    if (openId) {
      this.financialService.getInvoice(openId).subscribe({
        next: invoice => this.openDetails(invoice),
        error: () => undefined,
      });
    }
    this.paymentMethodService.listEnabled().subscribe({
      next: settings => this.enabledConditionMethods.set(settings),
      error: () => { },
    });
  }

  invoiceSeverity(status: InvoiceStatus): 'success' | 'warn' | 'secondary' | 'danger' {
    if (status === 'PAID') return 'success';
    if (status === 'PARTIALLY_PAID') return 'warn';
    if (status === 'CANCELLED') return 'danger';
    return 'secondary';
  }

  applyFilters(): void {
    this.invoicesFirst.set(0);
    this.invoicesPage = 0;
    this.loadInvoices();
  }

  loadInvoices(event?: TableLazyLoadEvent): void {
    if (event) {
      this.invoicesPage = Math.floor((event.first ?? 0) / (event.rows ?? PAGE_SIZE));
      if (event.sortField && typeof event.sortField === 'string') this.sortField = event.sortField;
      if (event.sortOrder) this.sortOrder = event.sortOrder;
    }
    const filter = this.filterForm.getRawValue();
    this.invoicesLoading.set(true);
    this.financialService.listInvoices({
      page: this.invoicesPage, size: PAGE_SIZE,
      status: filter.status === ALL_STATUSES ? null : filter.status,
      customerName: filter.customerName.trim() || null,
      invoiceNumber: filter.invoiceNumber,
      sortBy: this.sortField,
      sortDirection: this.sortOrder > 0 ? 'ASC' : 'DESC',
    }).subscribe({
      next: result => {
        this.invoices.set(result.content);
        this.invoicesTotal.set(result.page.totalElements);
        this.invoicesLoading.set(false);
        this.loadCustomerNames(result.content);
      },
      error: () => {
        this.invoicesLoading.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('financial.loadError') });
      },
    });
  }

  private loadCustomerNames(invoices: Invoice[]): void {
    const uniqueCustomerIds = [...new Set(invoices.map(inv => inv.customerId))];
    const missing = uniqueCustomerIds.filter(id => !this.customerNamesMap().has(id));
    if (missing.length === 0) return;
    forkJoin(missing.map(id => this.customerService.get(id).pipe(catchError(() => of(null)))))
      .subscribe(customers => {
        const map = new Map(this.customerNamesMap());
        customers.forEach((customer, idx) => {
          if (customer) map.set(missing[idx], customer.name);
        });
        this.customerNamesMap.set(map);
      });
  }

  openIssueInvoice(): void {
    this.issueForm.reset({ orderId: null });
    this.eligibleOrders.set([]);
    this.issueVisible.set(true);
    this.financialService.listEligibleOrders({ page: 0, size: 50 }).subscribe({
      next: result => {
        this.eligibleOrders.set(result.content.map((order: EligibleOrder) => ({
          label: `#${order.orderNumber} — ${order.subtotal.amount} ${order.subtotal.currency}`,
          value: order.id,
        })));
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: this.translate.instant('financial.loadError') });
      },
    });
  }

  issueInvoice(): void {
    const orderId = this.issueForm.getRawValue().orderId;
    if (!orderId) return;
    this.issuing.set(true);
    this.financialService.issueInvoiceFromOrder(orderId).subscribe({
      next: () => {
        this.issuing.set(false);
        this.issueVisible.set(false);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('financial.invoices.issued') });
        this.loadInvoices();
      },
      error: (err: HttpErrorResponse) => {
        this.issuing.set(false);
        this.messageService.add({ severity: 'error', summary: this.businessError(err, 'financial.invoices.issueError') });
      },
    });
  }

  openDetails(invoice: Invoice): void {
    this.detailsInvoice.set(invoice);
    this.detailsCustomerName.set(null);
    this.detailsPayments.set([]);
    this.detailsOrderNumbers.set(new Map());
    this.detailsVisible.set(true);
    this.customerService.get(invoice.customerId).subscribe({
      next: customer => this.detailsCustomerName.set(customer.name),
      error: () => this.detailsCustomerName.set(null),
    });
    this.financialService.listPayments({ invoiceId: invoice.id, size: 50 }).subscribe({
      next: result => this.detailsPayments.set(result.content),
      error: () => this.detailsPayments.set([]),
    });
    if (invoice.orderIds.length > 0) {
      forkJoin(invoice.orderIds.map(id => this.orderService.get(id).pipe(catchError(() => of(null)))))
        .subscribe(orders => {
          const map = new Map<string, number>();
          orders.forEach(order => { if (order) map.set(order.id, order.orderNumber); });
          this.detailsOrderNumbers.set(map);
        });
    }
  }

  onCustomerFilterType(value: string): void {
    this.customerFilterTerm = value;
    this.filterForm.controls.customerName.setValue(value);
    this.applyFilters();
  }

  hasActiveFilters(): boolean {
    const filter = this.filterForm.getRawValue();
    return (filter.status !== ALL_STATUSES) || (filter.customerName.trim().length > 0) || (filter.invoiceNumber !== null && filter.invoiceNumber !== undefined);
  }

  clearFilters(): void {
    this.filterForm.reset({ status: ALL_STATUSES, customerName: '', invoiceNumber: null });
    this.customerFilterTerm = '';
    this.applyFilters();
  }

  openRecordPayment(invoice: Invoice): void {
    this.payingInvoice.set(invoice);
    this.paymentForm.reset({ amount: null, condition: null, method: null, reference: '' });
    this.paymentVisible.set(true);
  }

  /** Trocar a condição invalida o meio escolhido — ele pode não pertencer à condição nova
   *  (mesmo cuidado do seletor em cascata do orçamento, quotation-edit.component.ts). */
  onPaymentConditionChange(): void {
    this.paymentForm.controls.method.setValue(null);
  }

  recordPayment(invoice: Invoice): void {
    const payment = this.paymentForm.getRawValue();
    if (!payment.amount || !payment.method) return;
    this.recordingPayment.set(true);
    this.financialService.recordPayment(invoice.id, {
      amount: payment.amount, currency: invoice.currencyCode, method: payment.method,
      reference: payment.reference.trim() || null, paidAt: null,
    }).subscribe({
      next: () => {
        this.recordingPayment.set(false);
        this.paymentVisible.set(false);
        this.detailsVisible.set(false);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('financial.payments.saved') });
        this.loadInvoices();
        this.paymentRecorded.emit();
      },
      error: (err: HttpErrorResponse) => {
        this.recordingPayment.set(false);
        this.messageService.add({ severity: 'error', summary: this.businessError(err, 'financial.payments.saveError') });
      },
    });
  }

  openCancel(invoice: Invoice): void {
    this.cancellingInvoice.set(invoice);
    this.cancelForm.reset({ reason: '' });
    this.cancelVisible.set(true);
  }

  cancelInvoice(invoice: Invoice): void {
    const reason = this.cancelForm.getRawValue().reason.trim();
    if (!reason) return;
    this.cancelling.set(true);
    this.financialService.cancelInvoice(invoice.id, reason).subscribe({
      next: () => {
        this.cancelling.set(false);
        this.cancelVisible.set(false);
        this.detailsVisible.set(false);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('financial.invoices.cancelled') });
        this.loadInvoices();
      },
      error: (err: HttpErrorResponse) => {
        this.cancelling.set(false);
        this.messageService.add({ severity: 'error', summary: this.businessError(err, 'financial.invoices.cancelError') });
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