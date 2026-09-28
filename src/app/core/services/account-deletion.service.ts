import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/** O que a exclusão leva consigo — mostrado antes de o titular confirmar. */
export interface AccountDeletionImpact {
  owner: boolean;
  /** Empresa que será apagada (só OWNER). */
  companyName: string | null;
  /** O que o titular tem de digitar: empresa para o OWNER, nome da conta para os demais. */
  confirmationName: string;
  otherActiveUsers: number;
  openOrders: number;
  unpaidInvoices: number;
  unpaidCommissions: number;
  activePaidSubscription: boolean;
  graceDays: number;
}

export interface AccountDeletionScheduled {
  scheduledFor: string;
}

/**
 * Exclusão de conta em duas etapas: {@link request} valida o nome e envia um link por email;
 * {@link confirm} (link do email) agenda a exclusão com carência; {@link cancel} desfaz.
 * Confirmar e cancelar são públicos — quem abre o link pode já não ter sessão.
 */
@Injectable({ providedIn: 'root' })
export class AccountDeletionService {
  private readonly http = inject(HttpClient);
  private readonly API = `${environment.apiUrl}/auth`;

  impact(): Observable<AccountDeletionImpact> {
    return this.http.get<AccountDeletionImpact>(`${this.API}/me/deletion-impact`);
  }

  request(confirmName: string, acknowledged: boolean): Observable<void> {
    return this.http.post<void>(`${this.API}/me/deletion-request`, { confirmName, acknowledged });
  }

  confirm(token: string): Observable<AccountDeletionScheduled> {
    return this.http.post<AccountDeletionScheduled>(`${this.API}/account-deletion/confirm`, { token });
  }

  cancel(token: string): Observable<void> {
    return this.http.post<void>(`${this.API}/account-deletion/cancel`, { token });
  }
}
