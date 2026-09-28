import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { PaymentMethod } from './financial.service';
import type { PaymentCondition } from './payment-method.service';

export type { PaymentMethod };
export type { PaymentCondition };

export type QuotationStatus = 'DRAFT' | 'SENT' | 'APPROVED' | 'DECLINED' | 'EXPIRED';
export type PriceType = 'FIXED' | 'PER_SQUARE_METER' | 'PER_PIECE' | 'PER_HOUR';
export type DiscountType = 'PERCENTAGE' | 'AMOUNT';
export type ExecutionMode = 'ONSITE' | 'EXTERNAL';
/** Estratégia de split de atendimento escolhida pelo usuário: mesmo prestador em duas visitas
 *  consecutivas, ou dois prestadores diferentes. */
export type SplitStrategy = 'SAME' | 'TWO';

export interface QuotationItem {
  id: string;
  serviceId: string;
  description: string;
  priceType: PriceType;
  /** Onde esta linha é executada — base do agrupamento por grupo de agendamento (issue #177). */
  executionMode: ExecutionMode;
  /** Duração congelada na emissão da linha (issue #172). */
  durationMinutes: number;
  /** 1 ou 2 — a qual visita este item pertence quando o grupo foi dividido por não caber numa
   *  única janela do prestador (split de atendimento); 1 no caso normal, sem split. */
  scheduleSequence: 1 | 2;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  /** Como {@link discountValue} foi digitado — o orçamento reaberto mostra de volta a mesma
   *  seleção (% ou valor), não um número monetário que o usuário teria de reinterpretar. */
  discountType: DiscountType;
  discountValue: number;
  lineTotal: number;
}

export interface Quotation {
  id: string;
  /** Referência comercial legível, sequencial e imutável por tenant (ex.: 123 → "Orçamento nº 000123") —
   *  a única referência ao orçamento mostrada ao usuário. {@link id} é só o identificador técnico
   *  interno (rotas da API), nunca exibido em texto, título, breadcrumb, tabela ou mensagem. */
  quotationNumber: number;
  customerId: string;
  status: QuotationStatus;
  currency: string;
  validUntil: string;
  subtotal: number;
  discountAmount: number;
  /** Como o desconto do orçamento inteiro foi digitado — mesmo par de redisplay de {@link QuotationItem}. */
  discountType: DiscountType;
  discountValue: number;
  /** Condição de pagamento escolhida (à vista/a prazo — reestruturação de Formas de Pagamento);
   *  `null` enquanto não escolhida. Pai de {@link paymentMethod}; distinta de {@link paymentTerms}
   *  (texto livre legado, só histórico). */
  paymentCondition: PaymentCondition | null;
  /** Meio de pagamento escolhido dentro de {@link paymentCondition}. `null` enquanto não
   *  escolhido. */
  paymentMethod: PaymentMethod | null;
  /** Quantidade de parcelas escolhida — só quando a condição é `DEFERRED` e `paymentMethod` é
   *  `CREDIT_CARD`; `null` nos demais casos. */
  installments: number | null;
  /** Percentual de juros congelado no instante da escolha — zero sem forma de pagamento com juros. */
  paymentMethodInterestPercentage: number;
  /** Valor original antes do juro — soma das linhas menos o desconto do orçamento inteiro. */
  amountBeforeInterest: number;
  /** Valor de juros somado ao total — zero sem forma de pagamento com juros escolhida. */
  interestAmount: number;
  total: number;
  terms: string | null;
  paymentTerms: string | null;
  items: QuotationItem[];
  createdAt: string;
  updatedAt: string;
  /** Orçamento imediatamente anterior da cadeia, quando este nasceu de uma renegociação — `null`
   *  na primeira versão de cada negociação. */
  supersedesId: string | null;
  /** Rótulo de posição na cadeia (1, 2, 3...) — não é chave, só redisplay ("Revisão 2"). */
  revisionNumber: number;
  /** Motivo da recusa, texto livre opcional — preenchido por quem recusou. */
  declineReason: string | null;
  /** Quando o orçamento foi enviado/reenviado ao cliente — `null` enquanto DRAFT. Atualizado a
   *  cada reenvio (issue #227). */
  sentAt: string | null;
  /** Utilizador que enviou/reenviou — `null` enquanto DRAFT. Atualizado no reenvio. */
  sentBy: string | null;
  /** `true` quando este orçamento já foi renegociado (existe uma revisão mais recente encadeada
   *  por cima dele) — gate da ação "Renegociar": só a ponta ativa da cadeia aceita. */
  superseded: boolean;
}

