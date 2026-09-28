import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface KpiMoney {
  amount: number;
  currency: string;
}

export interface PlanQuota {
  used: number;
  limit: number;
}

export interface PlanUsage {
  adminUsers: PlanQuota;
  fieldUsers: PlanQuota;
  units: PlanQuota;
  orders: PlanQuota;
}

export interface OwnerDashboard {
  revenueForecast: KpiMoney;
  revenueActual: KpiMoney;
  averageTicket: KpiMoney;
  estimatedNetMargin: KpiMoney;
  planUsage: PlanUsage;
}

export type ActivationStepKey = 'CATALOG' | 'CUSTOMER' | 'TECHNICIAN' | 'QUOTATION' | 'ORDER';

export interface ActivationChecklist {
  steps: { key: ActivationStepKey; done: boolean }[];
  complete: boolean;
}

export type QuotationStatus = 'DRAFT' | 'SENT' | 'APPROVED' | 'DECLINED' | 'EXPIRED';

export type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'CONVERTED' | 'LOST';

export interface QuickScheduleItem {
  quotationId: string;
  customerId: string;
  total: KpiMoney;
  validUntil: string;
}

export interface LeadConversionSummary {
  captured: number;
  withQuotation: number;
  won: number;
}

export type ReactivationStatus =
  'DETECTED' | 'CONTACTED' | 'RESPONDED' | 'SCHEDULED' | 'DECLINED' | 'IGNORED' | 'SNOOZED';

/** Funil de reativação (#277): conversão e valor recuperado numa janela de `windowDays` dias. */
export interface ReactivationSummary {
  windowDays: number;
  detected: number;
  scheduled: number;
  recoveredValue: KpiMoney;
}

export interface CommercialDashboard {
  quotationFunnel: Partial<Record<QuotationStatus, number>>;
  openProposalsValue: KpiMoney;
  quickScheduleQueue: QuickScheduleItem[];
  leadFunnel: Partial<Record<LeadStatus, number>>;
  leadConversion: LeadConversionSummary;
  reactivationFunnel: Partial<Record<ReactivationStatus, number>>;
  reactivation: ReactivationSummary;
}

export type OrderStatus =
  | 'CREATED' | 'SCHEDULED' | 'ASSIGNED' | 'CHECKED_IN' | 'IN_PROGRESS' | 'AWAITING_RETURN'
  | 'PARTIALLY_DONE' | 'COMPLETED' | 'SIGNED' | 'FINISHED' | 'ON_HOLD' | 'CANCELLED';

export type LaundryItemStatus = 'RECEIVED' | 'PROCESSING' | 'READY' | 'RELEASED' | 'DELIVERED';

export interface ProviderCommissionTotal {
  providerId: string;
  total: KpiMoney;
  commissionCount: number;
}

export interface FinanceDashboard {
  accountsReceivableOpenTotal: KpiMoney;
  accountsReceivableOpenCount: number;
  pendingBillingTotal: KpiMoney;
  commissionByProvider: ProviderCommissionTotal[];
}

/**
 * Um único endpoint (`GET /api/v1/dashboard/summary`, issue #118) devolve a forma certa conforme
 * a role do utilizador autenticado — cada componente de dashboard sabe qual forma esperar e
 * tipa a chamada de acordo, sem passar role nenhuma no pedido.
 */
@Injectable({ providedIn: 'root' })
export class DashboardService {
  private http = inject(HttpClient);
  private readonly API = `${environment.apiUrl}/dashboard`;

  getSummary<T>(): Observable<T> {
    return this.http.get<T>(`${this.API}/summary`);
  }

  /** Painel de comando do proprietário; `from`/`to` (yyyy-MM-dd) só valem com `CUSTOM`. */
  getOwnerCommandCenter(period: DashboardPeriod, from?: string, to?: string): Observable<OwnerCommandCenter> {
    let params = new HttpParams().set('period', period);
    if (period === 'CUSTOM' && from && to) {
      params = params.set('from', from).set('to', to);
    }
    return this.http.get<OwnerCommandCenter>(`${this.API}/owner/command-center`, { params });
  }

  /** Cockpit do comercial; `from`/`to` (yyyy-MM-dd) só valem com `CUSTOM`. */
  getCommercialCommandCenter(period: DashboardPeriod, from?: string, to?: string): Observable<CommercialCommandCenter> {
    let params = new HttpParams().set('period', period);
    if (period === 'CUSTOM' && from && to) {
      params = params.set('from', from).set('to', to);
    }
    return this.http.get<CommercialCommandCenter>(`${this.API}/commercial/command-center`, { params });
  }

