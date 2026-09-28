import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PriceType, QuotationStatus, PaymentCondition, PaymentMethod } from './quotation.service';

export interface PublicQuotationItem {
  description: string | null;
  priceType: PriceType;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  lineTotal: number;
}

export interface PublicQuotation {
  tenantName: string;
  /** BCP-47 (`pt-BR`, `pt-PT`, `en`) — a página é da empresa, então usa o locale dela, não o do
   *  browser de quem abre o link. */
  tenantLocale: string;
  /** IANA (`America/Sao_Paulo`) — `schedules[].scheduledStartAt` é hora local do técnico, não do
   *  browser de quem abre o link (issue: coleta chegava com o horário do fuso do cliente). */
  tenantTimezone: string;
  quotationNumber: number;
  customerName: string;
  status: QuotationStatus;
  validUntil: string;
  currency: string;
  subtotal: number;
  discountAmount: number;
  /** Condição de pagamento escolhida (à vista/a prazo — reestruturação de Formas de Pagamento);
   *  `null` sem escolha. */
  paymentCondition: PaymentCondition | null;
  /** Meio de pagamento escolhido dentro de {@link paymentCondition}; `null` sem escolha. */
  paymentMethod: PaymentMethod | null;
  installments: number | null;
  paymentMethodInterestPercentage: number;
  amountBeforeInterest: number;
  interestAmount: number;
  total: number;
  paymentTerms: string | null;
  terms: string | null;
  items: PublicQuotationItem[];
  /** Dia e hora estimados por grupo de modo de execução (issue #177) — vazio quando o orçamento
   *  foi montado sem agendamento. Estimados, não garantidos: nada está reservado. */
  schedules: PublicQuotationSchedule[];
}

export interface PublicQuotationSchedule {
  executionMode: 'ONSITE' | 'EXTERNAL';
  scheduledStartAt: string;
  scheduledEndAt: string;
}

/** Cliente sem sessão — endpoints em `/public/quotations`, autenticados só pelo token assinado
 *  na própria URL (issue #140). Nunca passa pelo interceptor de auth: não há token JWT aqui. */
/** Motivos que o cliente final pode escolher ao recusar (subconjunto de SalesLossReason: "sem resposta" é da empresa). */
export type PublicDeclineReason = 'PRICE' | 'SCHEDULE' | 'COMPETITOR' | 'QUALITY_CONCERN' | 'OTHER';

@Injectable({ providedIn: 'root' })
export class QuotationPublicService {
  private http = inject(HttpClient);
  private readonly API = `${environment.apiUrl}/public/quotations`;

  get(token: string): Observable<PublicQuotation> {
    return this.http.get<PublicQuotation>(`${this.API}/${token}`);
  }

  accept(token: string): Observable<{ status: string }> {
    return this.http.post<{ status: string }>(`${this.API}/${token}/accept`, {});
  }

  decline(token: string, reason?: string, declineReasonCode?: PublicDeclineReason): Observable<{ status: string }> {
    return this.http.post<{ status: string }>(`${this.API}/${token}/decline`,
      { ...(reason ? { reason } : {}), ...(declineReasonCode ? { declineReasonCode } : {}) });
  }
}