/** Uma linha do histórico de envio (issue #227) — `quotation_sends`, append-only: uma entrada por
 *  send/resend, mais recente primeiro. Distinto de {@link Quotation.sentAt}/`sentBy`, que
 *  continuam como atalho "último envio" (sobrescrito a cada reenvio) — esta lista é o registo
 *  completo por trás. */
export interface QuotationSendEntry {
  id: string;
  sentAt: string;
  sentBy: string | null;
  /** Nome resolvido pelo backend a partir do utilizador — `null` quando ele foi apagado depois. */
  sentByName: string | null;
}

/** Um elo da cadeia de renegociação, do primeiro envio à revisão mais recente — carrega os totais
 *  congelados daquela versão para a comparação básica entre revisões (row expansion da listagem). */
export interface QuotationHistoryEntry {
  id: string;
  quotationNumber: number;
  revisionNumber: number;
  status: QuotationStatus;
  createdAt: string;
  declineReason: string | null;
  validUntil: string;
  subtotal: number;
  discountAmount: number;
  discountType: DiscountType;
  discountValue: number;
  total: number;
}

/** Uma linha do quadro de disponibilidade por técnico (issue #177). */
export interface ScheduleSuggestion {
  providerId: string;
  technicianUserId: string;
  technicianName: string | null;
  date: string;
  startAt: string;
  endAt: string;
  /** Rota existente onde encaixa; `null` quando a rota do dia daquele técnico ainda vai nascer. */
  routeId: string | null;
  extraKm: number;
  extraMinutes: number;
}

/** Agendamento escolhido para um grupo de modo de execução (issue #177). Não é reserva: o slot
 *  é revalidado na aprovação do orçamento. `sequence` é >= 1 — "visita N" quando o grupo foi
 *  dividido por não caber numa única janela do prestador (split de atendimento); 1 no caso
 *  normal, sem split. `technicianIds` tem 1 elemento no caso normal, N numa rota conjunta (mesma
 *  janela, em paralelo — issue N prestadores). */
export interface QuotationSchedule {
  id: string;
  executionMode: ExecutionMode;
  sequence: number;
  technicianIds: string[];
  technicianNames: (string | null)[];
  scheduledStartAt: string;
  scheduledEndAt: string;
  routeId: string | null;
}

/** Técnico elegível por skill+prontidão para um grupo (issue N prestadores) — sem olhar agenda
 *  nenhuma. Oferecido para seleção manual de rota conjunta quando nem o split automático resolve
 *  (`SplitProposal.splitPossible=false`). */
export interface EligibleProvider {
  technicianUserId: string;
  technicianName: string | null;
}

/** Equipes + horário que o sistema já validou (habilidades, jornada, almoço, agenda, capacidade)
 *  para um serviço que precisa de mais de um técnico. `eligibleCount` 0 = ninguém tem a
 *  habilidade; `teamSize` 0 = sem sugestão. Compartilhado por orçamento e ordem. */
export interface TeamSuggestions {
  eligibleCount: number;
  teamSize: number;
  suggestions: TeamSuggestion[];
}

export interface TeamSuggestion {
  members: { technicianUserId: string; technicianName: string | null }[];
  date: string;
  startAt: string;
  endAt: string;
  perTechnicianMinutes: number;
}

/** Resultado da checagem de compatibilidade de agenda entre N técnicos numa janela candidata
 *  (issue N prestadores). `viable` só verdadeiro quando todos os `technicians` vêm
 *  `compatible=true`. */
export interface JointCompatibilityResult {
  viable: boolean;
  start: string;
  end: string;
  perTechnicianMinutes: number;
  technicians: JointTechnicianCompatibility[];
}

/** `reasonCode` nulo quando `compatible`; senão um de: `TECHNICIAN_NOT_FOUND`,
 *  `MISSING_SKILL`, `NOT_READY`, `NO_STRUCTURAL_WINDOW`, `ALREADY_BOOKED`. */
