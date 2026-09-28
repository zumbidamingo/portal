import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Page } from './automation-rule.service';
import { Quotation } from './quotation.service';

export type ServiceMatchLevel = 'SERVICE' | 'CATEGORY';
export type ReactivationDefaultAction = 'NONE' | 'NOTIFY_OPERATOR' | 'CREATE_TASK' | 'SEND_WHATSAPP';

export interface ServiceRecurrencePolicy {
  id: string;
  matchLevel: ServiceMatchLevel;
  serviceId: string | null;
  categoryId: string | null;
  intervalDays: number;
  defaultAction: ReactivationDefaultAction;
  cooldownDays: number;
  maxAttempts: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceRecurrencePolicyPayload {
  intervalDays: number;
  defaultAction: ReactivationDefaultAction;
  cooldownDays: number;
  maxAttempts: number;
}

export interface CreateServiceRecurrencePolicyPayload extends ServiceRecurrencePolicyPayload {
  serviceId: string | null;
  categoryId: string | null;
}

export type ReactivationOpportunityStatus =
  'DETECTED' | 'CONTACTED' | 'RESPONDED' | 'SCHEDULED' | 'DECLINED' | 'IGNORED' | 'SNOOZED';
export type ReactivationInteractionChannel = 'WHATSAPP' | 'EMAIL' | 'PHONE' | 'IN_PERSON' | 'SYSTEM';
export type ReactivationInteractionOutcome =
  'CONTACTED' | 'RESPONDED' | 'SCHEDULED' | 'DECLINED' | 'NO_ANSWER' | 'REQUESTED_LATER_CONTACT';

export interface ReactivationInteraction {
  id: string;
  channel: ReactivationInteractionChannel;
  outcome: ReactivationInteractionOutcome;
  note: string | null;
  performedBy: string | null;
  performedByName: string | null;
  createdAt: string;
}

export interface ReactivationOpportunity {
  id: string;
  status: ReactivationOpportunityStatus;
  serviceId: string | null;
  serviceName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  customerId: string;
  customerName: string | null;
  policyId: string | null;
  anchorOrderId: string | null;
  dueAt: string;
  lastFinishedAt: string | null;
  contactAttempts: number;
  lastContactAt: string | null;
  resultingQuotationId: string | null;
  assignedTo: string | null;
  assignedToName: string | null;
  snoozeUntil: string | null;
  createdAt: string;
  updatedAt: string;
  interactions: ReactivationInteraction[];
}

export interface RecordInteractionPayload {
  channel: ReactivationInteractionChannel;
  outcome: ReactivationInteractionOutcome;
  note: string | null;
}

export interface SnoozePayload {
  channel: ReactivationInteractionChannel;
  until: string;
  note: string | null;
}

export interface OpportunityQuotationPayload {
  serviceId: string | null;
  quantity: number | null;
  validUntil: string;
  terms: string | null;
  paymentTerms: string | null;
}

@Injectable({ providedIn: 'root' })
export class RetentionService {
  private http = inject(HttpClient);
  private readonly POLICIES = `${environment.apiUrl}/retention/recurrence-policies`;
  private readonly OPPORTUNITIES = `${environment.apiUrl}/retention/opportunities`;

  listPolicies(active?: boolean): Observable<Page<ServiceRecurrencePolicy>> {
    let params = new HttpParams().set('size', '100');
    if (active !== undefined) params = params.set('active', String(active));
    return this.http.get<Page<ServiceRecurrencePolicy>>(this.POLICIES, { params });
  }

  createPolicy(payload: CreateServiceRecurrencePolicyPayload): Observable<ServiceRecurrencePolicy> {
    return this.http.post<ServiceRecurrencePolicy>(this.POLICIES, payload);
  }

  updatePolicy(id: string, payload: ServiceRecurrencePolicyPayload): Observable<ServiceRecurrencePolicy> {
    return this.http.put<ServiceRecurrencePolicy>(`${this.POLICIES}/${id}`, payload);
  }

  setPolicyActive(id: string, active: boolean): Observable<ServiceRecurrencePolicy> {
    return this.http.patch<ServiceRecurrencePolicy>(`${this.POLICIES}/${id}/active`, { active });
  }

  deletePolicy(id: string): Observable<void> {
    return this.http.delete<void>(`${this.POLICIES}/${id}`);
  }

  listOpportunities(status: ReactivationOpportunityStatus, size = 50): Observable<Page<ReactivationOpportunity>> {
    const params = new HttpParams().set('status', status).set('size', String(size));
    return this.http.get<Page<ReactivationOpportunity>>(this.OPPORTUNITIES, { params });
  }

  getOpportunity(id: string): Observable<ReactivationOpportunity> {
    return this.http.get<ReactivationOpportunity>(`${this.OPPORTUNITIES}/${id}`);
  }

  recordInteraction(id: string, payload: RecordInteractionPayload): Observable<ReactivationOpportunity> {
    return this.http.post<ReactivationOpportunity>(`${this.OPPORTUNITIES}/${id}/interactions`, payload);
  }

  snooze(id: string, payload: SnoozePayload): Observable<ReactivationOpportunity> {
    return this.http.post<ReactivationOpportunity>(`${this.OPPORTUNITIES}/${id}/snooze`, payload);
  }

  generateQuotation(id: string, payload: OpportunityQuotationPayload): Observable<Quotation> {
    return this.http.post<Quotation>(`${this.OPPORTUNITIES}/${id}/quotation`, payload);
  }
}
