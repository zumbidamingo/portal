import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type LaundryItemStatus = 'RECEIVED' | 'PROCESSING' | 'READY' | 'RELEASED' | 'DELIVERED';

export interface LaundryItemPhoto {
  id: string;
  url: string;
  createdBy: string;
  createdAt: string;
}

export interface LaundryItem {
  id: string;
  orderId: string;
  laundryFacilityId: string;
  /** Nome vindo do backend — perfil LAUNDRY não lê a lista de lavanderias. */
  laundryFacilityName: string | null;
  orderItemId: string | null;
  customerId: string;
  /** Nome vindo do backend — perfil LAUNDRY não lê clientes. */
  customerName: string | null;
  code: string;
  description: string | null;
  status: LaundryItemStatus;
  collectedAt: string;
  collectedBy: string;
  collectionNotes: string | null;
  processingStartedAt: string | null;
  readyAt: string | null;
  releasedAt: string | null;
  deliveredAt: string | null;
  previousLaundryFacilityId: string | null;
  reassignedAt: string | null;
  correctedFromStatus: LaundryItemStatus | null;
  correctedAt: string | null;
  correctionReason: string | null;
  photos: LaundryItemPhoto[];
  createdAt: string;
  updatedAt: string;
}

/** Ordem de coleta externa como a lavandaria a vê — sem valores, custos nem histórico. */
export interface LaundryCollectableOrder {
  id: string;
  orderNumber: number;
  street: string;
  city: string | null;
  status: string;
  customerName: string | null;
  items: { id: string; description: string; quantity: number }[];
}

export interface LaundryItemPage {
  content: LaundryItem[];
  page: { totalElements: number; totalPages: number; number: number; size: number };
}

export interface LaundryDeliveryReceipt {
  id: string;
  orderId: string;
  closedAt: string;
  closedBy: string;
  signatureObjectKey: string | null;
}

export interface LaundryBoardFilters {
  orderId?: string;
  customerId?: string;
  customerName?: string;
  laundryFacilityId?: string;
  start?: string;
  end?: string;
}

/** Filtros do histórico (30 dias após entrega — ver {@link LaundryHistoryComponent}). Datas em
 *  formato `yyyy-MM-dd`; `sortField`/`sortOrder` seguem a convenção de {@code p-table} lazy. */
export interface LaundryHistoryFilters {
  orderId?: string;
  customerId?: string;
  customerName?: string;
  laundryFacilityId?: string;
  search?: string;
  collectedStart?: string;
  collectedEnd?: string;
  deliveredStart?: string;
  deliveredEnd?: string;
  page?: number;
  size?: number;
  sortField?: string;
  sortOrder?: 1 | -1;
}

@Injectable({ providedIn: 'root' })
export class LaundryService {
  private http = inject(HttpClient);
  private readonly API = `${environment.apiUrl}/laundry-items`;

  /** Ordens externas a coletar (no lugar de GET /orders, que o perfil LAUNDRY não lê). */
  collectableOrders(): Observable<LaundryCollectableOrder[]> {
    return this.http.get<LaundryCollectableOrder[]>(`${this.API}/collectable-orders`);
  }

  list(params?: LaundryBoardFilters & { status?: LaundryItemStatus; page?: number; size?: number }): Observable<LaundryItemPage> {
    let p = new HttpParams().set('size', String(params?.size ?? 20)).set('page', String(params?.page ?? 0));
    if (params?.status) p = p.set('status', params.status);
    if (params?.orderId) p = p.set('orderId', params.orderId);
    if (params?.customerId) p = p.set('customerId', params.customerId);
    if (params?.customerName) p = p.set('customerName', params.customerName);
    if (params?.laundryFacilityId) p = p.set('laundryFacilityId', params.laundryFacilityId);
    if (params?.start) p = p.set('start', params.start);
    if (params?.end) p = p.set('end', params.end);
    return this.http.get<LaundryItemPage>(this.API, { params: p });
  }

  /** Histórico (issue histórico de lavandaria): itens entregues há mais de 30 dias — leitura pura,
   *  fora da grelha principal. Ver {@code LaundryItemHistoryPolicy} no backend. */
  history(filters?: LaundryHistoryFilters): Observable<LaundryItemPage> {
    let p = new HttpParams()
      .set('size', String(filters?.size ?? 20))
      .set('page', String(filters?.page ?? 0));
    if (filters?.orderId) p = p.set('orderId', filters.orderId);
    if (filters?.customerId) p = p.set('customerId', filters.customerId);
    if (filters?.customerName) p = p.set('customerName', filters.customerName);
    if (filters?.laundryFacilityId) p = p.set('laundryFacilityId', filters.laundryFacilityId);
    if (filters?.search) p = p.set('search', filters.search);
    if (filters?.collectedStart) p = p.set('collectedStart', filters.collectedStart);
    if (filters?.collectedEnd) p = p.set('collectedEnd', filters.collectedEnd);
    if (filters?.deliveredStart) p = p.set('deliveredStart', filters.deliveredStart);
    if (filters?.deliveredEnd) p = p.set('deliveredEnd', filters.deliveredEnd);
    if (filters?.sortField) p = p.set('sort', `${filters.sortField},${filters.sortOrder === -1 ? 'desc' : 'asc'}`);
    return this.http.get<LaundryItemPage>(`${this.API}/history`, { params: p });
  }

