import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/** SUGGESTED = nasceu de uma sugestão do sistema (o texto já é do tenant); CUSTOM = criado por ele. */
export type ChecklistItemSource = 'SUGGESTED' | 'CUSTOM';

export interface ChecklistItem {
  id: string;
  label: string;
  /** Ativo = aparece ao técnico no app de campo. */
  active: boolean;
  source: ChecklistItemSource;
  position: number;
}

/** Sugestão do sistema ainda não aceita nem ignorada pelo tenant. */
export interface ChecklistSuggestion {
  code: string;
  label: string;
}

export interface ChecklistConfig {
  items: ChecklistItem[];
  suggestions: ChecklistSuggestion[];
  dismissedSuggestions: ChecklistSuggestion[];
  maxItems: number;
}

/** Configuração do checklist que o técnico segue em campo; o app lê `/field/checklist`. */
@Injectable({ providedIn: 'root' })
export class ChecklistService {
  private http = inject(HttpClient);
  private readonly API = `${environment.apiUrl}/checklist-items`;

  get(): Observable<ChecklistConfig> {
    return this.http.get<ChecklistConfig>(this.API);
  }

  create(label: string): Observable<ChecklistItem> {
    return this.http.post<ChecklistItem>(this.API, { label });
  }

  rename(id: string, label: string): Observable<ChecklistItem> {
    return this.http.patch<ChecklistItem>(`${this.API}/${id}`, { label });
  }

  setActive(id: string, active: boolean): Observable<ChecklistItem> {
    return this.http.patch<ChecklistItem>(`${this.API}/${id}/${active ? 'enable' : 'disable'}`, {});
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.API}/${id}`);
  }

  reorder(itemIds: string[]): Observable<ChecklistConfig> {
    return this.http.put<ChecklistConfig>(`${this.API}/order`, { itemIds });
  }

  acceptSuggestion(code: string): Observable<ChecklistItem> {
    return this.http.post<ChecklistItem>(`${this.API}/suggestions/${code}/accept`, {});
  }

  acceptAllSuggestions(): Observable<ChecklistConfig> {
    return this.http.post<ChecklistConfig>(`${this.API}/suggestions/accept-all`, {});
  }

  dismissSuggestion(code: string): Observable<void> {
    return this.http.post<void>(`${this.API}/suggestions/${code}/dismiss`, {});
  }

  restoreSuggestion(code: string): Observable<void> {
    return this.http.post<void>(`${this.API}/suggestions/${code}/restore`, {});
  }
}
