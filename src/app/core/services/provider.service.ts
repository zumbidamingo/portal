import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, of } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Cor Tailwind fixa do prestador no mapa de rotas (issue "Cor do Prestador") — 17 matizes × 2
 *  tons (300 claro / 700 escuro, o par de maior distância perceptual), 34 no total, únicas entre
 *  prestadores ativos do tenant. Cobre o teto de 30 técnicos do plano INTELIGÊNCIA (CLAUDE.md
 *  §7) — com só 1 tom por matiz o 18º técnico ativo não conseguia nascer. Hex de cada uma em
 *  {@link PROVIDER_COLOR_HEX}. */
export type ProviderColor =
  | 'RED_300' | 'ORANGE_300' | 'AMBER_300' | 'YELLOW_300' | 'LIME_300' | 'GREEN_300' | 'EMERALD_300'
  | 'TEAL_300' | 'CYAN_300' | 'SKY_300' | 'BLUE_300' | 'INDIGO_300' | 'VIOLET_300' | 'PURPLE_300'
  | 'FUCHSIA_300' | 'PINK_300' | 'ROSE_300'
  | 'RED_700' | 'ORANGE_700' | 'AMBER_700' | 'YELLOW_700' | 'LIME_700' | 'GREEN_700' | 'EMERALD_700'
  | 'TEAL_700' | 'CYAN_700' | 'SKY_700' | 'BLUE_700' | 'INDIGO_700' | 'VIOLET_700' | 'PURPLE_700'
  | 'FUCHSIA_700' | 'PINK_700' | 'ROSE_700';

export const PROVIDER_COLOR_HEX: Record<ProviderColor, string> = {
  RED_300: '#fca5a5', ORANGE_300: '#fdba74', AMBER_300: '#fcd34d', YELLOW_300: '#fde047', LIME_300: '#bef264',
  GREEN_300: '#86efac', EMERALD_300: '#6ee7b7', TEAL_300: '#5eead4', CYAN_300: '#67e8f9', SKY_300: '#7dd3fc',
  BLUE_300: '#93c5fd', INDIGO_300: '#a5b4fc', VIOLET_300: '#c4b5fd', PURPLE_300: '#d8b4fe', FUCHSIA_300: '#f0abfc',
  PINK_300: '#f9a8d4', ROSE_300: '#fda4af',
  RED_700: '#b91c1c', ORANGE_700: '#c2410c', AMBER_700: '#b45309', YELLOW_700: '#a16207', LIME_700: '#4d7c0f',
  GREEN_700: '#15803d', EMERALD_700: '#047857', TEAL_700: '#0f766e', CYAN_700: '#0e7490', SKY_700: '#0369a1',
  BLUE_700: '#1d4ed8', INDIGO_700: '#4338ca', VIOLET_700: '#6d28d9', PURPLE_700: '#7e22ce', FUCHSIA_700: '#a21caf',
  PINK_700: '#be185d', ROSE_700: '#be123c',
};

export const PROVIDER_COLORS = Object.keys(PROVIDER_COLOR_HEX) as ProviderColor[];

export interface ProviderColorOption {
  color: ProviderColor;
  available: boolean;
}

export interface Provider {
  id: string;
  tenantId: string;
  userId: string;
  startDate: string | null;
  contactEmail: string | null;
  active: boolean;
  color: ProviderColor;
  maxOrdersPerDay: number | null;
  maxMinutesPerDay: number | null;
  maxVolumePerDay: number | null;
  skillIds: string[];
  hasWeeklyAvailability: boolean;
  /** Morada de casa do técnico e pontas da rota (issue #173). */
  address: string | null;
  addressComplement: string | null;
  city: string | null;
  country: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  routeStartPoint: RouteEndpoint;
  routeEndPoint: RouteEndpoint;
  createdAt: string;
  updatedAt: string;
}

/** De onde a rota do técnico parte e onde termina (issue #173). */
export type RouteEndpoint = 'COMPANY' | 'HOME';

export interface CreateTechnicianResult {
  provider: Provider;
  email: string;
  temporaryPassword: string;
}

export interface ProviderPage {
  content: Provider[];
  page: { totalElements: number; totalPages: number; number: number; size: number };
}

export interface ProviderQuery {
  active?: boolean | null;
  skillId?: string | null;
  name?: string | null;
  page?: number;
  size?: number;
  sort?: string;
}

export interface WeeklyAvailability {
  id: string;
  providerId: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
}

/** Período do dia tratado como indisponível — bloqueia agendamento e roteirização (ver
 *  `isAvailable`/`findAvailableProviderIds` no backend). Mesmo shape de {@link WeeklyAvailability}. */