  board(filters?: LaundryBoardFilters): Observable<Partial<Record<LaundryItemStatus, number>>> {
    let p = new HttpParams();
    if (filters?.orderId) p = p.set('orderId', filters.orderId);
    if (filters?.customerId) p = p.set('customerId', filters.customerId);
    if (filters?.customerName) p = p.set('customerName', filters.customerName);
    if (filters?.laundryFacilityId) p = p.set('laundryFacilityId', filters.laundryFacilityId);
    if (filters?.start) p = p.set('start', filters.start);
    if (filters?.end) p = p.set('end', filters.end);
    return this.http.get<Partial<Record<LaundryItemStatus, number>>>(`${this.API}/board`, { params: p });
  }

  get(id: string): Observable<LaundryItem> {
    return this.http.get<LaundryItem>(`${this.API}/${id}`);
  }

  /** Itens prontos para planear devolução (issue #176/#251) — READY/RELEASED, alimenta a grelha
   *  "Pronto para devolução". Sem paginação: mesma janela operacional do quadro principal. */
  pendingDelivery(laundryFacilityId?: string): Observable<LaundryItem[]> {
    let p = new HttpParams();
    if (laundryFacilityId) p = p.set('laundryFacilityId', laundryFacilityId);
    return this.http.get<LaundryItem[]>(`${this.API}/pending-delivery`, { params: p });
  }

  collect(orderId: string, laundryFacilityId?: string, description?: string, collectionNotes?: string, orderItemId?: string): Observable<LaundryItem> {
    return this.http.post<LaundryItem>(this.API, { orderId, laundryFacilityId, orderItemId, description, collectionNotes });
  }

  /** Troca o destino de um item ainda não libertado — lavanderia lotada, indisponível, ou
   *  urgência. Recusado pelo backend a partir de RELEASED (issue: item já saiu fisicamente). */
  reassignFacility(itemId: string, laundryFacilityId: string): Observable<LaundryItem> {
    return this.http.patch<LaundryItem>(`${this.API}/${itemId}/facility`, { laundryFacilityId });
  }

  addPhoto(itemId: string, file: File): Observable<LaundryItemPhoto> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<LaundryItemPhoto>(`${this.API}/${itemId}/photos`, form);
  }

  removePhoto(itemId: string, photoId: string): Observable<void> {
    return this.http.delete<void>(`${this.API}/${itemId}/photos/${photoId}`);
  }

  startProcessing(id: string): Observable<LaundryItem> {
    return this.http.patch<LaundryItem>(`${this.API}/${id}/start-processing`, {});
  }

  markReady(id: string): Observable<LaundryItem> {
    return this.http.patch<LaundryItem>(`${this.API}/${id}/ready`, {});
  }

  release(id: string): Observable<LaundryItem> {
    return this.http.patch<LaundryItem>(`${this.API}/${id}/release`, {});
  }

  deliverByCode(code: string): Observable<LaundryItem> {
    return this.http.post<LaundryItem>(`${this.API}/deliver`, { code });
  }

  /** Corrige um engano do operador — volta o item para um estado anterior no ciclo, motivo
   *  obrigatório. Ver {@code LaundryItem#correctStatus} no backend. */
  correctStatus(id: string, targetStatus: LaundryItemStatus, reason: string): Observable<LaundryItem> {
    return this.http.patch<LaundryItem>(`${this.API}/${id}/correct-status`, { targetStatus, reason });
  }

  label(id: string): Observable<Blob> {
    return this.http.get(`${this.API}/${id}/label`, { responseType: 'blob' });
  }

  itemsForOrder(orderId: string): Observable<LaundryItem[]> {
    return this.http.get<LaundryItem[]>(`${environment.apiUrl}/orders/${orderId}/laundry-delivery/items`);
  }

  closeDelivery(orderId: string, signatureObjectKey?: string): Observable<LaundryDeliveryReceipt> {
    return this.http.post<LaundryDeliveryReceipt>(
        `${environment.apiUrl}/orders/${orderId}/laundry-delivery/close`, { signatureObjectKey });
  }
}
