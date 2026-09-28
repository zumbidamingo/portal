import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { BillingPeriod, PlanFit, PlanLimits, PlanPrice, SubscriptionPlanId } from '../models/subscription.model';

export interface CheckoutResponse {
  sessionId: string;
  url: string;
}

export interface Quota {
  used: number;
  limit: number;
}

/** Saldo de mensagens WhatsApp. `low`/`exhausted` vêm decididos do backend; `limit` -1 é sem teto. */
export interface WhatsAppUsage {
  used: number;
  limit: number;
  packRemaining: number;
  packNextExpiry: string | null;
  low: boolean;
  exhausted: boolean;
}

/** Créditos de IA do ciclo. `limit` -1 é sem teto e 0 é IA fechada neste plano; `exhausted` vem do backend. */
export interface AiCreditsUsage {
  used: number;
  limit: number;
  exhausted: boolean;
}

/** Pacote avulso à venda. `unitAmount` na menor unidade da moeda (centavos), como o Stripe devolve. */
export interface WhatsAppPack {
  code: string;
  quantity: number;
  currency: string;
  unitAmount: number;
  validityMonths: number;
}

export interface SubscriptionMe {
  plan: SubscriptionPlanId;
  effectivePlan: SubscriptionPlanId;
  billingPeriod: BillingPeriod | null;
  /** ISO-4217 da moeda em que esta empresa é cobrada. Formatar com ela, nunca adivinhar. */
  billingCurrency: string;
  trialEndsAt: string | null;
  /**
   * A degustação desta conta já terminou, ou nunca foi concedida porque esta identidade já a
   * tinha gasto numa conta anterior. `trialEndsAt` a null com esta flag a true é o segundo caso.
   */
  trialAlreadyUsed: boolean;
  /**
   * Só traz quotas com contador real por trás. Utilizadores administrativos e de campo contam
   * em separado porque o plano os cobra em separado. Ordens e créditos de IA entram nas Fases
   * 4 e 12. Mensagens WhatsApp têm o saldo do ledger (issue #151); créditos de IA, o da Fase 12 (#121).
   */
  usage: {
    adminUsers: Quota;
    fieldUsers: Quota;
    units: Quota;
    /** Ausente (`null`) enquanto o canal WhatsApp está desligado nesta instalação. */
    whatsApp: WhatsAppUsage | null;
    aiCredits: AiCreditsUsage;
  };
  routeOptimization: boolean;
  laundryModule: boolean;
  intelligence: boolean;
  fullHistory: boolean;
  publicApi: boolean;
}

export type PlanId = 'ESSENCIAL' | 'PROFISSIONAL' | 'INTELIGENCIA';

@Injectable({ providedIn: 'root' })
export class SubscriptionService {
  private http = inject(HttpClient);
  private readonly API = `${environment.apiUrl}/subscriptions`;

  readonly me = signal<SubscriptionMe | null>(null);

  /**
   * Chave de `subscription.plans.*` do estado a mostrar no shell (topbar, sidebar), ou `''` sem
   * dados. `plan` é o plano persistido e nasce `SUSPENSO`: quem está em trial ainda não assinou,
   * mas não está suspenso — `effectivePlan` (calculado no backend) é que o diz. "Suspenso" só
   * sai quando o plano persistido e o efetivo são ambos `SUSPENSO`.
   */
  readonly planLabelKey = computed(() => {
    const me = this.me();
    if (!me?.plan) return '';
    if (me.plan === 'SUSPENSO' && me.effectivePlan && me.effectivePlan !== 'SUSPENSO') return 'trial';
    return me.plan.toLowerCase();
  });

  getMe(): Observable<SubscriptionMe> {
    return this.http.get<SubscriptionMe>(`${this.API}/me`).pipe(
      tap(me => this.me.set(me))
    );
  }

  getPlans(): Observable<PlanPrice[]> {
    return this.http.get<PlanPrice[]>(`${this.API}/plans`);
  }

  getPlanLimits(): Observable<PlanLimits[]> {
    return this.http.get<PlanLimits[]>(`${this.API}/plan-limits`);
  }

  /** Excedente de utilizadores no plano de destino, a chamar antes de mostrar o diálogo de downgrade. */
  checkFit(plan: PlanId): Observable<PlanFit> {
    return this.http.get<PlanFit>(`${this.API}/plans/${plan}/fit`);
  }

  checkout(plan: PlanId, billingPeriod: BillingPeriod = 'MONTHLY', successUrl?: string, cancelUrl?: string): Observable<CheckoutResponse> {
    let params = new HttpParams().set('plan', plan).set('billingPeriod', billingPeriod);
    if (successUrl) params = params.set('successUrl', successUrl);
    if (cancelUrl) params = params.set('cancelUrl', cancelUrl);
    return this.http.post<CheckoutResponse>(`${this.API}/checkout`, null, { params });
  }

  openPortal(returnUrl?: string): Observable<CheckoutResponse> {
    let params = new HttpParams();
    if (returnUrl) params = params.set('returnUrl', returnUrl);
    return this.http.post<CheckoutResponse>(`${this.API}/portal`, null, { params });
  }

  getWhatsAppPacks(): Observable<WhatsAppPack[]> {
    return this.http.get<WhatsAppPack[]>(`${this.API}/whatsapp-packs`);
  }

  checkoutWhatsAppPack(code: string, successUrl?: string, cancelUrl?: string): Observable<CheckoutResponse> {
    let params = new HttpParams().set('code', code);
    if (successUrl) params = params.set('successUrl', successUrl);
    if (cancelUrl) params = params.set('cancelUrl', cancelUrl);
    return this.http.post<CheckoutResponse>(`${this.API}/whatsapp-packs/checkout`, null, { params });
  }

  hasQuota(quota: Quota): boolean {
    return quota.limit === -1 || quota.used < quota.limit;
  }
}
