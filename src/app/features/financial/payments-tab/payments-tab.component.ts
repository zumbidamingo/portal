import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { DrawerModule } from 'primeng/drawer';
import { MessageService } from 'primeng/api';
import {
  FinancialService, Payment, PaymentMethod,
} from '../../../core/services/financial.service';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { Panel } from 'primeng/panel';
import { TableStandardDirective } from '../../../shared/directives/table-standard.directive';
import { formatInvoiceNumber } from '../payment.utils';

const PAGE_SIZE = 20;

type MethodFilterOption = { label: string; value: PaymentMethod | string };

@Component({
  selector: 'app-payments-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule, TranslatePipe, CurrencyPipe, DatePipe, TableModule, ButtonModule,
    InputTextModule, InputNumberModule, SelectModule, DrawerModule,
    PageHeaderComponent, EmptyStateComponent, Panel, TableStandardDirective,
  ],
  template: `
    <app-page-header [title]="'financial.tabPayments' | translate" [description]="'financial.payments.subtitle' | translate"></app-page-header>

    @if (paymentsEmpty()) {
      <app-empty-state icon="pi pi-wallet" [message]="'financial.payments.empty' | translate"></app-empty-state>
    } @else {
    <div class="mt-3 space-y-3">
    <p-panel>
    <div class="space-y-4">
      <!-- Filtros: nº fatura + cliente + método — reativos, sem botão -->
      <div class="flex flex-wrap items-end gap-3" [formGroup]="filterForm">
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
        <div>
          <label class="label">{{ 'financial.payments.method' | translate }}</label>
          <p-select [options]="methodFilterOptions" formControlName="method" optionLabel="label" optionValue="value"
                    [showClear]="true" appendTo="body" class="w-48" fluid
                    (onChange)="applyFilters()"></p-select>
        </div>
        @if (hasActiveFilters()) {
          <p-button [label]="'common.clearFilters' | translate" icon="pi pi-filter-slash" [text]="true" size="small"
                    (onClick)="clearFilters()" />
        }
      </div>

      <p-table appTableStandard [value]="payments()" dataKey="id"
               [lazy]="true" [rows]="pageSize" [totalRecords]="paymentsTotal()"
               [loading]="paymentsLoading()" [first]="paymentsFirst()"
               [sortField]="sortField" [sortOrder]="sortOrder"
               (onLazyLoad)="loadPayments($event)">
        <ng-template pTemplate="header">
          <tr>
            <th>{{ 'financial.invoices.number' | translate }}</th>
            <th>{{ 'financial.invoices.customer' | translate }}</th>
            <th pSortableColumn="amount">{{ 'financial.payments.amount' | translate }} <p-sortIcon field="amount"></p-sortIcon></th>
            <th pSortableColumn="method">{{ 'financial.payments.method' | translate }} <p-sortIcon field="method"></p-sortIcon></th>
            <th>{{ 'financial.payments.reference' | translate }}</th>
            <th pSortableColumn="paidAt">{{ 'financial.payments.paidAt' | translate }} <p-sortIcon field="paidAt"></p-sortIcon></th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr class="cursor-pointer hover:bg-app-surface-hover" (click)="openPaymentDetail(row)">
            <td class="font-medium whitespace-nowrap">
              {{ formatInvoiceNumber(row.invoiceNumber) }}
            </td>
            <td class="font-medium">{{ row.customerName || '—' }}</td>
            <td class="text-app-text">{{ row.amount.amount | currency:row.amount.currency }}</td>
            <td>{{ ('financial.payments.method' + row.method) | translate }}</td>
            <td>{{ row.reference ?? '—' }}</td>
            <td>{{ row.paidAt | date:'short' }}</td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr>
            <td colspan="6" class="text-center text-app-text-tertiary py-10">
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

    <!-- Drawer: detalhes do pagamento -->
    <p-drawer [visible]="showPaymentDetail()" (visibleChange)="showPaymentDetail.set($event)" [position]="'right'" [modal]="true" [style]="{ width: '500px' }">
      @if (selectedPayment(); as payment) {
      <ng-template pTemplate="header">
        <div class="text-lg font-semibold">{{ 'financial.payments.details' | translate }}</div>
      </ng-template>

      <div class="space-y-4">
        <!-- Informações básicas do pagamento -->
        <div>
          <p class="text-xs font-medium text-app-text-secondary mb-1">{{ 'financial.invoices.number' | translate }}</p>
          <p class="text-sm font-medium">{{ formatInvoiceNumber(payment.invoiceNumber) }}</p>
        </div>
        <div>
          <p class="text-xs font-medium text-app-text-secondary mb-1">{{ 'financial.invoices.customer' | translate }}</p>
          <p class="text-sm font-medium">{{ payment.customerName || '—' }}</p>
        </div>
        <div>
          <p class="text-xs font-medium text-app-text-secondary mb-1">{{ 'financial.payments.amount' | translate }}</p>
          <p class="text-sm font-medium">{{ payment.amount.amount | currency:payment.amount.currency }}</p>
        </div>
        <div>
          <p class="text-xs font-medium text-app-text-secondary mb-1">{{ 'financial.payments.method' | translate }}</p>
          <p class="text-sm font-medium">{{ ('financial.payments.method' + payment.method) | translate }}</p>
        </div>
        <div>
          <p class="text-xs font-medium text-app-text-secondary mb-1">{{ 'financial.payments.reference' | translate }}</p>
          <p class="text-sm font-medium">{{ payment.reference ?? '—' }}</p>
        </div>
        <div>
          <p class="text-xs font-medium text-app-text-secondary mb-1">{{ 'financial.payments.paidAt' | translate }}</p>
          <p class="text-sm font-medium">{{ payment.paidAt | date:'short' }}</p>
        </div>

        <!-- Lista de pagamentos da mesma fatura -->
        <div class="pt-4 border-t border-app-border">
          <h3 class="text-sm font-semibold mb-3">{{ 'financial.payments.relatedToInvoice' | translate }}</h3>
          @if (relatedPayments().length > 0) {
          <div class="space-y-2">
            @for (p of relatedPayments(); track p.id) {
            <div class="p-2 bg-app-surface rounded text-xs" [class.bg-app-accent-light]="p.id === payment.id">
              <div class="flex justify-between items-center mb-1">
                <span class="font-medium">{{ p.amount.amount | currency:p.amount.currency }}</span>
                <span class="text-app-text-secondary">{{ p.paidAt | date:'short' }}</span>
              </div>
              <div class="text-app-text-secondary">
                {{ ('financial.payments.method' + p.method) | translate }}
                @if (p.reference) {
                <span>• {{ p.reference }}</span>
                }
              </div>
            </div>
            }
          </div>
          } @else {
          <p class="text-app-text-tertiary text-xs">{{ 'common.noResults' | translate }}</p>
          }
        </div>
      </div>
      }
    </p-drawer>
  `,
  styles: [`
    @reference "../../../../styles.css";
    .label { @apply block text-[11px] font-medium text-app-text-secondary mb-1.5; }
  `],
})
export class PaymentsTabComponent implements OnInit {
  private financialService = inject(FinancialService);
  private messageService = inject(MessageService);
  private translate = inject(TranslateService);

