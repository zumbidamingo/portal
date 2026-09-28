import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { UserRole } from '../models/user.model';

export type LeadSource = 'WEBSITE' | 'REFERRAL' | 'PHONE' | 'WHATSAPP' | 'SOCIAL_MEDIA' | 'WALK_IN' | 'OTHER';
export type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'CONVERTED' | 'LOST';
export type LeadInteractionType = 'CALL' | 'EMAIL' | 'WHATSAPP' | 'MEETING' | 'NOTE' | 'OTHER';
export type SalesLossReason = 'PRICE' | 'SCHEDULE' | 'COMPETITOR' | 'QUALITY_CONCERN' | 'NO_RESPONSE' | 'OTHER';

export interface LeadInteraction {
  id: string;
  type: LeadInteractionType;
  note: string | null;
  occurredAt: string;
  createdBy: string | null;
  createdAt: string;
}

export interface Lead {
  id: string;
  customerType: 'INDIVIDUAL' | 'COMPANY';
  name: string;
  email: string | null;
  phone: string | null;
  source: LeadSource;
  status: LeadStatus;
  assignedTo: string | null;
  lostReason: string | null;
  lostReasonCode: SalesLossReason | null;
  customerId: string | null;
  convertedAt: string | null;
  nextActionAt: string | null;
  nextActionNote: string | null;
  interactions: LeadInteraction[];
  createdAt: string;
  updatedAt: string;
}

export interface LeadPage {
  content: Lead[];
  page: { totalElements: number; totalPages: number; number: number; size: number };
}

export interface LeadQuery {
  search?: string | null;
  status?: LeadStatus | null;
  source?: LeadSource | null;
  assignedTo?: string | null;
  /** ISO date (yyyy-MM-dd), inclusive. */
  createdFrom?: string | null;
  /** ISO date (yyyy-MM-dd), inclusive. */
  createdTo?: string | null;
  page?: number;
  size?: number;
  sort?: string;
}

export interface LeadPayload {
  customerType?: 'INDIVIDUAL' | 'COMPANY' | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: LeadSource | null;
}

export interface LeadCreatePayload {
  name: string;
  email?: string | null;
  phone?: string | null;
  source?: LeadSource;
  customerType?: 'INDIVIDUAL' | 'COMPANY';
  assignedTo?: string | null;
}

export interface LeadInteractionPayload {
  type: LeadInteractionType;
  note?: string | null;
  occurredAt?: string | null;
}

export interface UpdateLeadStatusPayload {
  status: LeadStatus;
}

export interface MarkLeadLostPayload {
  reason?: string | null;
  lostReasonCode?: SalesLossReason | null;
}

export interface ReopenLeadPayload {
  reason: string;
}

export interface SetLeadNextActionPayload {
  nextActionAt: string | null;
  nextActionNote?: string | null;
}

export interface ConvertLeadPayload {
  customerType?: 'INDIVIDUAL' | 'COMPANY' | null;
  name?: string | null;
  taxId?: string | null;
}

export interface LeadConversionResult {
  lead: Lead;
  reusedExistingCustomer: boolean;
}

@Injectable({ providedIn: 'root' })
export class LeadService {
  private http = inject(HttpClient);
  private readonly API = `${environment.apiUrl}/leads`;

  list(query: LeadQuery): Observable<LeadPage> {
    let params = new HttpParams()
      .set('page', String(query.page ?? 0))
      .set('size', String(query.size ?? 20))
      .set('sort', query.sort ?? 'createdAt,desc');
    if (query.search?.trim()) params = params.set('search', query.search.trim());
    if (query.status) params = params.set('status', query.status);
    if (query.source) params = params.set('source', query.source);
    if (query.assignedTo) params = params.set('assignedTo', query.assignedTo);
    if (query.createdFrom) params = params.set('createdFrom', query.createdFrom);
    if (query.createdTo) params = params.set('createdTo', query.createdTo);
    return this.http.get<LeadPage>(this.API, { params });
  }

  get(id: string): Observable<Lead> {
    return this.http.get<Lead>(`${this.API}/${id}`);
  }

  create(payload: LeadCreatePayload): Observable<Lead> {
    return this.http.post<Lead>(this.API, payload);
  }

  update(id: string, payload: LeadPayload): Observable<Lead> {
    return this.http.put<Lead>(`${this.API}/${id}`, payload);
  }

  changeStatus(id: string, payload: UpdateLeadStatusPayload): Observable<Lead> {
    return this.http.patch<Lead>(`${this.API}/${id}/status`, payload);
  }

  markLost(id: string, payload: MarkLeadLostPayload): Observable<Lead> {
    return this.http.post<Lead>(`${this.API}/${id}/lost`, payload);
  }

  reopen(id: string, payload: ReopenLeadPayload): Observable<Lead> {
    return this.http.post<Lead>(`${this.API}/${id}/reopen`, payload);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.API}/${id}`);
  }

  convert(id: string, payload: ConvertLeadPayload): Observable<LeadConversionResult> {
    return this.http.post<LeadConversionResult>(`${this.API}/${id}/convert`, payload);
  }

  assign(id: string, assignedTo: string | null): Observable<Lead> {
    return this.http.patch<Lead>(`${this.API}/${id}/assign`, { assignedTo });
  }

  setNextAction(id: string, payload: SetLeadNextActionPayload): Observable<Lead> {
    return this.http.patch<Lead>(`${this.API}/${id}/next-action`, payload);
  }

  addInteraction(id: string, payload: LeadInteractionPayload): Observable<Lead> {
    return this.http.post<Lead>(`${this.API}/${id}/interactions`, payload);
  }
}