export interface LunchBreak {
  id: string;
  providerId: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
}

export interface AvailabilityException {
  id: string;
  providerId: string;
  startDate: string;
  endDate: string;
  reason: string | null;
}

/** weekOfMonth: null = toda semana; -1 = última do mês; 1..5 = a n-ésima. */
export interface RecurringAbsence {
  id: string;
  providerId: string;
  dayOfWeek: string;
  weekOfMonth: number | null;
  startDate: string;
  endDate: string | null;
  reason: string | null;
}

export interface VacationRule {
  id: string;
  providerId: string;
  label: string | null;
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
  active: boolean;
}

export interface VacationOccurrence {
  id: string;
  ruleId: string;
  year: number;
  startDate: string;
  endDate: string;
}

export type AbsenceType = 'SINGLE' | 'RECURRING' | 'VACATION';

export interface ProviderAbsenceSummary {
  type: AbsenceType;
  sourceId: string;
  startDate: string;
  endDate: string;
  reason: string | null;
}

@Injectable({ providedIn: 'root' })
export class ProviderService {
  private http = inject(HttpClient);
  private readonly API = `${environment.apiUrl}/providers`;

  get(id: string): Observable<Provider> {
    return this.http.get<Provider>(`${this.API}/${id}`);
  }

  /** Prestador interno ligado a um utilizador — alimenta a secção de Provider no Drawer da Equipa. `null` quando não existe (convite ainda pendente, ou perfil não é de campo). */
  getByUserId(userId: string): Observable<Provider | null> {
    return this.http.get<Provider>(`${this.API}/by-user/${userId}`).pipe(
      catchError(() => of(null)),
    );
  }

  list(query: ProviderQuery): Observable<ProviderPage> {
    let params = new HttpParams()
      .set('page', String(query.page ?? 0))
      .set('size', String(query.size ?? 20))
      .set('sort', query.sort ?? 'createdAt,desc');
    if (query.active != null) params = params.set('active', String(query.active));
    if (query.skillId) params = params.set('skillId', query.skillId);
    if (query.name?.trim()) params = params.set('name', query.name.trim());
    return this.http.get<ProviderPage>(this.API, { params });
  }

  /** Login/senha vêm uma vez só na resposta — hash é one-way, não há como recuperá-los depois. */
  create(payload: {
    fullName: string;
    /** CPF/NIF — só o hash fica guardado no servidor. */
    document: string;
    startDate?: string | null;
    contactEmail?: string | null;
    skillIds?: string[];
    capacity?: { maxOrdersPerDay: number | null; maxMinutesPerDay: number | null; maxVolumePerDay: number | null };
    weeklyAvailability?: { dayOfWeek: string; startTime: string; endTime: string }[];
    color?: ProviderColor | null;
  }): Observable<CreateTechnicianResult> {
    return this.http.post<CreateTechnicianResult>(this.API, payload);
  }

  /** Todas as 17 cores da paleta, cada uma com {@code available} para este tenant agora.
   *  `excludingProviderId` põe a própria cor do prestador em edição como disponível. */
  listColors(excludingProviderId?: string): Observable<ProviderColorOption[]> {
    let params = new HttpParams();
    if (excludingProviderId) params = params.set('excludingProviderId', excludingProviderId);
    return this.http.get<ProviderColorOption[]>(`${this.API}/colors`, { params });
  }

  setColor(id: string, color: ProviderColor): Observable<Provider> {
    return this.http.patch<Provider>(`${this.API}/${id}/color`, { color });
  }

  /** Reenvia as credenciais (login + senha temporária) para o email de contato do técnico —
   *  a senha em texto plano só existe enquanto o modal de criação está aberto (hash é one-way). */
  sendCredentialsEmail(id: string, temporaryPassword: string): Observable<void> {
    return this.http.post<void>(`${this.API}/${id}/send-credentials-email`, { temporaryPassword });
  }

  /** Morada de casa e pontas de rota (issue #173). O parâmetro `forceRouteStartFromCompany` da
   *  empresa ganha a estas preferências — elas ficam gravadas mas não são consultadas. */
  setRouteSettings(
    id: string,
    payload: {
      address: string | null;
      addressComplement: string | null;
      city: string | null;
      country: string | null;
      postalCode: string | null;
      latitude: number | null;
      longitude: number | null;
      routeStartPoint: RouteEndpoint;
      routeEndPoint: RouteEndpoint;
    },
  ): Observable<Provider> {
    return this.http.patch<Provider>(`${this.API}/${id}/route-settings`, payload);
  }

  activate(id: string): Observable<Provider> {
    return this.http.patch<Provider>(`${this.API}/${id}/activate`, null);
  }

