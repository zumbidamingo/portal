import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Estado de ligação calculado no servidor — a janela de presença é configuração do backend. */
export type ConnectionStatus = 'ONLINE' | 'OFFLINE' | 'NEVER';

export interface AccessOverview {
  onlineUsers: number;
  activeSessions: number;
  loginsToday: number;
  failedLoginsToday: number;
  loginsLast7Days: number;
  neverLoggedIn: number;
  presenceWindowMinutes: number;
}

export interface UserAccessRow {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  emailVerified: boolean;
  authProvider: string;
  connectionStatus: ConnectionStatus;
  lastLoginAt: string | null;
  lastSeenAt: string | null;
  lastIp: string | null;
  lastDevice: string | null;
  activeSessions: number;
  loginCount: number;
  failedCount: number;
  createdAt: string;
}

export interface UserAccessSession {
  id: string;
  device: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  authProvider: string;
  startedAt: string;
  lastSeenAt: string;
  expiresAt: string;
  endedAt: string | null;
  endReason: string | null;
  online: boolean;
}

export interface UserAccessEvent {
  id: string;
  eventType: 'LOGIN_SUCCESS' | 'LOGIN_FAILED' | 'TOKEN_REFRESH' | 'LOGOUT';
  authProvider: string;
  failureReason: string | null;
  ipAddress: string | null;
  device: string | null;
  createdAt: string;
}

export interface UserAccessDetail {
  userId: string;
  name: string;
  email: string;
  role: string;
  sessions: UserAccessSession[];
  events: UserAccessEvent[];
}

export interface AccessPage {
  content: UserAccessRow[];
  page: {
    totalElements: number;
    totalPages: number;
    number: number;
    size: number;
  };
}

export interface AccessQuery {
  role?: string | null;
  status?: ConnectionStatus | null;
  search?: string | null;
  page?: number;
  size?: number;
}

@Injectable({ providedIn: 'root' })
export class UserAccessService {
  private http = inject(HttpClient);
  private readonly API = `${environment.apiUrl}/admin/access`;

  getOverview(): Observable<AccessOverview> {
    return this.http.get<AccessOverview>(`${this.API}/overview`);
  }

  listUsers(query: AccessQuery): Observable<AccessPage> {
    let params = new HttpParams()
      .set('page', String(query.page ?? 0))
      .set('size', String(query.size ?? 25));
    if (query.role) params = params.set('role', query.role);
    if (query.status) params = params.set('status', query.status);
    if (query.search?.trim()) params = params.set('search', query.search.trim());
    return this.http.get<AccessPage>(`${this.API}/users`, { params });
  }

  getDetail(userId: string): Observable<UserAccessDetail> {
    return this.http.get<UserAccessDetail>(`${this.API}/users/${userId}`);
  }
}
