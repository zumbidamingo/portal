import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Parâmetros do Sistema: configurações padrão da empresa usadas automaticamente por outras
 *  funcionalidades. Extensível — cada parâmetro novo entra aqui como mais um campo. */
export interface TenantSystemParameters {
  defaultQuotationValidityDays: number;
  totalDiscountEnabled: boolean;
  itemDiscountEnabled: boolean;
  /** Teto de desconto por perfil (issue #242). Ligado, DiscountPolicy limita o desconto pelo
   *  perfil de quem aplica (OWNER/ADMIN/FINANCE 100%, COMMERCIAL 10%, restantes 0%). Desligado,
   *  o desconto passa sem teto de perfil — decisão da empresa, não omissão. */
  discountCapEnabled: boolean;
  directQuotationApprovalEnabled: boolean;
  /** Folga de planeamento por omissão da empresa (issue #172) — topo da herança
   *  `tenant → categoria → serviço`. Mudá-la não sobrescreve quem já tem override. */
  serviceToleranceMinutes: number;
  /** Quando ligado, toda a frota parte e termina na sede, ignorando a preferência do técnico
   *  (issue #173). */
  forceRouteStartFromCompany: boolean;
  /** Exige evidência de assinatura para finalizar uma ordem (COMPLETED → SIGNED). Desligado,
   *  uma justificativa registada basta. */
  requiresSignature: boolean;
  /** Envia ao cliente, automaticamente, a fatura emitida. Independente do relatório. */
  autoSendInvoiceEnabled: boolean;
  /** Envia ao cliente, automaticamente, o relatório da OS com as fotos do técnico. */
  autoSendReportEnabled: boolean;
  /** Lavanderia usada como destino por omissão na coleta automática (paragem PICKUP concluída).
   *  {@code null}/{@code undefined} quando o tenant não escolheu uma. */
  preferredLaundryFacilityId?: string | null;
  /** Escolha da empresa de usar o fluxo de lavanderia. O plano é à parte — ver `TenantLaundry`. */
  laundryEnabled: boolean;
  /** Minutos depois do início agendado em que uma ordem sem check-in passa a avisar o despacho
   *  (5–120, padrão 15; issue #331). */
  notificationLateStartMinutes: number;
  /** Horário de silêncio do push da empresa: no sino as notificações continuam a aparecer; alertas
   *  críticos e técnicos com rota ativa nunca são silenciados. `HH:mm` no fuso da empresa; o fim
   *  pode ser menor que o início (cruza a meia-noite). */
  notificationQuietHoursEnabled: boolean;
  notificationQuietStart: string;
  notificationQuietEnd: string;
}

/** Lavanderia em duas camadas: o que o plano dá e o que a empresa escolheu. `active` = as duas. */
export interface TenantLaundry {
  availableInPlan: boolean;
  enabled: boolean;
  active: boolean;
}

/** IA do plano, visível a todos os perfis (o detalhe da assinatura só OWNER/ADMIN leem). */
export interface TenantIntelligence {
  availableInPlan: boolean;
}

/** Passos do onboarding do primeiro acesso, pela ordem em que o dono os percorre (issue #136). */
export type OnboardingStep = 'COMPANY' | 'CATALOG' | 'CUSTOMER' | 'TEAM';
export type OnboardingStatus = 'PENDING' | 'IN_PROGRESS' | 'DISMISSED' | 'COMPLETED';

export interface TenantOnboarding {
  status: OnboardingStatus;
  /** Último passo em que o dono esteve — onde o onboarding retoma. */
  step: OnboardingStep;
}

export interface Tenant {
  id: string;
  userId: string;
  name: string;
  countryCode?: string;
  taxId?: string;
  taxIdType?: string;
  currency?: string;
  locale?: string;
  address?: string;
  addressComplement?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  phone?: string;
  description?: string;
  website?: string;
  logoUrl?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  createdAt?: string;
  systemParameters?: TenantSystemParameters;
  laundry?: TenantLaundry;
  intelligence?: TenantIntelligence;
  onboarding?: TenantOnboarding;
}

export interface TenantUpdatePayload {
  name: string;
  address: string;
  addressComplement?: string;
  countryCode?: string;
  taxId?: string;
  currency?: string;
  locale?: string;
  city?: string;
  country?: string;
  postalCode?: string;
  phone?: string;
  description?: string;
  website?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
}

@Injectable({ providedIn: 'root' })
export class TenantService {
  private http = inject(HttpClient);
  private readonly API = `${environment.apiUrl}/tenants`;

  private readonly _profileComplete = signal<boolean | null>(null);
  readonly profileComplete = this._profileComplete.asReadonly();

  /** Empresa do utilizador autenticado — alimenta o seletor de empresa da topbar sem novo pedido. */
  private readonly _current = signal<Tenant | null>(null);
  readonly current = this._current.asReadonly();

  markProfileComplete(complete: boolean): void {
    this._profileComplete.set(complete);
  }

  resetProfileState(): void {
    this._profileComplete.set(null);
    this._current.set(null);
  }

  getMe(): Observable<Tenant> {
    return this.http.get<Tenant>(`${this.API}/me`).pipe(tap(t => this._current.set(t)));
  }

  update(id: string, body: TenantUpdatePayload): Observable<Tenant> {
    return this.http.put<Tenant>(`${this.API}/${id}`, body).pipe(tap(t => this._current.set(t)));
  }

  /** Logotipo da empresa — endpoint próprio, nunca toca na foto do utilizador. */
  uploadLogo(id: string, file: File): Observable<Tenant> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<Tenant>(`${this.API}/${id}/logo`, form).pipe(tap(t => this._current.set(t)));
  }

  /** Guarda o progresso no servidor para o dono retomar do mesmo ponto noutro dispositivo. */
  updateOnboarding(id: string, body: { status: OnboardingStatus; step?: OnboardingStep }): Observable<Tenant> {
    return this.http.put<Tenant>(`${this.API}/${id}/onboarding`, body).pipe(tap(t => this._current.set(t)));
  }

  updateSystemParameters(id: string, body: TenantSystemParameters): Observable<Tenant> {
    return this.http.patch<Tenant>(`${this.API}/${id}/system-parameters`, body).pipe(tap(r => this._current.set(r)));
  }
}