  /** Central financeira; `from`/`to` (yyyy-MM-dd) só valem com `CUSTOM`. */
  getFinanceCommandCenter(period: DashboardPeriod, from?: string, to?: string): Observable<FinanceCommandCenter> {
    let params = new HttpParams().set('period', period);
    if (period === 'CUSTOM' && from && to) {
      params = params.set('from', from).set('to', to);
    }
    return this.http.get<FinanceCommandCenter>(`${this.API}/finance/command-center`, { params });
  }

  /** Central de operação: sempre "agora" (hoje + próximos dias), sem período. */
  getOperatorCommandCenter(): Observable<OperatorCommandCenter> {
    return this.http.get<OperatorCommandCenter>(`${this.API}/operator/command-center`);
  }

  /** Progresso da checklist de ativação, derivado do estado real da empresa (issue #137). */
  getActivationChecklist(): Observable<ActivationChecklist> {
    return this.http.get<ActivationChecklist>(`${this.API}/activation`);
  }
}

export type DashboardPeriod = 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'LAST_30_DAYS' | 'CUSTOM';
export type TodayOperationGroup = 'COMPLETED' | 'IN_PROGRESS' | 'SCHEDULED' | 'ISSUE';
export type AttentionType =
  | 'OVERDUE_INVOICES' | 'QUOTATIONS_AWAITING_RESPONSE' | 'LATE_ORDERS'
  | 'ORDERS_TO_SCHEDULE' | 'ORDERS_TO_ASSIGN' | 'FINISHED_TO_INVOICE';
export type AttentionSeverity = 'DANGER' | 'WARNING' | 'INFO';

/** `changePct` é nulo sem base de comparação (período anterior vazio) — nunca um zero inventado. */
export interface MoneyKpi { current: KpiMoney | null; previous: KpiMoney | null; changePct: number | null }
export interface CountKpi { current: number; previous: number; changePct: number | null }
export interface RateKpi { current: number | null; previous: number | null; changePoints: number | null }

export interface CommandCenterTodayOrder {
  orderId: string;
  orderNumber: number;
  scheduledStartAt: string;
  technicianName: string | null;
  description: string | null;
  status: OrderStatus;
  group: TodayOperationGroup;
  /** Só preenchido quando `group` é `ISSUE`. */
  issue: 'ON_HOLD' | 'LATE' | null;
}

export interface CommandCenterAttention {
  type: AttentionType;
  severity: AttentionSeverity;
  count: number;
  amount: KpiMoney | null;
  /** Ordens por trás do alerta (vazia nos alertas que não são de ordens), para destacar na lista. */
  orderIds: string[];
}

export interface OwnerCommandCenter {
  period: { type: DashboardPeriod; from: string; to: string; previousFrom: string; previousTo: string };
  kpis: {
    revenue: MoneyKpi;
    completedOrders: CountKpi;
    averageTicket: MoneyKpi;
    conversion: RateKpi;
    receivable: { total: KpiMoney; invoiceCount: number; overdue: KpiMoney; overdueCount: number };
  };
  today: { date: string; total: number; byGroup: Record<TodayOperationGroup, number>; orders: CommandCenterTodayOrder[] };
  attention: CommandCenterAttention[];
  funnel: {
    created: number; sent: number; awaiting: number; approved: number;
    conversionPct: number | null; openValue: KpiMoney; wonValue: KpiMoney;
  };
  revenueSeries: { date: string; amount: KpiMoney }[];
  revenueSeriesGranularity: 'DAY' | 'MONTH';
  topServices: { serviceId: string | null; name: string; quantity: number; revenue: KpiMoney }[];
}

export type CommercialAttentionType =
  | 'LEAD_ACTIONS_OVERDUE' | 'NEW_LEADS_UNTOUCHED' | 'QUOTATIONS_STALE'
  | 'QUOTATIONS_EXPIRING' | 'DRAFTS_NOT_SENT' | 'REACTIVATION_DETECTED';
export type CommercialPipelineStageKey = 'NEW_LEADS' | 'LEADS_IN_PROGRESS' | 'DRAFT' | 'SENT' | 'APPROVED';
export type FollowUpKind = 'LEAD_ACTION' | 'QUOTATION_SENT';
export type LeadSourceKey = 'WEBSITE' | 'REFERRAL' | 'PHONE' | 'WHATSAPP' | 'SOCIAL_MEDIA' | 'WALK_IN' | 'OTHER';

export interface CommercialFollowUpRow {
  kind: FollowUpKind;
  /** Lead (`LEAD_ACTION`) ou orçamento (`QUOTATION_SENT`). */
  refId: string;
  name: string | null;
  description: string | null;
  quotationNumber: number | null;
  amount: KpiMoney | null;
  referenceAt: string;
  overdue: boolean;
}

