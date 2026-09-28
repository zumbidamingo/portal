import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Money {
  amount: number;
  currency: string;
}

export type InvoiceStatus = 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';
export type PaymentMethod = 'CASH' | 'PIX' | 'BANK_TRANSFER' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'BOLETO' | 'OTHER';
export type PaymentCondition = 'UPFRONT' | 'DEFERRED';
export type CommissionRuleType = 'PERCENTAGE' | 'FIXED' | 'TABLE';
/** A comissão em três palavras que o dono entende: falta definir o percentual, falta pagar, já paga. */
export type CommissionSituation = 'TO_CALCULATE' | 'TO_PAY' | 'PAID';

export interface InvoiceItem {
  id: string;
  orderItemId: string | null;
  description: string | null;
  quantity: number;
  unitPrice: Money;
  discountAmount: Money;
  grossAmount: Money;
  total: Money;
  position: number;
}

export interface Invoice {
  id: string;
  orderIds: string[];
  quotationId: string | null;
  customerId: string;
  invoiceNumber: number;
  currencyCode: string;
  status: InvoiceStatus;
  subtotal: Money;
  discountAmount: Money;
  interestAmount: Money;
  taxAmount: Money;
  total: Money;
  paidAmount: Money;
  outstanding: Money;
  items: InvoiceItem[];
  issuedAt: string;
  issuedBy: string;
  updatedAt: string;
  dueDate: string | null;
  overdue: boolean;
  plannedPaymentCondition: PaymentCondition | null;
  plannedPaymentMethod: PaymentMethod | null;
  plannedInstallments: number | null;
  cancelledAt: string | null;
  cancelReason: string | null;
}

/** Forma reduzida do {@code OrderResponse} devolvido por {@code /invoices/eligible-orders}
 *  — basta ao seletor do dialog de emissão. */
export interface EligibleOrder {
  id: string;
  orderNumber: number;
  status: string;
  currencyCode: string;
  subtotal: Money;
}

export interface Payment {
  id: string;
  invoiceId: string;
  invoiceNumber: number | null;
  customerName: string | null;
  amount: Money;
  method: PaymentMethod;
  reference: string | null;
  paidAt: string;
  recordedBy: string;
}

export interface Commission {
  id: string;
  orderId: string;
  orderNumber: number | null;
  customerName: string | null;
  serviceSummary: string | null;
  providerId: string;
  providerName: string | null;
  commissionRuleId: string | null;
  ruleType: CommissionRuleType | null;
  rulePercentage: number | null;
  ruleFixedAmount: Money | null;
  baseAmount: Money;
  computedAmount: Money;
  situation: CommissionSituation;
  commissionPaymentId: string | null;
  paidAt: string | null;
  paymentMethod: PaymentMethod | null;
  needsReview: boolean;
  reviewReason: string | null;
  calculatedAt: string;
}

export type CommissionPaymentStatus = 'SCHEDULED' | 'PAID' | 'REVERSED';

export interface CommissionPayment {
  id: string;
  providerId: string;
  providerName: string | null;
  totalAmount: Money;
  status: CommissionPaymentStatus;
  paymentMethod: PaymentMethod | null;
  paymentReference: string | null;
  notes: string | null;
  paidAt: string | null;
  reversedAt: string | null;
  reverseReason: string | null;
}

export interface ProviderBalance {
  providerId: string;
  providerName: string | null;
  toPayTotal: Money;
  toPayCount: number;
  toCalculateCount: number;
  oldestCalculatedAt: string | null;
}

export interface CommissionOverview {
  toPayTotal: Money;
  toPayCount: number;
  paidThisMonthTotal: Money;
  toCalculateCount: number;
  providers: ProviderBalance[];
}

/** `ruleType` nulo = o prestador ainda não tem percentual definido. */
export interface ProviderRate {
  providerId: string;
  providerName: string | null;
  ruleId: string | null;
  ruleType: CommissionRuleType | null;
  percentage: number | null;
  fixedAmount: Money | null;
}

export interface CommissionRates {
  suggestedPercentage: number;
  providers: ProviderRate[];
}

export interface Page<T> {
  content: T[];
  page: { totalElements: number; totalPages: number; number: number; size: number };
}

@Injectable({ providedIn: 'root' })
export class FinancialService {
  private http = inject(HttpClient);
  private readonly invoicesApi = `${environment.apiUrl}/invoices`;
  private readonly paymentsApi = `${environment.apiUrl}/payments`;
  private readonly commissionsApi = `${environment.apiUrl}/commissions`;

  // Invoices
  listInvoices(params: {
    status?: InvoiceStatus | null; customerName?: string | null; invoiceNumber?: number | null;
    page?: number; size?: number; sortBy?: string; sortDirection?: 'ASC' | 'DESC';
  }): Observable<Page<Invoice>> {
    let p = new HttpParams().set('page', String(params.page ?? 0)).set('size', String(params.size ?? 20));
    if (params.status) p = p.set('status', params.status);
    if (params.customerName && params.customerName.trim()) p = p.set('customerName', params.customerName);
    if (params.invoiceNumber != null) p = p.set('invoiceNumber', String(params.invoiceNumber));
    if (params.sortBy) {
      p = p.set('sort', `${params.sortBy},${params.sortDirection === 'ASC' ? 'asc' : 'desc'}`);
    }
    return this.http.get<Page<Invoice>>(this.invoicesApi, { params: p });
  }

