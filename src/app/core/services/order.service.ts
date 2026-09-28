import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { PriceType } from './catalog.service';
import type { EligibleProvider as JointEligibleTechnician, JointCompatibilityResult, TeamSuggestions } from './quotation.service';

export type OrderStatus =
  | 'CREATED'
  | 'SCHEDULED'
  | 'ASSIGNED'
  | 'CHECKED_IN'
  | 'IN_PROGRESS'
  | 'AWAITING_RETURN'
  | 'PARTIALLY_DONE'
  | 'COMPLETED'
  | 'SIGNED'
  | 'FINISHED'
  | 'ON_HOLD'
  | 'CANCELLED';

export type ExecutionMode = 'ONSITE' | 'EXTERNAL';

export interface OrderItem {
  id: string;
  serviceId: string;
  description: string;
  priceType: PriceType;
  quantity: number;
  unitPriceAmount: number;
  unitPriceCurrency: string;
  lineTotal: number;
  executionMode: ExecutionMode;
  /** Duração congelada na criação da linha (issue #172). */
  durationMinutes: number;
}

/** Uma linha do quadro de disponibilidade por técnico da ordem (mesmo conceito do orçamento,
 *  issue #177) — sem nome do técnico, resolvido no portal com a lista já carregada do Drawer. */
export interface OrderScheduleSuggestion {
  providerId: string;
  technicianUserId: string;
  date: string;
  startAt: string;
  endAt: string;
  /** Rota existente onde encaixa; `null` quando a rota do dia daquele técnico ainda vai nascer. */
  routeId: string | null;
  extraKm: number;
  extraMinutes: number;
}

export interface EligibleProvider {
  providerId: string;
  userId: string;
  skillIds: string[];
  hasWeeklyAvailability: boolean;
  maxOrdersPerDay: number | null;
  maxMinutesPerDay: number | null;
  maxVolumePerDay: number | null;
  compatible: boolean;
  reasonCode: string | null;
  reason: string | null;
}

export interface OrderEvidence {
  id: string;
  type: 'PHOTO' | 'SIGNATURE' | 'COMPARISON';
  url: string;
  createdAt: string;
}

/** Duas fotos da OS a comparar; as legendas aparecem sobre cada foto na imagem gerada. */
export interface EvidenceComparisonRequest {
  leftEvidenceId: string;
  rightEvidenceId: string;
  leftLabel?: string;
  rightLabel?: string;
}

export interface OrderTransition {
  id: string;
  fromStatus: OrderStatus;
  toStatus: OrderStatus;
  performedBy: string;
  note: string | null;
  /** Efeito colateral de outra ação (ex.: progresso de paragem de rota), não um clique direto
   *  na ordem — a UI do histórico mostra que a mudança não foi feita por um humano ali. */
  automatic: boolean;
  occurredAt: string;
}

export interface Money {
  amount: number;
  currency: string;
}

export interface OrderCosts {
  material: Money | null;
  travel: Money | null;
  labor: Money | null;
}

