import { Injectable } from '@angular/core';

/**
 * O access token vive só em memória. O refresh token já não passa pelo JavaScript: o backend
 * guarda-o num cookie HttpOnly (ver {@code refresh-cookie.interceptor.ts}), por isso um XSS não o
 * consegue ler. O que fica em localStorage é apenas uma pista sem valor de segurança
 * ({@code rf_has_session}) — evita uma chamada de renovação condenada a falhar em quem nunca entrou.
 */
@Injectable({ providedIn: 'root' })
export class TokenService {
  private accessToken: string | null = null;
  private readonly SESSION_HINT_KEY = 'rf_has_session';
  /** Refresh token guardado em localStorage por versões anteriores — só lido para migrar. */
  private readonly LEGACY_REFRESH_KEY = 'rf_refresh_token';

  setAccessToken(token: string): void {
    this.accessToken = token;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  /** Há motivo para tentar renovar a sessão: já se entrou neste browser (ou há token da versão antiga). */
  hasSessionHint(): boolean {
    return this.read(this.SESSION_HINT_KEY) === '1' || this.legacyRefreshToken() !== null;
  }

  markSession(): void {
    this.write(this.SESSION_HINT_KEY, '1');
    // O cookie já tem a sessão; o token antigo em localStorage deixa de ser necessário e de estar exposto.
    this.remove(this.LEGACY_REFRESH_KEY);
  }

  /** Migração: o token da versão antiga vai no corpo do primeiro refresh, que o troca por um cookie. */
  legacyRefreshToken(): string | null {
    return this.read(this.LEGACY_REFRESH_KEY);
  }

  clearTokens(): void {
    this.accessToken = null;
    this.remove(this.SESSION_HINT_KEY);
    this.remove(this.LEGACY_REFRESH_KEY);
  }

  hasValidToken(): boolean {
    return !!this.accessToken;
  }

  private read(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
  }

  private write(key: string, value: string): void {
    try { localStorage.setItem(key, value); } catch { /* armazenamento indisponível: perde-se só a pista */ }
  }

  private remove(key: string): void {
    try { localStorage.removeItem(key); } catch { /* idem */ }
  }
}