  deactivate(id: string): Observable<Provider> {
    return this.http.patch<Provider>(`${this.API}/${id}/deactivate`, null);
  }

  setCapacity(id: string, payload: { maxOrdersPerDay: number | null; maxMinutesPerDay: number | null; maxVolumePerDay: number | null }): Observable<Provider> {
    return this.http.patch<Provider>(`${this.API}/${id}/capacity`, payload);
  }

  assignSkill(id: string, skillId: string): Observable<Provider> {
    return this.http.put<Provider>(`${this.API}/${id}/skills/${skillId}`, null);
  }

  removeSkill(id: string, skillId: string): Observable<Provider> {
    return this.http.delete<Provider>(`${this.API}/${id}/skills/${skillId}`);
  }

  listWeekly(id: string): Observable<WeeklyAvailability[]> {
    return this.http.get<WeeklyAvailability[]>(`${this.API}/${id}/availability/weekly`);
  }

  addWeekly(id: string, payload: { dayOfWeek: string; startTime: string; endTime: string }): Observable<WeeklyAvailability> {
    return this.http.post<WeeklyAvailability>(`${this.API}/${id}/availability/weekly`, payload);
  }

  removeWeekly(id: string, weeklyId: string): Observable<void> {
    return this.http.delete<void>(`${this.API}/${id}/availability/weekly/${weeklyId}`);
  }

  listLunchBreaks(id: string): Observable<LunchBreak[]> {
    return this.http.get<LunchBreak[]>(`${this.API}/${id}/availability/lunch-breaks`);
  }

  addLunchBreak(id: string, payload: { dayOfWeek: string; startTime: string; endTime: string }): Observable<LunchBreak> {
    return this.http.post<LunchBreak>(`${this.API}/${id}/availability/lunch-breaks`, payload);
  }

  removeLunchBreak(id: string, lunchBreakId: string): Observable<void> {
    return this.http.delete<void>(`${this.API}/${id}/availability/lunch-breaks/${lunchBreakId}`);
  }

  listExceptions(id: string): Observable<AvailabilityException[]> {
    return this.http.get<AvailabilityException[]>(`${this.API}/${id}/availability/exceptions`);
  }

  addException(id: string, payload: { startDate: string; endDate: string; reason: string | null }): Observable<AvailabilityException> {
    return this.http.post<AvailabilityException>(`${this.API}/${id}/availability/exceptions`, payload);
  }

  removeException(id: string, exceptionId: string): Observable<void> {
    return this.http.delete<void>(`${this.API}/${id}/availability/exceptions/${exceptionId}`);
  }

  listRecurring(id: string): Observable<RecurringAbsence[]> {
    return this.http.get<RecurringAbsence[]>(`${this.API}/${id}/availability/recurring-exceptions`);
  }

  addRecurring(id: string, payload: { dayOfWeek: string; weekOfMonth: number | null; startDate: string; endDate: string | null; reason: string | null }): Observable<RecurringAbsence> {
    return this.http.post<RecurringAbsence>(`${this.API}/${id}/availability/recurring-exceptions`, payload);
  }

  removeRecurring(id: string, recurringId: string): Observable<void> {
    return this.http.delete<void>(`${this.API}/${id}/availability/recurring-exceptions/${recurringId}`);
  }

  listVacationRules(id: string): Observable<VacationRule[]> {
    return this.http.get<VacationRule[]>(`${this.API}/${id}/availability/vacations`);
  }

  addVacationRule(id: string, payload: { label: string | null; startMonth: number; startDay: number; endMonth: number; endDay: number }): Observable<VacationRule> {
    return this.http.post<VacationRule>(`${this.API}/${id}/availability/vacations`, payload);
  }

  removeVacationRule(id: string, ruleId: string): Observable<void> {
    return this.http.delete<void>(`${this.API}/${id}/availability/vacations/${ruleId}`);
  }

  listVacationOccurrences(id: string, ruleId: string): Observable<VacationOccurrence[]> {
    return this.http.get<VacationOccurrence[]>(`${this.API}/${id}/availability/vacations/${ruleId}/occurrences`);
  }

  setVacationOccurrence(id: string, ruleId: string, year: number, payload: { startDate: string; endDate: string }): Observable<VacationOccurrence> {
    return this.http.put<VacationOccurrence>(`${this.API}/${id}/availability/vacations/${ruleId}/occurrences/${year}`, payload);
  }

  listAbsences(id: string, from: string, to: string): Observable<ProviderAbsenceSummary[]> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.http.get<ProviderAbsenceSummary[]>(`${this.API}/${id}/availability/absences`, { params });
  }
}