/** Cockpit do COMMERCIAL: `GET /dashboard/commercial/command-center`. Campo sem base vem nulo. */
export interface CommercialCommandCenter {
  period: { type: DashboardPeriod; from: string; to: string; previousFrom: string; previousTo: string };
  kpis: {
    sales: MoneyKpi;
    openQuotations: { count: number; drafts: number; sent: number };
    pipeline: { value: KpiMoney; count: number };
    conversion: RateKpi;
    averageTicket: MoneyKpi;
  };
  attention: { type: CommercialAttentionType; severity: AttentionSeverity; count: number; amount: KpiMoney | null }[];
  pipeline: { stage: CommercialPipelineStageKey; count: number; value: KpiMoney | null }[];
  followUps: { total: number; overdue: number; rows: CommercialFollowUpRow[] };
  conversion: {
    created: number; sent: number; approved: number; declined: number; expired: number; awaiting: number;
    conversionPct: number | null;
    byService: { serviceId: string | null; name: string; sent: number; approved: number; conversionPct: number | null }[];
  };
  salesSeries: { date: string; amount: KpiMoney }[];
  salesSeriesGranularity: 'DAY' | 'MONTH';
  activity: { leadsCreated: number; interactions: number; quotationsSent: number; quotationsApproved: number };
  leadSources: { source: LeadSourceKey; leads: number; won: number; conversionPct: number | null }[];
  serviceDemand: { serviceId: string | null; name: string; quotations: number; value: KpiMoney; changePct: number | null }[];
  customers: { newCustomers: number; recurring: number };
  reactivation: {
    detected: number;
    rows: { opportunityId: string; customerId: string; customerName: string | null; dueAt: string }[];
  };
}

export type OperatorLiveState =
  | 'DONE' | 'IN_SERVICE' | 'EN_ROUTE' | 'NOT_STARTED' | 'UNASSIGNED' | 'LATE' | 'ON_HOLD' | 'AWAITING_RETURN';
export type OperatorRiskReason = 'NO_TECHNICIAN' | 'NOT_DEPARTED' | 'PREVIOUS_OVERRUN' | 'NO_CHECKIN' | 'ARRIVING_LATE';
export type OperatorExceptionType =
  | 'LATE_ORDERS' | 'NO_CHECKIN' | 'LAUNDRY_OVERDUE' | 'ORDERS_ON_HOLD' | 'ORDERS_PARTIALLY_DONE'
  | 'ORDERS_UNASSIGNED' | 'DELIVERIES_UNSCHEDULED' | 'DAYS_OVER_CAPACITY' | 'ORDERS_TO_SCHEDULE';
export type OperatorPipelineStage =
  | 'SCHEDULED' | 'EN_ROUTE' | 'CHECKED_IN' | 'IN_PROGRESS' | 'PARTIALLY_DONE' | 'AWAITING_RETURN'
  | 'COMPLETED' | 'FINISHED';
export type OperatorTeamState = 'IN_SERVICE' | 'EN_ROUTE' | 'ON_HOLD' | 'AVAILABLE' | 'UNAVAILABLE';

/** Linha da operação ao vivo; `technicianId` é o id do usuário (mesma chave da tela de rotas). */
export interface OperatorLiveOrder {
  orderId: string;
  orderNumber: number;
  scheduledStartAt: string;
  scheduledEndAt?: string | null;
  customerName?: string | null;
  description?: string | null;
  technicianId?: string | null;
  technicianName?: string | null;
  status: OrderStatus;
  liveState: OperatorLiveState;
  /** IN_SERVICE: minutos desde o início; LATE: minutos de atraso. */
  minutes?: number | null;
  expectedArrivalAt?: string | null;
  risk?: OperatorRiskReason | null;
}

export interface OperatorSlaRate { onTime: number; late: number; measured: number; ratePct?: number | null }

export interface OperatorLaundryItemRow {
  itemId: string;
  code: string;
  description?: string | null;
  customerName?: string | null;
  orderId: string;
  status: LaundryItemStatus;
  daysInLaundry: number;
  deadlineAt: string;
  overdueDays: number;
}

export interface OperatorDeliveryRow {
  itemId: string;
  code: string;
  description?: string | null;
  customerName?: string | null;
  orderId: string;
  waitingSince?: string | null;
  scheduledFor?: string | null;
}