export interface Order {
  id: string;
  orderNumber: number;
  customerId: string;
  quotationId: string | null;
  /** Modo de execução da ordem inteira (split de ordem por orçamento) — um orçamento com serviços
   *  ONSITE e EXTERNAL gera duas ordens, cada uma homogénea no seu próprio modo. */
  executionMode: ExecutionMode;
  /** Só relevante quando status é AWAITING_RETURN (ciclo coleta/devolução) — a mesma ordem cobre
   *  coleta e devolução; bloqueada para reagendar até a lavandaria libertar o item. Sempre true em
   *  qualquer outro estado. */
  returnReady: boolean;
  address: {
    street: string;
    complement?: string;
    city?: string;
    postalCode?: string;
    country?: string;
  };
  status: OrderStatus;
  currencyCode: string;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  technicianId: string | null;
  technicianIds: string[];
  /** Quem aprovou o orçamento de origem — {@code null} quando foi o cliente pelo link público,
   *  id do utilizador quando pelo portal (normal ou direta). {@code null} também quando a ordem
   *  não nasceu de um orçamento (ex.: geração recorrente) — não confundir com "cliente aprovou";
   *  a UI decide qual dos dois é olhando {@link quotationId}. */
  approvedBy: string | null;
  items: OrderItem[];
  evidences: OrderEvidence[];
  transitions: OrderTransition[];
  /** Observação do escritório; {@code null} quando não há. */
  notes: string | null;
  /** Observação do técnico atribuído; {@code null} quando não há. Só leitura no portal. */
  technicianNote: string | null;
  costs: OrderCosts;
  subtotal: Money;
  /** Parte do desconto (no documento inteiro) que coube a esta ordem (issue #222). */
  discountAmount: Money;
  /** Parte do juro do parcelamento que coube a esta ordem (issue #222). */
  interestAmount: Money;
  /** subtotal − discountAmount — base real do que o cliente paga, sem juros. */
  netTotal: Money;
  /** netTotal + interestAmount — o que o cliente efetivamente paga. */
  grandTotal: Money;
  margin: Money;
  createdAt: string;
  updatedAt: string;
}

export type OrderMarginBasis = 'FORECAST' | 'FINAL' | 'CANCELLED';
export type OrderMarginHealth = 'GOOD' | 'LOW' | 'NEGATIVE' | 'NO_REVENUE';
export type OrderMarginCommissionState = 'NONE' | 'NOT_YET' | 'AWAITING_RATE' | 'KNOWN';

/** Resultado explicado de uma ordem — calculado no backend (`OrderMarginPolicy`), a UI só mostra.
 *  Custo não informado vem `null` (diferente de zero). `result` pode ser negativo (prejuízo). */
export interface OrderMargin {
  basis: OrderMarginBasis;
  orderValue: Money;
  discount: Money;
  revenue: Money;
  material: Money | null;
  travel: Money | null;
  labor: Money | null;
  costsInformed: boolean;
  commissionState: OrderMarginCommissionState;
  commission: Money | null;
  totalCosts: Money;
  result: Money;
  percent: number | null;
  health: OrderMarginHealth;
}

export interface OrderPage {
  content: Order[];
  page: { totalElements: number; totalPages: number; number: number; size: number };
}

@Injectable({ providedIn: 'root' })
export class OrderService {
  private http = inject(HttpClient);
  private readonly API = `${environment.apiUrl}/orders`;

  list(params?: {
    status?: string;
    technicianId?: string;
    customerId?: string;
    /** Busca por nome (case-insensitive, parcial) — resolvida para ids no backend antes de
     *  filtrar ordens, mesmo padrão de {@code QuotationService.list}. */
    customerName?: string;
    quotationId?: string;
    executionMode?: ExecutionMode;
    start?: string;
    end?: string;
    page?: number;
    size?: number;
    /** Spring Data sort (`campo,asc|desc`) — ordenação server-side da vista de lista. */
    sort?: string;
  }): Observable<OrderPage> {
    let p = new HttpParams().set('size', String(params?.size ?? 20)).set('page', String(params?.page ?? 0));
    if (params?.status) p = p.set('status', params.status);
    if (params?.technicianId) p = p.set('technicianId', params.technicianId);
    if (params?.customerId) p = p.set('customerId', params.customerId);
    if (params?.customerName) p = p.set('customerName', params.customerName);
    if (params?.quotationId) p = p.set('quotationId', params.quotationId);
    if (params?.executionMode) p = p.set('executionMode', params.executionMode);
    if (params?.start) p = p.set('start', params.start);
    if (params?.end) p = p.set('end', params.end);
    if (params?.sort) p = p.set('sort', params.sort);
    return this.http.get<OrderPage>(this.API, { params: p });
  }

