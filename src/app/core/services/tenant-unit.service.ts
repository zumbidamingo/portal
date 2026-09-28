import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface TenantUnit {
  id: string;
  tenantId: string;
  name: string;
  address: string;
  addressComplement?: string;
  city?: string;
  country?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  taxId?: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface TenantUnitPayload {
  name: string;
  address: string;
  addressComplement?: string;
  city?: string;
  country?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  taxId?: string;
}

@Injectable({ providedIn: 'root' })
export class TenantUnitService {
  private http = inject(HttpClient);
  private readonly API = `${environment.apiUrl}/tenants/units`;

  list(): Observable<TenantUnit[]> {
    return this.http.get<TenantUnit[]>(this.API);
  }

  create(payload: TenantUnitPayload): Observable<TenantUnit> {
    return this.http.post<TenantUnit>(this.API, payload);
  }

  update(id: string, payload: TenantUnitPayload): Observable<TenantUnit> {
    return this.http.put<TenantUnit>(`${this.API}/${id}`, payload);
  }

  deactivate(id: string): Observable<TenantUnit> {
    return this.http.patch<TenantUnit>(`${this.API}/${id}/deactivate`, {});
  }

  activate(id: string): Observable<TenantUnit> {
    return this.http.patch<TenantUnit>(`${this.API}/${id}/activate`, {});
  }
}