export interface JointTechnicianCompatibility {
  technicianUserId: string;
  technicianName: string | null;
  compatible: boolean;
  reasonCode: string | null;
}

/** Uma das N visitas de um grupo dividido — itens e duração (já com tolerância recomputada só
 *  para esse subconjunto) dessa visita. */
export interface VisitPlan {
  itemIds: string[];
  minutes: number;
}

/** Este grupo não cabe numa única janela de nenhum técnico elegível, mesmo no melhor caso —
 *  precisa ser dividido em N visitas. `splitPossible=false` quando nem o corte automático
 *  resolve (ex.: um único item já excede o máximo) — `visits` vem vazia e a UI oferece seleção
 *  manual de rota conjunta em vez das visitas. */
export interface SplitProposal {
  requiredMinutes: number;
  maxSingleWindowMinutes: number;
  splitPossible: boolean;
  visits: VisitPlan[];
}

/** Resposta do quadro de disponibilidade — `splitProposal` vem preenchido exatamente quando
 *  `candidates` está vazio por impossibilidade estrutural (nunca por falta de sugestão dentro do
 *  horizonte, que continua candidates vazio + splitProposal nulo). */
export interface ScheduleSuggestionsResult {
  candidates: ScheduleSuggestion[];
  splitProposal: SplitProposal | null;
}

export interface QuotationPage {
  content: Quotation[];
  page: { totalElements: number; totalPages: number; number: number; size: number };
}

export interface QuotationNumbering {
  nextNumber: number;
}

@Injectable({ providedIn: 'root' })
export class QuotationService {
  private http = inject(HttpClient);
  private readonly API = `${environment.apiUrl}/quotations`;

  /** Lazy load real (paginado/ordenado no servidor) — `createdAtFrom`/`createdAtTo` cobrem o
   *  filtro de período de criação, `customerName` busca por nome digitado (o backend resolve para ids antes
   *  de filtrar orçamentos). `includeSuperseded=true` inclui orçamentos já renegociados
   *  (escondidos por padrão) — "Mostrar superados" na listagem. */
  list(query: {
    status?: QuotationStatus | null; customerName?: string | null; customerId?: string | null;
    validUntilFrom?: string | null; validUntilTo?: string | null;
    createdAtFrom?: string | null; createdAtTo?: string | null;
    includeSuperseded?: boolean; page?: number; size?: number; sort?: string;
  } = {}): Observable<QuotationPage> {
    let params = new HttpParams()
      .set('page', String(query.page ?? 0))
      .set('size', String(query.size ?? 20));
    if (query.status) params = params.set('status', query.status);
    if (query.customerName?.trim()) params = params.set('customerName', query.customerName.trim());
    if (query.customerId) params = params.set('customerId', query.customerId);
    if (query.validUntilFrom) params = params.set('validUntilFrom', query.validUntilFrom);
    if (query.validUntilTo) params = params.set('validUntilTo', query.validUntilTo);
    if (query.createdAtFrom) params = params.set('createdAtFrom', query.createdAtFrom);
    if (query.createdAtTo) params = params.set('createdAtTo', query.createdAtTo);
    if (query.includeSuperseded) params = params.set('includeSuperseded', 'true');
    if (query.sort) params = params.set('sort', query.sort);
    return this.http.get<QuotationPage>(this.API, { params });
  }

  get(id: string): Observable<Quotation> {
    return this.http.get<Quotation>(`${this.API}/${id}`);
  }

  create(payload: { customerId: string; validUntil?: string; terms?: string; paymentTerms?: string }): Observable<Quotation> {
    return this.http.post<Quotation>(this.API, payload);
  }

  /** Só aceita orçamentos em DRAFT — mesma trava de {@link Quotation#requireEditable}. */
  updateConditions(id: string, payload: { validUntil: string; terms?: string; paymentTerms?: string }): Observable<Quotation> {
    return this.http.patch<Quotation>(`${this.API}/${id}/conditions`, payload);
  }

