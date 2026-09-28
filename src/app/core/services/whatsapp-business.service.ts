import { Injectable, NgZone, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';

export type WhatsAppConnectionStatus =
  | 'NOT_CONNECTED' | 'CONNECTING' | 'CONNECTED' | 'PENDING_SETUP'
  | 'ATTENTION_REQUIRED' | 'ERROR' | 'DISCONNECTED';

export interface WhatsAppConnection {
  available: boolean;
  status: WhatsAppConnectionStatus;
  environment: 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION';
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  statusReason: string | null;
  connectedAt: string | null;
}

interface SignupConfig {
  appId: string;
  configId: string;
  graphVersion: string;
}

/**
 * Tudo o que a tela de Integrações do WhatsApp precisa: as chamadas ao backend e a orquestração do
 * Embedded Signup da Meta (SDK já carregado em `index.html`, ver {@link SocialAuthService} para o
 * mesmo padrão do login social). Nenhum token, PIN ou id técnico da Meta passa por aqui além do
 * necessário para lançar e ler o próprio fluxo — o backend é quem confirma tudo com a Meta.
 */
@Injectable({ providedIn: 'root' })
export class WhatsAppBusinessService {
  private readonly API = `${environment.apiUrl}/whatsapp`;
  private http = inject(HttpClient);
  private zone = inject(NgZone);

  getConnection(): Observable<WhatsAppConnection> {
    return this.http.get<WhatsAppConnection>(`${this.API}/connection`);
  }

  retrySetup(): Observable<WhatsAppConnection> {
    return this.http.post<WhatsAppConnection>(`${this.API}/connection/retry`, {});
  }

  disconnect(): Observable<WhatsAppConnection> {
    return this.http.delete<WhatsAppConnection>(`${this.API}/connection`);
  }

  /** Abre o fluxo completo: pede a configuração ao backend, lança o Embedded Signup da Meta no
   *  browser, captura o que ele devolve e pede ao backend para confirmar e concluir a ligação. */
  connect(): Observable<WhatsAppConnection> {
    return this.http.post<SignupConfig>(`${this.API}/connection/start`, {}).pipe(
      switchMap(config => this.runEmbeddedSignup(config)),
      switchMap(result => this.http.post<WhatsAppConnection>(`${this.API}/connection/complete`, result))
    );
  }

  private runEmbeddedSignup(config: SignupConfig): Observable<{
    code: string; wabaId?: string; phoneNumberId?: string; businessId?: string;
  }> {
    return new Observable(subscriber => {
      const fb = window.FB;
      if (!fb) {
        subscriber.error(new Error('META_SDK_UNAVAILABLE'));
        return;
      }
      fb.init({ appId: config.appId, xfbml: false, version: config.graphVersion });

      let sessionInfo: { wabaId?: string; phoneNumberId?: string; businessId?: string } = {};

      const onMessage = (event: MessageEvent) => {
        if (!String(event.origin).endsWith('facebook.com')) {
          return;
        }
        let payload: WhatsAppEmbeddedSignupEventData | null = null;
        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }
        if (payload?.type !== 'WA_EMBEDDED_SIGNUP') {
          return;
        }
        if (payload.event === 'CANCEL') {
          this.zone.run(() => {
            cleanup();
            subscriber.error(new Error('SIGNUP_CANCELLED'));
          });
          return;
        }
        sessionInfo = {
          wabaId: payload.data.waba_id,
          phoneNumberId: payload.data.phone_number_id,
          businessId: payload.data.business_id,
        };
      };

      const timeoutId = setTimeout(() => {
        this.zone.run(() => {
          cleanup();
          subscriber.error(new Error('SIGNUP_TIMEOUT'));
        });
      }, 5 * 60 * 1000);

      const cleanup = () => {
        window.removeEventListener('message', onMessage);
        clearTimeout(timeoutId);
      };

      window.addEventListener('message', onMessage);

      fb.login(response => {
        this.zone.run(() => {
          cleanup();
          const code = response.authResponse?.code;
          if (response.status !== 'connected' || !code) {
            subscriber.error(new Error('SIGNUP_CANCELLED'));
            return;
          }
          subscriber.next({ code, ...sessionInfo });
          subscriber.complete();
        });
      }, {
        config_id: config.configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: { setup: {} },
      });
    });
  }
}