/** Central de operação: `GET /dashboard/operator/command-center`. O backend omite campos nulos (`non_null`): sem base o campo vem ausente, nunca zero; `laundry` ausente sem o módulo. */
export interface OperatorCommandCenter {
  generatedAt: string;
  date: string;
  kpis: {
    ordersToday: { total: number; completed: number };
    inProgress: { orders: number; technicians: number };
    atRisk: number;
    punctuality: { ratePct?: number | null; onTime: number; late: number; total: number; windowDays: number };
    lateOrders: { count: number; maxDelayMinutes?: number | null };
    laundry?: { inProcess: number };
  };
  liveOrders: OperatorLiveOrder[];
  attention: { lateTotal: number; late: OperatorLiveOrder[]; atRiskTotal: number; atRisk: OperatorLiveOrder[] };
  sla: { windowDays: number; arrival: OperatorSlaRate; start: OperatorSlaRate; completion: OperatorSlaRate };
  pipeline: { toSchedule: number; stages: { stage: OperatorPipelineStage; count: number; late: number }[] };
  laundry?: {
    stages: { status: LaundryItemStatus; count: number; overdue: number }[];
    sla: { turnaroundDays: number; onTime: number; late: number; measured: number; ratePct?: number | null };
    overdueItems: OperatorLaundryItemRow[];
    deliveries: { released: number; ready: number; unscheduled: number; upcoming: OperatorDeliveryRow[] };
  };
  capacity: {
    date: string;
    orders: number;
    plannedMinutes: number;
    capacityMinutes?: number | null;
    occupancyPct?: number | null;
    availableTechnicians: number;
  }[];
  team: {
    technicianId: string;
    name: string;
    state: OperatorTeamState;
    orders: number;
    completed: number;
    currentOrderId?: string | null;
    currentOrderNumber?: number | null;
    nextAt?: string | null;
  }[];
  exceptions: { type: OperatorExceptionType; severity: AttentionSeverity; count: number }[];
}

export type FinanceAttentionType =
  'OVERDUE_INVOICES' | 'DUE_TODAY' | 'FINISHED_TO_INVOICE' | 'COMMISSIONS_TO_CALCULATE' | 'COMMISSIONS_NEEDS_REVIEW';
export type FinanceAgingRange = 'DAYS_1_7' | 'DAYS_8_30' | 'DAYS_31_60' | 'OVER_60';
export type FinancePaymentMethod = 'CASH' | 'PIX' | 'BANK_TRANSFER' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'BOLETO' | 'OTHER';

export interface FinanceAmountCount { amount: KpiMoney; count: number }

/**
 * Central financeira: `GET /dashboard/finance/command-center`. Os KPIs de posição (`receivable`,
 * `overdue`, `toInvoice`, `commissionsToPay`) descrevem "hoje" e ignoram o período; só `invoiced` e
 * `received` comparam com o período anterior. O backend omite campos nulos.
 */
export interface FinanceCommandCenter {
  period: { type: DashboardPeriod; from: string; to: string; previousFrom: string; previousTo: string };
  kpis: {
    invoiced: MoneyKpi;
    received: MoneyKpi;
    receivable: FinanceAmountCount;
    overdue: FinanceAmountCount;
    toInvoice: FinanceAmountCount;
    commissionsToPay: FinanceAmountCount;
  };
  attention: { type: FinanceAttentionType; severity: AttentionSeverity; count: number; amount?: KpiMoney | null }[];
  receivables: {
    total: KpiMoney; invoiceCount: number; notDue: KpiMoney; overdue: KpiMoney; today: KpiMoney;
    next7Days: KpiMoney; days8To30: KpiMoney; over30Days: KpiMoney; noDueDate: KpiMoney;
  };
  aging: { range: FinanceAgingRange; amount: KpiMoney; count: number }[];
  overdueInvoices: {
    invoiceId: string; invoiceNumber: number; customerId: string; customerName?: string | null;
    outstanding: KpiMoney; dueDate: string; daysOverdue: number;
  }[];
  toInvoice: {
    count: number; amount: KpiMoney;
    orders: { orderId: string; orderNumber: number; customerId: string; customerName?: string | null; description?: string | null; amount: KpiMoney }[];
  };
  series: { date: string; invoiced: KpiMoney; received: KpiMoney }[];
  seriesGranularity: 'DAY' | 'MONTH';
  upcoming: { date: string; amount: KpiMoney; invoiceCount: number }[];
  commissions: {
    toPay: KpiMoney; toPayCount: number; toCalculateCount: number; needsReviewCount: number; paidInPeriod: KpiMoney;
    byProvider: { providerId: string; providerName?: string | null; amount: KpiMoney; orderCount: number }[];
  };
  paymentMethods: { method: FinancePaymentMethod; amount: KpiMoney; sharePct?: number | null }[];
}
