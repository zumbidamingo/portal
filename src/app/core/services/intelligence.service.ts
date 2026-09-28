import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Page } from './automation-rule.service';

export type AiRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type AiDecisionStatus =
  'RECOMMENDED' | 'PENDING_APPROVAL' | 'APPROVED' | 'EXECUTED' | 'REJECTED' | 'EXPIRED' | 'FAILED';
export type AiAgentId =
  'SALES' | 'PRICING' | 'DISPATCHER' | 'ROUTE_PLANNER' | 'TECHNICIAN_COPILOT' | 'QUALITY_INSPECTOR'
  | 'BUSINESS_ADVISOR' | 'ACTION_CENTER';
export type AiActionType =
  'CREATE_QUOTATION' | 'CREATE_FOLLOWUP' | 'ASSIGN_TECHNICIAN' | 'APPLY_QUOTATION_DISCOUNT'
  | 'CHANGE_SERVICE_PRICE' | 'CANCEL_ORDER';

/**
 * Decisão da IA como a fila de aprovação a mostra. `canDecide` vem decidido do backend (estado,
 * prazo e o perfil de quem olha): o portal só mostra ou esconde os botões, não recalcula a regra.
 */
export interface AiDecision {
  id: string;
  agent: AiAgentId;
  actionType: AiActionType | null;
  status: AiDecisionStatus;
  riskLevel: AiRiskLevel;
  recommendation: string;
  reason: string | null;
  dataUsed: Record<string, unknown> | null;
  estimatedImpact: string | null;
  confidence: number | null;
  actionPayload: Record<string, unknown> | null;
  autoExecuted: boolean;
  requestedBy: string | null;
  expiresAt: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  executedAt: string | null;
  failureReason: string | null;
  createdAt: string;
  canDecide: boolean;
}

/** `executed` falso com a decisão em FAILED = aprovação registada, mas o domínio recusou a ação. */
export interface AiDecisionResolution {
  decision: AiDecision;
  executed: boolean;
  message: string | null;
}

/** `configured*` nulos = sem política do tenant; `effective*` é o que vale de facto. */
export interface AiPolicy {
  actionType: AiActionType;
  defaultRisk: AiRiskLevel;
  configuredRisk?: AiRiskLevel;
  configuredAutoExecute?: boolean;
  effectiveRisk: AiRiskLevel;
  effectiveAutoExecute: boolean;
}

export interface AiAgentUsage {
  agent: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  credits: number;
}

/** `creditsLimit` -1 é sem teto e 0 é IA fechada neste plano. */
export interface AiUsage {
  windowStart: string;
  creditsLimit: number;
  creditsUsed: number;
  exhausted: boolean;
  modelAvailable: boolean;
  pendingApprovals: number;
  byAgent: AiAgentUsage[];
}

@Injectable({ providedIn: 'root' })
export class IntelligenceService {
  private readonly http = inject(HttpClient);
  private readonly BASE = `${environment.apiUrl}/intelligence`;

  listDecisions(status: AiDecisionStatus | null, page = 0, size = 20): Observable<Page<AiDecision>> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (status) params = params.set('status', status);
    return this.http.get<Page<AiDecision>>(`${this.BASE}/decisions`, { params });
  }

  pendingCount(): Observable<number> {
    return this.http.get<number>(`${this.BASE}/decisions/pending-count`);
  }

  approve(id: string): Observable<AiDecisionResolution> {
    return this.http.post<AiDecisionResolution>(`${this.BASE}/decisions/${id}/approve`, {});
  }

  reject(id: string): Observable<AiDecision> {
    return this.http.post<AiDecision>(`${this.BASE}/decisions/${id}/reject`, {});
  }

  listPolicies(): Observable<AiPolicy[]> {
    return this.http.get<AiPolicy[]>(`${this.BASE}/policies`);
  }

  setPolicy(actionType: AiActionType, riskLevel: AiRiskLevel | null, autoExecute: boolean): Observable<AiPolicy> {
    return this.http.put<AiPolicy>(`${this.BASE}/policies/${actionType}`, { riskLevel, autoExecute });
  }

  usage(): Observable<AiUsage> {
    return this.http.get<AiUsage>(`${this.BASE}/usage`);
  }
}
