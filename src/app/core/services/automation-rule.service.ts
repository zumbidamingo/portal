import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type ConditionMatchType = 'ALL' | 'ANY';
export type ConditionOperator = 'EQUALS' | 'NOT_EQUALS' | 'GREATER_THAN' | 'GREATER_THAN_OR_EQUAL'
  | 'LESS_THAN' | 'LESS_THAN_OR_EQUAL' | 'CONTAINS';
export type ActionType = 'SEND_EMAIL' | 'SEND_PUSH' | 'WEBHOOK';
export type ExecutionStatus = 'SUCCESS' | 'FAILED' | 'SKIPPED_CYCLE';

export const TRIGGER_EVENTS = ['quotation.approved', 'quotation.declined', 'order.finished', 'automation.rule.executed',
  'lead.created', 'lead.status_changed', 'lead.lost'] as const;
export type TriggerEvent = typeof TRIGGER_EVENTS[number];

/** Tipo do campo decide o controlo de valor: SELECT = conjunto fechado, NUMBER = grandeza, RULE = outra regra. */
export type CatalogFieldType = 'SELECT' | 'NUMBER' | 'RULE' | 'CUSTOMER';

export interface CatalogField {
  key: string;
  type: CatalogFieldType;
  options: string[];
  operators: ConditionOperator[];
}

export interface AutomationCatalog {
  triggers: Record<string, CatalogField[]>;
  /** Gatilhos cujo evento traz um cliente — só nesses o email pode ir "para o cliente". */
  customerRecipientTriggers: string[];
  /** Variáveis {{nome}} aceitas no assunto/mensagem do email, por gatilho. */
  messageVariables: Record<string, string[]>;
}

export interface RuleCondition {
  id?: string;
  field: string;
  operator: ConditionOperator;
  value: string;
  position?: number;
}

export interface RuleAction {
  id?: string;
  actionType: ActionType;
  target: string | null;
  /** Só SEND_EMAIL: assunto e mensagem com variáveis {{nome}} resolvidas no envio. */
  subject?: string | null;
  message?: string | null;
  position?: number;
}

export interface AutomationRule {
  id: string;
  name: string;
  description: string | null;
  triggerEvent: string;
  matchType: ConditionMatchType;
  active: boolean;
  conditions: RuleCondition[];
  actions: RuleAction[];
  createdAt: string;
  updatedAt: string;
  lastExecutionAt: string | null;
  lastExecutionStatus: ExecutionStatus | null;
}

export interface AutomationExecution {
  id: string;
  ruleId: string;
  sourceEventType: string;
  sourceAggregateId: string | null;
  status: ExecutionStatus;
  detail: string | null;
  executedAt: string;
}

export interface PreviewResult {
  wouldMatch: boolean;
  resolvedFacts: Record<string, unknown>;
  wouldExecuteActions: string[];
}

export interface Page<T> {
  content: T[];
  page: { totalElements: number; totalPages: number; number: number; size: number };
}

@Injectable({ providedIn: 'root' })
export class AutomationRuleService {
  private http = inject(HttpClient);
  private readonly API = `${environment.apiUrl}/automation/rules`;

  listRules(active?: boolean): Observable<Page<AutomationRule>> {
    let params = new HttpParams().set('size', '100');
    if (active !== undefined) params = params.set('active', String(active));
    return this.http.get<Page<AutomationRule>>(this.API, { params });
  }

  catalog(): Observable<AutomationCatalog> {
    return this.http.get<AutomationCatalog>(`${this.API}/catalog`);
  }

  getRule(id: string): Observable<AutomationRule> {
    return this.http.get<AutomationRule>(`${this.API}/${id}`);
  }

  createRule(payload: {
    name: string; description: string | null; triggerEvent: string; matchType: ConditionMatchType;
    conditions: RuleCondition[]; actions: RuleAction[];
  }): Observable<AutomationRule> {
    return this.http.post<AutomationRule>(this.API, payload);
  }

  updateRule(id: string, payload: {
    name: string; description: string | null; matchType: ConditionMatchType;
    conditions: RuleCondition[]; actions: RuleAction[];
  }): Observable<AutomationRule> {
    return this.http.put<AutomationRule>(`${this.API}/${id}`, payload);
  }

  setRuleActive(id: string, active: boolean): Observable<AutomationRule> {
    return this.http.patch<AutomationRule>(`${this.API}/${id}/active`, { active });
  }

  deleteRule(id: string): Observable<void> {
    return this.http.delete<void>(`${this.API}/${id}`);
  }

  previewRule(id: string, sampleAggregateId: string): Observable<PreviewResult> {
    return this.http.post<PreviewResult>(`${this.API}/${id}/preview`, { sampleAggregateId });
  }

  executions(ruleId: string): Observable<Page<AutomationExecution>> {
    return this.http.get<Page<AutomationExecution>>(`${this.API}/${ruleId}/executions`,
      { params: new HttpParams().set('size', '20') });
  }
}