  /** Só aceita orçamentos em DRAFT — o backend recusa com 422 QUOTATION_NOT_DRAFT nos demais estados. */
  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.API}/${id}`);
  }

  addItem(id: string, payload: { serviceId: string; quantity: number }): Observable<Quotation> {
    return this.http.post<Quotation>(`${this.API}/${id}/items`, payload);
  }

  setItemDiscount(id: string, itemId: string, payload: { discountType: DiscountType; discountValue: number }): Observable<Quotation> {
    return this.http.patch<Quotation>(`${this.API}/${id}/items/${itemId}/discount`, payload);
  }

  setDiscount(id: string, payload: { discountType: DiscountType; discountValue: number }): Observable<Quotation> {
    return this.http.patch<Quotation>(`${this.API}/${id}/discount`, payload);
  }

  /** O backend resolve o percentual de juros a partir da configuração vigente do tenant — nunca
   *  aceita um percentual vindo do request (CLAUDE.md §12). `method` precisa estar habilitado
   *  para `condition` (reestruturação de Formas de Pagamento) — o backend recusa a combinação
   *  senão. `installments` só é obrigatório para `condition = DEFERRED` + `CREDIT_CARD`. */
  setPaymentMethod(id: string, condition: PaymentCondition, method: PaymentMethod, installments?: number | null): Observable<Quotation> {
    return this.http.patch<Quotation>(`${this.API}/${id}/payment-method`, { condition, method, installments: installments ?? null });
  }

  removeItem(id: string, itemId: string): Observable<Quotation> {
    return this.http.delete<Quotation>(`${this.API}/${id}/items/${itemId}`);
  }

  /** Quadro de disponibilidade por técnico para um grupo de modo de execução (issue #177).
   *  `itemIds` restringe a um subconjunto do grupo (busca de uma visita já dividida — split de
   *  atendimento); `technicianId`/`excludeTechnicianId`/`notBefore` seguem a estratégia de split
   *  escolhida (mesmo prestador vs. dois prestadores). Sem `itemIds`, é a chamada "cheia" — a
   *  única que pode devolver `splitProposal` preenchido. `at` troca para outra pergunta — quais
   *  técnicos elegíveis conseguem exatamente aquele instante ("Escolher outra data e horário") —
   *  e ignora os demais campos de `options`. */
  scheduleSuggestions(id: string, executionMode: ExecutionMode, options?: {
    horizonDays?: number; itemIds?: string[]; technicianId?: string;
    excludeTechnicianId?: string; notBefore?: string; at?: string;
  }): Observable<ScheduleSuggestionsResult> {
    let params = new HttpParams().set('executionMode', executionMode);
    if (options?.at) {
      params = params.set('at', options.at);
      return this.http.get<ScheduleSuggestionsResult>(`${this.API}/${id}/schedule-suggestions`, { params });
    }
    if (options?.horizonDays) params = params.set('horizonDays', String(options.horizonDays));
    if (options?.itemIds?.length) params = params.set('itemIds', options.itemIds.join(','));
    if (options?.technicianId) params = params.set('technicianId', options.technicianId);
    if (options?.excludeTechnicianId) params = params.set('excludeTechnicianId', options.excludeTechnicianId);
    if (options?.notBefore) params = params.set('notBefore', options.notBefore);
    return this.http.get<ScheduleSuggestionsResult>(`${this.API}/${id}/schedule-suggestions`, { params });
  }

  schedules(id: string): Observable<QuotationSchedule[]> {
    return this.http.get<QuotationSchedule[]>(`${this.API}/${id}/schedules`);
  }

  /** Sem split: uma choice por modo (sequence 1, itemIds = todos os itens do modo, technicianIds
   *  com 1 elemento). Com split: N choices para o mesmo modo (sequences 1..N), cada uma com o seu
   *  subconjunto de itens — a união de todas tem de cobrir exatamente os itens do modo. Rota
   *  conjunta: technicianIds com N elementos numa única choice (mesma janela, em paralelo). */
  setSchedules(
    id: string,
    schedules: Array<{
      executionMode: ExecutionMode;
      sequence: number;
      itemIds: string[];
      technicianIds: string[];
      scheduledStartAt: string;
      scheduledEndAt: string;
      routeId: string | null;
    }>,
  ): Observable<QuotationSchedule[]> {
    return this.http.put<QuotationSchedule[]>(`${this.API}/${id}/schedules`, { schedules });
  }

  /** Desfaz a escolha de agendamento de um grupo (issue #177) — idempotente, sem erro se já não houver escolha. */
  cancelSchedule(id: string, executionMode: ExecutionMode): Observable<void> {
    return this.http.delete<void>(`${this.API}/${id}/schedules/${executionMode}`);
  }

  /** Técnicos elegíveis por skill+prontidão para este grupo (issue N prestadores) — seleção
   *  manual de rota conjunta quando nem o split automático resolve. */
  eligibleProviders(id: string, executionMode: ExecutionMode): Observable<EligibleProvider[]> {
    return this.http.get<EligibleProvider[]>(`${this.API}/${id}/schedule/${executionMode}/eligible-providers`);
  }

  /** Equipes e horários viáveis para o grupo (2+ técnicos em paralelo) — o sistema propõe. */
  jointSuggestions(id: string, executionMode: ExecutionMode, horizonDays?: number): Observable<TeamSuggestions> {
    const params = horizonDays ? new HttpParams().set('horizonDays', String(horizonDays)) : new HttpParams();
    return this.http.get<TeamSuggestions>(`${this.API}/${id}/schedule/${executionMode}/joint-suggestions`, { params });
  }

  /** Compatibilidade de agenda de N técnicos numa janela candidata (issue N prestadores) —
   *  recalculado a cada mudança de seleção. */
  jointCompatibility(
    id: string, executionMode: ExecutionMode, technicianIds: string[], candidateStart: string,
  ): Observable<JointCompatibilityResult> {
    return this.http.post<JointCompatibilityResult>(
      `${this.API}/${id}/schedule/${executionMode}/joint-compatibility`, { technicianIds, candidateStart });
  }

  send(id: string): Observable<{ publicToken: string }> {
    return this.http.post<{ publicToken: string }>(`${this.API}/${id}/send`, {});
  }

  /** Reenvia um orçamento já SENT com um token público novo — recuperação quando o e-mail
   *  falhou ou o link (24h) expirou; só SENT aceita. */
  resend(id: string): Observable<{ publicToken: string }> {
    return this.http.post<{ publicToken: string }>(`${this.API}/${id}/resend`, {});
  }

  /** Aprova diretamente pelo portal, sem o passo de envio — só DRAFT aceita; o backend recusa
   *  com 422 se o parâmetro do sistema estiver desligado ou o cliente não tiver morada. */
  approveDirectly(id: string): Observable<Quotation> {
    return this.http.post<Quotation>(`${this.API}/${id}/approve-directly`, {});
  }

  /** Cria uma nova revisão, em DRAFT, pré-preenchida com os itens e o desconto de um orçamento
   *  DECLINED — só a ponta ativa da cadeia (não superada) aceita. */
  renegotiate(id: string): Observable<Quotation> {
    return this.http.post<Quotation>(`${this.API}/${id}/renegotiate`, {});
  }

  /** Reabre um orçamento recusado (DECLINED → SENT) sem gerar uma revisão nova (issue #211) —
   *  alternativa mais leve à renegociação quando a objeção foi resolvida por telefone. */
  reopen(id: string): Observable<Quotation> {
    return this.http.post<Quotation>(`${this.API}/${id}/reopen`, {});
  }

  /** Cadeia completa de renegociação, do primeiro envio à revisão mais recente. */
  history(id: string): Observable<QuotationHistoryEntry[]> {
    return this.http.get<QuotationHistoryEntry[]>(`${this.API}/${id}/history`);
  }

  /** Histórico de envio (issue #227) — uma entrada por send/resend, mais recente primeiro. */
  sends(id: string): Observable<QuotationSendEntry[]> {
    return this.http.get<QuotationSendEntry[]>(`${this.API}/${id}/sends`);
  }

  pdf(id: string): Observable<string> {
    return this.http.post<string>(`${this.API}/${id}/pdf`, {});
  }

  getNumbering(): Observable<QuotationNumbering> {
    return this.http.get<QuotationNumbering>(`${this.API}/numbering`);
  }

  /** Só para a frente: o backend recusa com 422 QUOTATION_NUMBER_BEFORE_NEXT um número abaixo do
   *  próximo, que colidiria com orçamentos já emitidos. */
  setStartingNumber(startingNumber: number): Observable<QuotationNumbering> {
    return this.http.put<QuotationNumbering>(`${this.API}/numbering`, { startingNumber });
  }
}