  /** OS avulsa (issue #200) — sem orçamento: cliente + linhas de serviço. Preço/tipo vêm do
   *  catálogo no backend; a ordem nasce {@code CREATED}, sem técnico nem janela.
   *  Opcionalmente aceita condição de pagamento (issue #200 followup) para faturação. */
  create(payload: {
    customerId: string;
    items: { serviceId: string; quantity: number; executionMode?: ExecutionMode }[];
    paymentCondition?: string;
    paymentMethod?: string;
    installments?: number;
  }): Observable<Order> {
    return this.http.post<Order>(this.API, payload);
  }

  /** Ordens irmãs nascidas do mesmo orçamento (split de ordem por modo de execução) — 0, 1 ou 2. */
  siblingsByQuotation(quotationId: string): Observable<OrderPage> {
    return this.list({ quotationId, size: 10 });
  }

  /** Grava a comparação como nova evidência (tipo COMPARISON) da própria ordem. */
  saveEvidenceComparison(orderId: string, req: EvidenceComparisonRequest): Observable<OrderEvidence> {
    return this.http.post<OrderEvidence>(`${this.API}/${orderId}/evidences/comparison`, req);
  }

  /** Imagem da comparação para descarregar, sem gravar nada. */
  exportEvidenceComparison(orderId: string, req: EvidenceComparisonRequest): Observable<Blob> {
    return this.http.post(`${this.API}/${orderId}/evidences/comparison/export`, req, { responseType: 'blob' });
  }

  get(id: string): Observable<Order> {
    return this.http.get<Order>(`${this.API}/${id}`);
  }

  schedule(id: string, startLocal: string, endLocal: string): Observable<Order> {
    return this.http.post<Order>(`${this.API}/${id}/schedule`, { startLocal, endLocal });
  }

  reschedule(id: string, startLocal: string, endLocal: string): Observable<Order> {
    return this.http.post<Order>(`${this.API}/${id}/reschedule`, { startLocal, endLocal });
  }

  assign(id: string, technicianId: string, reassignReason?: string): Observable<Order> {
    return this.http.post<Order>(`${this.API}/${id}/assign`, { technicianId, reassignReason });
  }

  /** Quadro de disponibilidade por técnico desta ordem (mesmo componente do orçamento). Sugere,
   *  não reserva nada. `at` troca para "quais técnicos conseguem exatamente este instante"
   *  ("Escolher outra data e horário") e ignora `horizonDays`. */
  scheduleSuggestions(id: string, options?: { horizonDays?: number; at?: string }): Observable<OrderScheduleSuggestion[]> {
    let p = new HttpParams();
    if (options?.at) {
      p = p.set('at', options.at);
    } else if (options?.horizonDays) {
      p = p.set('horizonDays', String(options.horizonDays));
    }
    return this.http.get<OrderScheduleSuggestion[]>(`${this.API}/${id}/schedule-suggestions`, { params: p });
  }

  /** Grava a escolha de uma linha do quadro acima: agenda (ou reagenda) e atribui o técnico numa
   *  única ação. `reassignReason` só é exigido pelo backend quando a ordem já tem outro técnico. */
  chooseSchedule(id: string, technicianId: string, startAt: string, endAt: string,
                reassignReason?: string): Observable<Order> {
    return this.http.post<Order>(`${this.API}/${id}/choose-schedule`, { technicianId, startAt, endAt, reassignReason });
  }

  /** Ordem grande demais para um técnico: N técnicos numa janela candidata, cada um com a duração
   *  dividida. `viable` só é verdadeiro quando todos estão compatíveis. */
  jointCompatibility(id: string, technicianIds: string[], candidateStart: string): Observable<JointCompatibilityResult> {
    return this.http.post<JointCompatibilityResult>(`${this.API}/${id}/joint-compatibility`, { technicianIds, candidateStart });
  }

  /** Equipes e horários viáveis para a ordem (2+ técnicos em paralelo) — o sistema propõe. */
  jointSuggestions(id: string, horizonDays?: number): Observable<TeamSuggestions> {
    const params = horizonDays ? new HttpParams().set('horizonDays', String(horizonDays)) : new HttpParams();
    return this.http.get<TeamSuggestions>(`${this.API}/${id}/joint-suggestions`, { params });
  }

