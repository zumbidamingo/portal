import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type PriceType = 'FIXED' | 'PER_SQUARE_METER' | 'PER_PIECE' | 'PER_HOUR';
export type ExecutionMode = 'ONSITE' | 'EXTERNAL';

export interface ServiceCategory {
  id: string;
  tenantId: string;
  name: string;
  displayOrder: number;
  active: boolean;
  /** Ponto de partida para serviços criados nesta categoria — cada serviço pode divergir depois. */
  defaultExecutionMode: ExecutionMode;
  /** `null` = herda a tolerância do tenant (issue #172). */
  toleranceMinutes: number | null;
  /** Duração por unidade da métrica do tipo de preço, ponto de partida para serviços novos. */
  defaultDurationMinutesPerUnit: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChangeServiceCategoryExecutionModeResult {
  category: ServiceCategory;
  /** Quantos serviços já cadastrados foram atualizados junto — 0 quando `applyToServices` era false. */
  updatedServiceCount: number;
}

export interface ChangeServiceCategoryTimingResult {
  category: ServiceCategory;
  /** Quantos serviços voltaram a herdar da categoria — 0 quando `applyToServices` era false. */
  updatedServiceCount: number;
}

export interface CatalogService {
  id: string;
  tenantId: string;
  categoryId: string;
  name: string;
  priceType: PriceType;
  price: number | null;
  currency: string | null;
  active: boolean;
  executionMode: ExecutionMode;
  /** `null` = herda da categoria, que por sua vez herda do tenant (issue #172). */
  toleranceMinutes: number | null;
  durationMinutesPerUnit: number | null;
  requiredSkillIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Skill {
  id: string;
  tenantId: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceCategoryPage {
  content: ServiceCategory[];
  page: { totalElements: number; totalPages: number; number: number; size: number };
}

export interface CatalogServicePage {
  content: CatalogService[];
  page: { totalElements: number; totalPages: number; number: number; size: number };
}

export interface ServiceCategoryQuery {
  active?: boolean | null;
  name?: string | null;
  page?: number;
  size?: number;
  sort?: string;
}

export interface CatalogServiceQuery {
  categoryId?: string | null;
  active?: boolean | null;
  name?: string | null;
  page?: number;
  size?: number;
  sort?: string;
}

@Injectable({ providedIn: 'root' })
export class ServiceCategoryService {
  private http = inject(HttpClient);
  private readonly API = `${environment.apiUrl}/service-categories`;

  list(query: ServiceCategoryQuery): Observable<ServiceCategoryPage> {
    let params = new HttpParams()
      .set('page', String(query.page ?? 0))
      .set('size', String(query.size ?? 50))
      .set('sort', query.sort ?? 'displayOrder,asc');
    if (query.active != null) params = params.set('active', String(query.active));
    if (query.name?.trim()) params = params.set('name', query.name.trim());
    return this.http.get<ServiceCategoryPage>(this.API, { params });
  }

  create(payload: { name: string; displayOrder: number; resolveConflict?: boolean }): Observable<ServiceCategory> {
    return this.http.post<ServiceCategory>(this.API, { ...payload, resolveConflict: payload.resolveConflict ?? false });
  }

  rename(id: string, name: string): Observable<ServiceCategory> {
    return this.http.patch<ServiceCategory>(`${this.API}/${id}`, { name });
  }

  reorder(id: string, displayOrder: number, resolveConflict = false): Observable<ServiceCategory> {
    return this.http.patch<ServiceCategory>(`${this.API}/${id}/order`, { displayOrder, resolveConflict });
  }

  activate(id: string): Observable<ServiceCategory> {
    return this.http.patch<ServiceCategory>(`${this.API}/${id}/activate`, null);
  }

  deactivate(id: string): Observable<ServiceCategory> {
    return this.http.patch<ServiceCategory>(`${this.API}/${id}/deactivate`, null);
  }

  /** @param applyToServices propaga o novo modo para todos os serviços já cadastrados na
   *                          categoria — só quando o usuário confirmar, nunca automático. */
  changeExecutionMode(id: string, executionMode: ExecutionMode, applyToServices: boolean): Observable<ChangeServiceCategoryExecutionModeResult> {
    return this.http.patch<ChangeServiceCategoryExecutionModeResult>(`${this.API}/${id}/execution-mode`, { executionMode, applyToServices });
  }

  /**
   * Duração por unidade e tolerância da categoria (issue #172).
   *
   * @param toleranceMinutes `null` volta a herdar do tenant.
   * @param applyToServices  limpa o override dos serviços da categoria, fazendo-os voltar a
   *                          herdar — só quando o usuário confirmar, nunca automático.
   */
  changeTiming(
    id: string,
    toleranceMinutes: number | null,
    defaultDurationMinutesPerUnit: number,
    applyToServices: boolean,
  ): Observable<ChangeServiceCategoryTimingResult> {
    return this.http.patch<ChangeServiceCategoryTimingResult>(`${this.API}/${id}/timing`, {
      toleranceMinutes,
      defaultDurationMinutesPerUnit,
      applyToServices,
    });
  }

  delete(id: string, deleteServices = false): Observable<void> {
    const params = new HttpParams().set('deleteServices', String(deleteServices));
    return this.http.delete<void>(`${this.API}/${id}`, { params });
  }
}

@Injectable({ providedIn: 'root' })
export class ServiceService {
  private http = inject(HttpClient);
  private readonly API = `${environment.apiUrl}/services`;

  list(query: CatalogServiceQuery): Observable<CatalogServicePage> {
    let params = new HttpParams()
      .set('page', String(query.page ?? 0))
      .set('size', String(query.size ?? 20))
      .set('sort', query.sort ?? 'name,asc');
    if (query.categoryId) params = params.set('categoryId', query.categoryId);
    if (query.active != null) params = params.set('active', String(query.active));
    if (query.name?.trim()) params = params.set('name', query.name.trim());
    return this.http.get<CatalogServicePage>(this.API, { params });
  }

  create(payload: { categoryId: string; name: string; priceType: PriceType }): Observable<CatalogService> {
    return this.http.post<CatalogService>(this.API, payload);
  }

  rename(id: string, name: string): Observable<CatalogService> {
    return this.http.patch<CatalogService>(`${this.API}/${id}`, { name });
  }

  changePrice(id: string, amount: number, currency: string): Observable<CatalogService> {
    return this.http.patch<CatalogService>(`${this.API}/${id}/price`, { amount, currency });
  }

  changeExecutionMode(id: string, executionMode: ExecutionMode): Observable<CatalogService> {
    return this.http.patch<CatalogService>(`${this.API}/${id}/execution-mode`, { executionMode });
  }

  /** `null` em qualquer um dos dois volta a herdar da categoria (issue #172). */
  changeTiming(
    id: string,
    toleranceMinutes: number | null,
    durationMinutesPerUnit: number | null,
  ): Observable<CatalogService> {
    return this.http.patch<CatalogService>(`${this.API}/${id}/timing`, { toleranceMinutes, durationMinutesPerUnit });
  }

  activate(id: string): Observable<CatalogService> {
    return this.http.patch<CatalogService>(`${this.API}/${id}/activate`, null);
  }

  deactivate(id: string): Observable<CatalogService> {
    return this.http.patch<CatalogService>(`${this.API}/${id}/deactivate`, null);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.API}/${id}`);
  }

  assignSkill(id: string, skillId: string): Observable<CatalogService> {
    return this.http.put<CatalogService>(`${this.API}/${id}/skills/${skillId}`, null);
  }

  removeSkill(id: string, skillId: string): Observable<CatalogService> {
    return this.http.delete<CatalogService>(`${this.API}/${id}/skills/${skillId}`);
  }
}

@Injectable({ providedIn: 'root' })
export class SkillService {
  private http = inject(HttpClient);
  private readonly API = `${environment.apiUrl}/skills`;

  list(): Observable<Skill[]> {
    return this.http.get<Skill[]>(this.API);
  }

  create(name: string): Observable<Skill> {
    return this.http.post<Skill>(this.API, { name });
  }

  rename(id: string, name: string): Observable<Skill> {
    return this.http.patch<Skill>(`${this.API}/${id}`, { name });
  }

  activate(id: string): Observable<Skill> {
    return this.http.patch<Skill>(`${this.API}/${id}/activate`, null);
  }

  deactivate(id: string): Observable<Skill> {
    return this.http.patch<Skill>(`${this.API}/${id}/deactivate`, null);
  }

  delete(id: string, force = false): Observable<void> {
    const params = new HttpParams().set('force', String(force));
    return this.http.delete<void>(`${this.API}/${id}`, { params });
  }

  listServices(id: string): Observable<CatalogService[]> {
    return this.http.get<CatalogService[]>(`${this.API}/${id}/services`);
  }
}