  issueInvoiceFromOrder(orderId: string): Observable<Invoice> {
    return this.http.post<Invoice>(`${this.invoicesApi}/from-order/${orderId}`, {});
  }

  /** Ordens finalizadas ainda não cobertas por fatura nenhuma (issue #185) — opções reais do
   *  dialog de emissão, nunca texto livre. */
  listEligibleOrders(params: { page?: number; size?: number }): Observable<Page<EligibleOrder>> {
    const p = new HttpParams().set('page', String(params.page ?? 0)).set('size', String(params.size ?? 20));
    return this.http.get<Page<EligibleOrder>>(`${this.invoicesApi}/eligible-orders`, { params: p });
  }

  /** Cancela uma fatura sem pagamentos (issue #180) — motivo obrigatório, libertando as ordens
   *  cobertas para reemissão. */
  cancelInvoice(invoiceId: string, reason: string): Observable<Invoice> {
    return this.http.post<Invoice>(`${this.invoicesApi}/${invoiceId}/cancel`, { reason });
  }

  /** A fatura que já cobre esta ordem, se alguma — `null` quando ainda não foi faturada
   *  (aguardando finalizar, ou aguardando ordens irmãs do mesmo orçamento). */
  getInvoice(invoiceId: string): Observable<Invoice> {
    return this.http.get<Invoice>(`${this.invoicesApi}/${invoiceId}`);
  }

  getInvoiceForOrder(orderId: string): Observable<Invoice | null> {
    return this.http.get<Invoice | null>(`${this.invoicesApi}/order-status/${orderId}`);
  }

  // Payments
  listPayments(params: {
    invoiceId?: string | null;
    invoiceNumber?: number | null;
    customerName?: string | null;
    method?: string | null;
    page?: number;
    size?: number;
    sortBy?: string;
    sortDirection?: string;
  }): Observable<Page<Payment>> {
    let p = new HttpParams().set('page', String(params.page ?? 0)).set('size', String(params.size ?? 20));
    if (params.invoiceId) p = p.set('invoiceId', params.invoiceId);
    if (params.invoiceNumber) p = p.set('invoiceNumber', String(params.invoiceNumber));
    if (params.customerName?.trim()) p = p.set('customerName', params.customerName.trim());
    if (params.method) p = p.set('method', params.method);
    if (params.sortBy) {
      const direction = params.sortDirection === '-1' ? 'desc' : 'asc';
      p = p.set('sort', `${params.sortBy},${direction}`);
    }
    return this.http.get<Page<Payment>>(this.paymentsApi, { params: p });
  }

  recordPayment(invoiceId: string, payload: {
    amount: number; currency: string; method: PaymentMethod; reference: string | null; paidAt: string | null;
  }): Observable<Payment> {
    return this.http.post<Payment>(`${this.paymentsApi}/invoices/${invoiceId}`, payload);
  }

  // Comissões — a visão do dono: quanto pagar, quanto cada um ganha, o que já foi pago
  getCommissionOverview(): Observable<CommissionOverview> {
    return this.http.get<CommissionOverview>(`${this.commissionsApi}/overview`);
  }

  getCommissionRates(): Observable<CommissionRates> {
    return this.http.get<CommissionRates>(`${this.commissionsApi}/rates`);
  }

  /** Define o percentual do prestador a partir de agora; serviços que aguardavam passam a "a pagar". */
  setCommissionRate(providerId: string, percentage: number): Observable<ProviderRate> {
    return this.http.put<ProviderRate>(`${this.commissionsApi}/rates/${providerId}`, { percentage });
  }

  /** Tudo o que um prestador ainda não recebeu (a pagar e a calcular) — a lista do painel de pagamento. */
  listPendingForPayment(providerId: string): Observable<Commission[]> {
    const p = new HttpParams().set('providerId', providerId);
    return this.http.get<Commission[]>(`${this.commissionsApi}/payments/pending`, { params: p });
  }

  listCommissionPayments(params: { providerId?: string | null; page?: number; size?: number }): Observable<Page<CommissionPayment>> {
    let p = new HttpParams().set('page', String(params.page ?? 0)).set('size', String(params.size ?? 20));
    if (params.providerId) p = p.set('providerId', params.providerId);
    return this.http.get<Page<CommissionPayment>>(`${this.commissionsApi}/payments`, { params: p });
  }

  listPaymentCommissions(paymentId: string): Observable<Commission[]> {
    return this.http.get<Commission[]>(`${this.commissionsApi}/payments/${paymentId}/commissions`);
  }

  registerCommissionPayment(payload: {
    providerId: string; commissionIds: string[]; paymentMethod: PaymentMethod;
    paymentReference: string | null; notes: string | null;
  }): Observable<CommissionPayment> {
    return this.http.post<CommissionPayment>(`${this.commissionsApi}/payments`, payload);
  }

  reverseCommissionPayment(paymentId: string, reason: string): Observable<CommissionPayment> {
    return this.http.post<CommissionPayment>(`${this.commissionsApi}/payments/${paymentId}/reverse`, { reason });
  }

  /** A comissão (se alguma) de uma Ordem — usado pela tela de margem (T-13). */
  getCommissionForOrder(orderId: string): Observable<Commission | null> {
    return this.http.get<Commission | null>(`${this.commissionsApi}/by-order/${orderId}`);
  }
}