  /** Só quem tem as habilidades da ordem — base da escolha manual de equipe. */
  jointEligibleTechnicians(id: string): Observable<JointEligibleTechnician[]> {
    return this.http.get<JointEligibleTechnician[]>(`${this.API}/${id}/joint-eligible-technicians`);
  }

  /** Agenda e atribui N técnicos em paralelo; o fim é calculado no backend. */
  chooseJointSchedule(id: string, technicianIds: string[], startAt: string, reassignReason?: string): Observable<Order> {
    return this.http.post<Order>(`${this.API}/${id}/choose-joint-schedule`, { technicianIds, startAt, reassignReason });
  }

  /** Candidatos com skill/disponibilidade/capacidade/conflito já avaliados — sem tentar atribuir
   *  (a ordem precisa estar agendada; ver {@code ORDER_NOT_SCHEDULED}). */
  eligibleProviders(id: string): Observable<EligibleProvider[]> {
    return this.http.get<EligibleProvider[]>(`${this.API}/${id}/eligible-providers`);
  }

  /** Item ad-hoc: preço e tipo vêm do catálogo, só quantidade/execução são informados aqui — só
   *  enquanto a ordem está {@code CREATED}. */
  addItem(id: string, serviceId: string, quantity: number, executionMode?: ExecutionMode): Observable<Order> {
    return this.http.post<Order>(`${this.API}/${id}/items`, { serviceId, quantity, executionMode });
  }

  updateItem(id: string, itemId: string, payload: {
    quantity: number; unitPriceAmount: number; unitPriceCurrency: string; executionMode: ExecutionMode;
  }): Observable<Order> {
    return this.http.patch<Order>(`${this.API}/${id}/items/${itemId}`, payload);
  }

  removeItem(id: string, itemId: string): Observable<Order> {
    return this.http.delete<Order>(`${this.API}/${id}/items/${itemId}`);
  }

  checkIn(id: string): Observable<Order> {
    return this.http.post<Order>(`${this.API}/${id}/check-in`, {});
  }

  start(id: string): Observable<Order> {
    return this.http.post<Order>(`${this.API}/${id}/start`, {});
  }

  markPartiallyDone(id: string, note?: string): Observable<Order> {
    return this.http.post<Order>(`${this.API}/${id}/partial`, { note });
  }

  resume(id: string): Observable<Order> {
    return this.http.post<Order>(`${this.API}/${id}/resume`, {});
  }

  complete(id: string): Observable<Order> {
    return this.http.post<Order>(`${this.API}/${id}/complete`, {});
  }

  sign(id: string, justification?: string): Observable<Order> {
    return this.http.post<Order>(`${this.API}/${id}/sign`, { justification });
  }

  finish(id: string): Observable<Order> {
    return this.http.post<Order>(`${this.API}/${id}/finish`, {});
  }

  /** O motivo é obrigatório no backend (issue #59) — cancelar sem justificação é recusado. */
  cancel(id: string, reason: string): Observable<Order> {
    return this.http.post<Order>(`${this.API}/${id}/cancel`, { reason });
  }

  hold(id: string, note?: string): Observable<Order> {
    return this.http.post<Order>(`${this.API}/${id}/hold`, { note });
  }

  getMargin(id: string): Observable<OrderMargin> {
    return this.http.get<OrderMargin>(`${this.API}/${id}/margin`);
  }

  /** Custos operacionais para a margem (issue #103) — cada campo opcional, nulo mantém o valor atual. */
  updateCosts(id: string, payload: {
    materialAmount: number | null; materialCurrency: string | null;
    travelAmount: number | null; travelCurrency: string | null;
    laborAmount: number | null; laborCurrency: string | null;
  }): Observable<Order> {
    return this.http.put<Order>(`${this.API}/${id}/costs`, payload);
  }

  /** Observação do escritório — {@code null} ou vazio limpa. */
  updateNotes(id: string, notes: string | null): Observable<Order> {
    return this.http.put<Order>(`${this.API}/${id}/notes`, { notes });
  }
}
