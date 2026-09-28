import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Money {
  amount: number;
  currency: string;
}

export interface LaundryFacility {
  id: string;
  tenantId: string;
  name: string;
  address: string;
  addressComplement: string | null;
  city: string | null;
  country: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LaundryFacilityServicePrice {
  id: string;
  facilityId: string;
  serviceId: string;
  price: Money;
  createdAt: string;
  updatedAt: string;
}

export interface LaundryFacilityPage {
  content: LaundryFacility[];
  page: { totalElements: number; totalPages: number; number: number; size: number };
}

export interface LaundryFacilityPayload {
  name: string;
  address: string;
  addressComplement?: string;
  city?: string;
  country?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
}

export interface LaundryOperator {
  id: string;
  facilityId: string;
  userId: string;
  createdAt: string;
}

export interface CreateLaundryOperatorResult {
  operator: LaundryOperator;
  email: string;
  temporaryPassword: string;
}

@Injectable({ providedIn: 'root' })
export class LaundryFacilityService {
  private http = inject(HttpClient);
  private readonly API = `${environment.apiUrl}/laundry-facilities`;

  list(query: { active?: boolean | null; name?: string | null; page?: number; size?: number } = {}): Observable<LaundryFacilityPage> {
    let params = new HttpParams()
      .set('page', String(query.page ?? 0))
      .set('size', String(query.size ?? 20));
    if (query.active != null) params = params.set('active', String(query.active));
    if (query.name?.trim()) params = params.set('name', query.name.trim());
    return this.http.get<LaundryFacilityPage>(this.API, { params });
  }

  get(id: string): Observable<LaundryFacility> {
    return this.http.get<LaundryFacility>(`${this.API}/${id}`);
  }

  create(payload: LaundryFacilityPayload): Observable<LaundryFacility> {
    return this.http.post<LaundryFacility>(this.API, payload);
  }

  update(id: string, payload: LaundryFacilityPayload): Observable<LaundryFacility> {
    return this.http.put<LaundryFacility>(`${this.API}/${id}`, payload);
  }

  activate(id: string): Observable<LaundryFacility> {
    return this.http.patch<LaundryFacility>(`${this.API}/${id}/activate`, {});
  }

  deactivate(id: string): Observable<LaundryFacility> {
    return this.http.patch<LaundryFacility>(`${this.API}/${id}/deactivate`, {});
  }

  listOperators(facilityId: string): Observable<LaundryOperator[]> {
    return this.http.get<LaundryOperator[]>(`${this.API}/${facilityId}/operators`);
  }

  /** Login/senha vêm uma vez só na resposta — hash é one-way, não há como recuperá-los depois. */
  createOperator(facilityId: string, fullName: string, document: string): Observable<CreateLaundryOperatorResult> {
    return this.http.post<CreateLaundryOperatorResult>(`${this.API}/${facilityId}/operators`, { fullName, document });
  }

  listServicePrices(facilityId: string): Observable<LaundryFacilityServicePrice[]> {
    return this.http.get<LaundryFacilityServicePrice[]>(`${this.API}/${facilityId}/service-prices`);
  }

  setServicePrice(facilityId: string, serviceId: string, priceAmount: number, priceCurrency: string): Observable<LaundryFacilityServicePrice> {
    return this.http.put<LaundryFacilityServicePrice>(
      `${this.API}/${facilityId}/service-prices/${serviceId}`, { priceAmount, priceCurrency });
  }

  removeServicePrice(facilityId: string, serviceId: string): Observable<void> {
    return this.http.delete<void>(`${this.API}/${facilityId}/service-prices/${serviceId}`);
  }
}