  readonly pageSize = PAGE_SIZE;
  readonly formatInvoiceNumber = formatInvoiceNumber;
  sortField = 'paidAt';
  sortOrder = -1;

  readonly methodFilterOptions: MethodFilterOption[] = [
    { label: this.translate.instant('financial.payments.methodCASH'), value: 'CASH' },
    { label: this.translate.instant('financial.payments.methodPIX'), value: 'PIX' },
    { label: this.translate.instant('financial.payments.methodBANK_TRANSFER'), value: 'BANK_TRANSFER' },
    { label: this.translate.instant('financial.payments.methodCREDIT_CARD'), value: 'CREDIT_CARD' },
    { label: this.translate.instant('financial.payments.methodDEBIT_CARD'), value: 'DEBIT_CARD' },
    { label: this.translate.instant('financial.payments.methodBOLETO'), value: 'BOLETO' },
    { label: this.translate.instant('financial.payments.methodOTHER'), value: 'OTHER' },
  ];

  payments = signal<Payment[]>([]);
  paymentsTotal = signal(0);
  paymentsFirst = signal(0);
  paymentsLoading = signal(false);
  paymentsEmpty = computed(() => !this.paymentsLoading() && this.paymentsTotal() === 0);
  private paymentsPage = 0;

  selectedPayment = signal<Payment | null>(null);
  showPaymentDetail = signal(false);
  relatedPayments = signal<Payment[]>([]);

  readonly filterForm = new FormGroup({
    customerName: new FormControl<string>('', { nonNullable: true }),
    invoiceNumber: new FormControl<number | null>(null),
    method: new FormControl<string | null>(null),
  });
  customerFilterTerm = '';

  ngOnInit(): void {
    this.loadPayments();
  }

  applyFilters(): void {
    this.paymentsFirst.set(0);
    this.paymentsPage = 0;
    this.loadPayments();
  }

  loadPayments(event?: TableLazyLoadEvent): void {
    if (event) {
      this.paymentsPage = Math.floor((event.first ?? 0) / (event.rows ?? PAGE_SIZE));
      if (event.sortField && typeof event.sortField === 'string') this.sortField = event.sortField;
      if (event.sortOrder) this.sortOrder = event.sortOrder;
    }
    const filter = this.filterForm.getRawValue();
    this.paymentsLoading.set(true);
    this.financialService.listPayments({
      page: this.paymentsPage, size: PAGE_SIZE,
      customerName: filter.customerName.trim() || null,
      invoiceNumber: filter.invoiceNumber,
      method: filter.method,
      sortBy: this.sortField,
      sortDirection: this.sortOrder > 0 ? '1' : '-1',
    }).subscribe({
      next: result => {
        this.payments.set(result.content);
        this.paymentsTotal.set(result.page.totalElements);
        this.paymentsLoading.set(false);
      },
      error: () => {
        this.paymentsLoading.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('financial.loadError') });
      },
    });
  }

  onCustomerFilterType(value: string): void {
    this.customerFilterTerm = value;
    this.filterForm.controls.customerName.setValue(value);
    this.applyFilters();
  }

  hasActiveFilters(): boolean {
    const filter = this.filterForm.getRawValue();
    return (filter.customerName.trim().length > 0) || (filter.invoiceNumber !== null && filter.invoiceNumber !== undefined) || (filter.method !== null && filter.method !== undefined);
  }

  clearFilters(): void {
    this.filterForm.reset({ customerName: '', invoiceNumber: null, method: null });
    this.customerFilterTerm = '';
    this.applyFilters();
  }

  openPaymentDetail(payment: Payment): void {
    this.selectedPayment.set(payment);
    this.showPaymentDetail.set(true);
    this.loadRelatedPayments(payment.invoiceId);
  }

  private loadRelatedPayments(invoiceId: string): void {
    this.financialService.listPayments({
      invoiceId,
      page: 0,
      size: 100,
    }).subscribe({
      next: result => this.relatedPayments.set(result.content),
      error: () => this.relatedPayments.set([]),
    });
  }
}
