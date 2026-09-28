import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { UserRole } from '../models/user.model';

export type QuotaGroup = 'ADMINISTRATIVE' | 'FIELD' | 'NONE';
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'CANCELLED' | 'EXPIRED';

export interface TenantUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  quotaGroup: QuotaGroup;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  /** Últimos 4 dígitos do CPF/NIF; `null` = documento ainda não registado. */
  documentLast4: string | null;
}

/** Diretório de nomes — o que qualquer perfil do portal pode ler (sem email nem dados de conta). */
export type TenantDirectoryEntry = Pick<TenantUser, 'id' | 'name' | 'role' | 'quotaGroup' | 'active'>;

export interface TenantInvitation {
  id: string;
  email: string;
  role: UserRole;
  quotaGroup: QuotaGroup;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
}

export interface InviteTenantUserPayload {
  email: string;
  role: UserRole;
}

export interface AcceptInvitationPayload {
  firstName: string;
  lastName?: string;
  password: string;
}

export interface ResetPasswordResult {
  email: string;
  temporaryPassword: string;
}

@Injectable({ providedIn: 'root' })
export class TenantUserService {
  private http = inject(HttpClient);
  private readonly API = `${environment.apiUrl}/tenant-users`;

  list(): Observable<TenantUser[]> {
    return this.http.get<TenantUser[]>(this.API);
  }

  /** Resolve id → nome para perfis sem acesso à gestão da equipa (list() é só OWNER/ADMIN). */
  directory(): Observable<TenantDirectoryEntry[]> {
    return this.http.get<TenantDirectoryEntry[]>(`${this.API}/directory`);
  }

  listInvitations(): Observable<TenantInvitation[]> {
    return this.http.get<TenantInvitation[]>(`${this.API}/invitations`);
  }

  invite(payload: InviteTenantUserPayload): Observable<TenantInvitation> {
    return this.http.post<TenantInvitation>(`${this.API}/invitations`, payload);
  }

  resendInvitation(invitationId: string): Observable<TenantInvitation> {
    return this.http.post<TenantInvitation>(`${this.API}/invitations/${invitationId}/resend`, {});
  }

  cancelInvitation(invitationId: string): Observable<void> {
    return this.http.delete<void>(`${this.API}/invitations/${invitationId}`);
  }

  /** Regista o CPF/NIF de técnico ou operador; o servidor guarda só o hash e os 4 últimos dígitos. */
  setDocument(userId: string, document: string): Observable<TenantUser> {
    return this.http.put<TenantUser>(`${this.API}/${userId}/document`, { document });
  }

  setActive(userId: string, active: boolean): Observable<TenantUser> {
    const params = new HttpParams().set('active', active);
    return this.http.patch<TenantUser>(`${this.API}/${userId}/active`, {}, { params });
  }

  changeRole(userId: string, role: UserRole): Observable<TenantUser> {
    const params = new HttpParams().set('role', role);
    return this.http.patch<TenantUser>(`${this.API}/${userId}/role`, {}, { params });
  }

  updateProfile(userId: string, payload: { fullName: string; email: string }): Observable<TenantUser> {
    return this.http.patch<TenantUser>(`${this.API}/${userId}/profile`, payload);
  }

  /** Senha nova vem uma vez só na resposta — hash é one-way, não há como recuperá-la depois. */
  resetPassword(userId: string): Observable<ResetPasswordResult> {
    return this.http.patch<ResetPasswordResult>(`${this.API}/${userId}/reset-password`, {});
  }

  /** Público: quem aceita ainda não tem conta, não vai autenticado. */
  acceptInvitation(token: string, payload: AcceptInvitationPayload): Observable<TenantUser> {
    return this.http.post<TenantUser>(`${this.API}/invitations/${token}/accept`, payload);
  }

  /** Alternativa social ao formulário de senha — perfil e empresa continuam a vir do convite. */
  acceptInvitationViaGoogle(token: string, idToken: string): Observable<TenantUser> {
    return this.http.post<TenantUser>(`${this.API}/invitations/${token}/accept/google`, { idToken });
  }

  acceptInvitationViaFacebook(token: string, idToken: string): Observable<TenantUser> {
    return this.http.post<TenantUser>(`${this.API}/invitations/${token}/accept/facebook`, { idToken });
  }
}
