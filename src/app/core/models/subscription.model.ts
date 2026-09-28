/**
 * SUSPENSO não é um plano à venda: é o estado de quem acabou o período de degustação sem
 * assinar. Aparece no estado da subscrição, nunca na lista de planos.
 */
export type SubscriptionPlanId = 'SUSPENSO' | 'ESSENCIAL' | 'PROFISSIONAL' | 'INTELIGENCIA';
export type BillingPeriod = 'MONTHLY' | 'YEARLY';

export interface PlanPrice {
  plan: SubscriptionPlanId;
  billingPeriod: BillingPeriod;
  price: number;
  currency: string;
  active: boolean;
  highlight: boolean;
}

/**
 * Tetos comerciais de um plano à venda, vindos de `PlanPolicy` no backend — nunca copiados à
 * mão aqui. `-1` significa sem teto; `false`/`0` significa funcionalidade fechada.
 */
export interface PlanLimits {
  plan: SubscriptionPlanId;
  highlight: boolean;
  adminUsers: number;
  fieldUsers: number;
  ordersPerMonth: number;
  aiCreditsPerMonth: number;
  whatsAppMessagesPerMonth: number;
  maxUnits: number;
  routeOptimization: boolean;
  laundryModule: boolean;
  intelligence: boolean;
  fullHistory: boolean;
  publicApi: boolean;
}

/** Quantos utilizadores ficariam de fora do plano de destino. Zero e zero significa que cabe. */
export interface PlanFit {
  administrativeExcess: number;
  fieldExcess: number;
  fits: boolean;
}
