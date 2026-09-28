import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Page } from './automation-rule.service';

export type Periodicity = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY';

export interface RecurringContract {
  id: string;
  customerId: string;
  customerName: string | null;
  quotationId: string;
  serviceNames: string[];
  periodicity: Periodicity;
  nextRunDate: string;
  lastRunDate: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type RecurringCycleStatus = 'GENERATED' | 'SKIPPED' | 'FAILED';

export interface RecurringOrderGeneration {
  id: string;
  cycleDate: string;
  status: RecurringCycleStatus;
  orderId: string | null;
  reasonCode: string | null;
  reasonDetail: string | null;
  createdAt: string;
  updatedAt: string;
}

export type { Page };

@Injectable({ providedIn: 'root' })
export class RecurringContractService {
  private http = inject(HttpClient);
  private readonly API = `${environment.apiUrl}/automation/recurring-contracts`;

  list(active?: boolean): Observable<Page<RecurringContract>> {
    let params = new HttpParams().set('size', '100');
    if (active !== undefined) params = params.set('active', String(active));
    return this.http.get<Page<RecurringContract>>(this.API, { params });
  }

  create(payload: { quotationId: string; periodicity: Periodicity; firstRunDate: string }): Observable<RecurringContract> {
    return this.http.post<RecurringContract>(this.API, payload);
  }

  update(id: string, payload: { periodicity: Periodicity }): Observable<RecurringContract> {
    return this.http.put<RecurringContract>(`${this.API}/${id}`, payload);
  }

  setActive(id: string, active: boolean): Observable<RecurringContract> {
    return this.http.patch<RecurringContract>(`${this.API}/${id}/active`, { active });
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.API}/${id}`);
  }

  generations(id: string): Observable<Page<RecurringOrderGeneration>> {
    return this.http.get<Page<RecurringOrderGeneration>>(`${this.API}/${id}/generations`,
      { params: new HttpParams().set('size', '50') });
  }
}
