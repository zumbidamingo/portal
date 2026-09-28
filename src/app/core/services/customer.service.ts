import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type CustomerType = 'INDIVIDUAL' | 'COMPANY';

export type CustomerLeadSource = 'WEBSITE' | 'REFERRAL' | 'PHONE' | 'WHATSAPP' | 'SOCIAL_MEDIA' | 'WALK_IN' | 'OTHER';

export type CustomerAddressType = 'BILLING' | 'EXECUTION';

export interface CustomerContact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  primary: boolean;
  whatsAppOptIn: boolean;
  /** Locale do contacto (BCP-47, issue #141) — quem emite o orçamento (PDF/email) usa-o para
   *  formatar o documento para este cliente; `null` cai no locale da empresa. */
  locale: string | null;
}

export interface CustomerContactPayload {
  name: string;
  email?: string;
  phone?: string;
  primary: boolean;
  locale?: string | null;
}

export interface CustomerAddress {
  id: string;
  type: CustomerAddressType;
  primary: boolean;
  address: string;
  addressComplement: string | null;
  city: string | null;
  country: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface CustomerAddressPayload {
  type: CustomerAddressType;
  primary: boolean;
  address: string;
  addressComplement?: string;
  city?: string;
  country?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
}

export interface Customer {
  id: string;
  version: number;
  type: CustomerType;
  name: string;
  taxId: string | null;
  taxIdType: string | null;
  active: boolean;
  address: string | null;
  addressComplement: string | null;
  city: string | null;
  country: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  leadSource: CustomerLeadSource | null;
  accountOwnerId: string | null;
  contacts: CustomerContact[];
  addresses: CustomerAddress[];
  createdAt: string;
  updatedAt: string;
}

export interface CustomerPayload {
  type: CustomerType;
  name: string;
  taxId?: string;
  address?: string;
  addressComplement?: string;
  city?: string;
  country?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  leadSource?: CustomerLeadSource | null;
  accountOwnerId?: string | null;
}

export interface CustomerDuplicateWarning {
  id: string;
  name: string;
  taxId: string | null;
}

export interface CustomerCreateResult {
  customer: Customer;
  duplicateWarnings: CustomerDuplicateWarning[];
}

/** Uma linha do histórico de serviços (#269): última execução e nº de vezes; a próxima prevista só
 *  existe quando há política de recorrência ativa para o serviço. */
export interface CustomerServiceHistoryItem {
  serviceId: string;
  serviceName: string | null;
  lastFinishedAt: string;
  timesServiced: number;
  intervalDays: number | null;
  nextExpectedAt: string | null;
}

export interface CustomerSummary {
  quotationCount: number;
  orderCount: number;
  invoiceCount: number;
  recentQuotations: { id: string; quotationNumber: number; status: string; total: number; currencyCode: string; createdAt: string }[];
  recentOrders: { id: string; orderNumber: number; status: string; createdAt: string }[];
  recentInvoices: { id: string; invoiceNumber: number; status: string; total: number; currencyCode: string; issuedAt: string }[];
}

export interface CustomerPage {
  content: Customer[];
  page: {
    totalElements: number;
    totalPages: number;
    number: number;
    size: number;
  };
}

export interface CustomerQuery {
  search?: string | null;
  active?: boolean | null;
  type?: CustomerType | null;
  page?: number;
  size?: number;
  sort?: string;
}

export type CustomerImportRowStatus = 'VALID' | 'ERROR';

export interface CustomerImportRow {
  line: number;
  status: CustomerImportRowStatus;
  errorCode: string | null;
  message: string | null;
  type: string | null;
  name: string | null;
  taxId: string | null;
  customerId: string | null;
}

export interface CustomerImportPreviewResult {
  totalRows: number;
  validCount: number;
  errorCount: number;
  rows: CustomerImportRow[];
}

@Injectable({ providedIn: 'root' })
export class CustomerService {
  private http = inject(HttpClient);
  private readonly API = `${environment.apiUrl}/customers`;

  list(query: CustomerQuery): Observable<CustomerPage> {
    let params = new HttpParams()
      .set('page', String(query.page ?? 0))
      .set('size', String(query.size ?? 20))
      .set('sort', query.sort ?? 'name,asc');
    if (query.search?.trim()) params = params.set('search', query.search.trim());
    if (query.active != null) params = params.set('active', String(query.active));
    if (query.type) params = params.set('type', query.type);
    return this.http.get<CustomerPage>(this.API, { params });
  }

  get(id: string): Observable<Customer> {
    return this.http.get<Customer>(`${this.API}/${id}`);
  }

  getSummary(id: string): Observable<CustomerSummary> {
    return this.http.get<CustomerSummary>(`${this.API}/${id}/summary`);
  }

  getServiceHistory(id: string): Observable<CustomerServiceHistoryItem[]> {
    return this.http.get<CustomerServiceHistoryItem[]>(`${this.API}/${id}/service-history`);
  }

  create(payload: CustomerPayload): Observable<CustomerCreateResult> {
    return this.http.post<CustomerCreateResult>(this.API, payload);
  }

  update(id: string, payload: CustomerPayload): Observable<Customer> {
    return this.http.put<Customer>(`${this.API}/${id}`, payload);
  }

  setActive(id: string, active: boolean): Observable<Customer> {
    const params = new HttpParams().set('active', String(active));
    return this.http.patch<Customer>(`${this.API}/${id}/active`, null, { params });
  }

  addContact(customerId: string, payload: CustomerContactPayload): Observable<Customer> {
    return this.http.post<Customer>(`${this.API}/${customerId}/contacts`, payload);
  }

  updateContact(customerId: string, contactId: string, payload: CustomerContactPayload): Observable<Customer> {
    return this.http.put<Customer>(`${this.API}/${customerId}/contacts/${contactId}`, payload);
  }

  removeContact(customerId: string, contactId: string): Observable<Customer> {
    return this.http.delete<Customer>(`${this.API}/${customerId}/contacts/${contactId}`);
  }

  setContactWhatsAppOptIn(customerId: string, contactId: string, optIn: boolean): Observable<Customer> {
    const params = new HttpParams().set('optIn', String(optIn));
    return this.http.patch<Customer>(`${this.API}/${customerId}/contacts/${contactId}/whatsapp-opt-in`, null, { params });
  }

  addAddress(customerId: string, payload: CustomerAddressPayload): Observable<Customer> {
    return this.http.post<Customer>(`${this.API}/${customerId}/addresses`, payload);
  }

  updateAddress(customerId: string, addressId: string, payload: CustomerAddressPayload): Observable<Customer> {
    return this.http.put<Customer>(`${this.API}/${customerId}/addresses/${addressId}`, payload);
  }

  removeAddress(customerId: string, addressId: string): Observable<Customer> {
    return this.http.delete<Customer>(`${this.API}/${customerId}/addresses/${addressId}`);
  }

  previewImport(file: File): Observable<CustomerImportPreviewResult> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<CustomerImportPreviewResult>(`${this.API}/import/preview`, form);
  }
}
