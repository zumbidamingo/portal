import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type RouteStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type RouteStopStatus = 'PENDING' | 'EN_ROUTE' | 'ARRIVED' | 'COMPLETED' | 'SKIPPED';

/** Issue #174: uma paragem deixou de ser sempre uma ordem. */
export type RouteStopType =
  | 'ONSITE'
  | 'PICKUP'
  | 'DROPOFF_HQ'
  | 'LAUNDRY_DROPOFF'
  | 'LAUNDRY_PICKUP'
  | 'DELIVERY'
  | 'CUSTOM'
  | 'RETURN';

export interface RouteStop {
  id: string;
  /** `null` em paragens estruturais e avulsas (issue #174). */
  orderId: string | null;
  stopType: RouteStopType;
  laundryItemId: string | null;
  description: string | null;
  address: string | null;
  estimatedDurationMinutes: number | null;
  sequence: number;
  latitude: number;
  longitude: number;
  status: RouteStopStatus;
  plannedArrivalAt: string;
  plannedDepartureAt: string;
  actualArrivalAt: string | null;
  actualDepartureAt: string | null;
  distanceFromPreviousKm: number;
  durationFromPreviousMinutes: number;
  skipReason: string | null;
}

export interface RouteDto {
  id: string;
  tenantId: string;
  technicianId: string;
  routeDate: string;
  status: RouteStatus;
  originLatitude: number;
  originLongitude: number;
  /** `null` quando a rota termina na última paragem (issue #173). */
  destinationLatitude: number | null;
  destinationLongitude: number | null;
  totalDistanceKm: number;
  totalDurationMinutes: number;
  /** Execução somada das paragens, `SKIPPED` de fora. */
  totalServiceMinutes: number;
  /** `totalDurationMinutes + totalServiceMinutes`: deslocamento + execução. */
  totalRouteMinutes: number;
  stops: RouteStop[];
  /** Origem → paradas → destino, na ordem real do percurso — via real quando o OSRM resolveu,
   *  reta entre pontos quando não (mesmos pontos que já apareceriam sem geometria nenhuma). */
  geometry: { latitude: number; longitude: number }[];
  createdAt: string;
  updatedAt: string;
}

export interface RoutePage {
  content: RouteDto[];
  page: { totalElements: number; totalPages: number; number: number; size: number };
}

/** Uma linha do resultado da geração em lote (issue #175). */
export interface TechnicianRouteResult {
  technicianId: string;
  status: 'OK' | 'ERROR';
  routeId: string | null;
  stopCount: number | null;
  totalDistanceKm: number | null;
  errorCode: string | null;
  message: string | null;
}

export interface GenerateDayRoutesResult {
  requested: number;
  succeeded: number;
  failed: number;
  results: TechnicianRouteResult[];
}

export interface TechnicianPosition {
  id: string;
  technicianId: string;
  latitude: number;
  longitude: number;
  recordedAt: string;
}

@Injectable({ providedIn: 'root' })
export class RouteService {
  private http = inject(HttpClient);
  private readonly API = `${environment.apiUrl}/routes`;

  list(params?: { technicianId?: string; start?: string; end?: string; page?: number; size?: number }): Observable<RoutePage> {
    let p = new HttpParams().set('size', String(params?.size ?? 20)).set('page', String(params?.page ?? 0));
    if (params?.technicianId) p = p.set('technicianId', params.technicianId);
    if (params?.start) p = p.set('start', params.start);
    if (params?.end) p = p.set('end', params.end);
    return this.http.get<RoutePage>(this.API, { params: p });
  }

  get(id: string): Observable<RouteDto> {
    return this.http.get<RouteDto>(`${this.API}/${id}`);
  }

  plan(payload: {
    technicianId: string;
    routeDate: string;
    originLatitude?: number | null;
    originLongitude?: number | null;
    departureAt?: string | null;
  }): Observable<RouteDto> {
    return this.http.post<RouteDto>(`${this.API}/plan`, payload);
  }

  /** Gera a rota do dia de todos os técnicos com trabalho marcado (issue #175). O erro de um
   *  técnico não impede os outros — o resultado traz uma linha por técnico. */
  generateDay(date: string, departureAt?: string | null): Observable<GenerateDayRoutesResult> {
    return this.http.post<GenerateDayRoutesResult>(`${this.API}/generate-day`, { date, departureAt: departureAt ?? null });
  }

  /** Paragem avulsa (issue #174) — entra no fim, sem reordenar o que já está planeado. */
  addAdHocStop(
    routeId: string,
    payload: { description: string; address?: string | null; latitude: number; longitude: number; estimatedDurationMinutes: number },
  ): Observable<RouteDto> {
    return this.http.post<RouteDto>(`${this.API}/${routeId}/stops/ad-hoc`, payload);
  }

  start(id: string): Observable<RouteDto> {
    return this.http.post<RouteDto>(`${this.API}/${id}/start`, {});
  }

  complete(id: string): Observable<RouteDto> {
    return this.http.post<RouteDto>(`${this.API}/${id}/complete`, {});
  }

  /** O motivo é obrigatório no backend (issue #80) — cancelar sem justificação é recusado. */
  cancel(id: string, reason: string): Observable<RouteDto> {
    return this.http.post<RouteDto>(`${this.API}/${id}/cancel`, { reason });
  }

  markStopEnRoute(routeId: string, stopId: string): Observable<RouteDto> {
    return this.http.post<RouteDto>(`${this.API}/${routeId}/stops/${stopId}/en-route`, {});
  }

  markStopArrived(routeId: string, stopId: string): Observable<RouteDto> {
    return this.http.post<RouteDto>(`${this.API}/${routeId}/stops/${stopId}/arrived`, {});
  }

  completeStop(routeId: string, stopId: string): Observable<RouteDto> {
    return this.http.post<RouteDto>(`${this.API}/${routeId}/stops/${stopId}/complete`, {});
  }

  skipStop(routeId: string, stopId: string, reason: string): Observable<RouteDto> {
    return this.http.post<RouteDto>(`${this.API}/${routeId}/stops/${stopId}/skip`, { reason });
  }

  latestPositionsPerTechnician(): Observable<TechnicianPosition[]> {
    return this.http.get<TechnicianPosition[]>(`${environment.apiUrl}/routes/technicians/positions/latest`);
  }
}
