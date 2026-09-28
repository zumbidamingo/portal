import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { PaymentMethod } from './financial.service';

export type { PaymentMethod };

/** Condição de pagamento (reestruturação de Formas de Pagamento) — pai do meio de pagamento:
 *  define quando/como o pagamento é organizado no tempo, não o instrumento em si. */
export type PaymentCondition = 'UPFRONT' | 'DEFERRED';

export const PAYMENT_CONDITIONS: PaymentCondition[] = ['UPFRONT', 'DEFERRED'];

/** Configuração de um meio de pagamento dentro de uma condição, para o tenant (reestruturação
 *  de Formas de Pagamento): habilitado ou não e, quando permite juros, a porcentagem aplicada. */
export interface PaymentConditionMethodSetting {
  condition: PaymentCondition;
  method: PaymentMethod;
  enabled: boolean;
  interestEnabled: boolean;
  interestPercentage: number;
}

/** Faixa de parcelamento do cartão de crédito (reestruturação de Formas de Pagamento —
 *  parcelamento): intervalo de parcelas fechado nas duas pontas e o juro daquela faixa. Só se
 *  aplica quando a condição escolhida é {@code DEFERRED} — à vista o cartão é sempre 1x. */
export interface CreditCardInstallmentTier {
  id?: string;
  minInstallments: number;
  maxInstallments: number;
  interestPercentage: number;
}

/** Trecho de parcela sem faixa configurada, inclusive nas duas pontas. */
export interface InstallmentGap {
  from: number;
  to: number;
}

/** Configuração de parcelamento do tenant já com os trechos não cobertos calculados pelo
 *  backend — a UI não precisa reimplementar a lógica de sobreposição/cobertura. */
export interface CreditCardInstallmentPlan {
  tiers: CreditCardInstallmentTier[];
  gaps: InstallmentGap[];
}

@Injectable({ providedIn: 'root' })
export class PaymentMethodService {
  private http = inject(HttpClient);
  private readonly API = `${environment.apiUrl}/billing/payment-conditions`;
  private readonly CREDIT_CARD_TIERS_API = `${environment.apiUrl}/billing/payment-methods/credit-card/installment-tiers`;

  /** Matriz completa condição×meio, com a configuração do tenant — tela de Administração. */
  list(): Observable<PaymentConditionMethodSetting[]> {
    return this.http.get<PaymentConditionMethodSetting[]>(this.API);
  }

  /** Substitui a configuração inteira do tenant — uma linha por combinação condição+meio. */
  update(settings: PaymentConditionMethodSetting[]): Observable<PaymentConditionMethodSetting[]> {
    return this.http.put<PaymentConditionMethodSetting[]>(this.API, settings);
  }

  /** Só as combinações habilitadas — usado pelo seletor no orçamento. Sem {@code condition},
   *  devolve as duas condições juntas (para montar o seletor de "Condição de pagamento"). Com
   *  {@code condition}, só os meios dela (seletor de "Meio de pagamento", em cascata). */
  listEnabled(condition?: PaymentCondition): Observable<PaymentConditionMethodSetting[]> {
    let params = new HttpParams();
    if (condition) params = params.set('condition', condition);
    return this.http.get<PaymentConditionMethodSetting[]>(`${this.API}/enabled`, { params });
  }

  /** Faixas de parcelamento do cartão de crédito — tela de Administração e seletor de parcelas
   *  no orçamento (mesmo dado, dois consumidores). */
  getCreditCardInstallmentPlan(): Observable<CreditCardInstallmentPlan> {
    return this.http.get<CreditCardInstallmentPlan>(this.CREDIT_CARD_TIERS_API);
  }

  /** Substitui o conjunto inteiro de faixas — o backend recusa sobreposição entre elas. */
  updateCreditCardInstallmentPlan(tiers: CreditCardInstallmentTier[]): Observable<CreditCardInstallmentPlan> {
    return this.http.put<CreditCardInstallmentPlan>(this.CREDIT_CARD_TIERS_API, tiers);
  }
}
