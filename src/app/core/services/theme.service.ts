import { Injectable, computed, signal } from '@angular/core';

const THEME_KEY = 'suaoperacao_theme';

export const THEME_MODES = ['light', 'dark', 'system'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
export type ResolvedTheme = 'light' | 'dark';

/**
 * Tema do portal (DESIGN.md → Theming). O utilizador escolhe `light`, `dark` ou `system`; o
 * resultado resolvido é escrito em `<html data-theme>`, que é o único gancho que styles.css e o
 * preset do PrimeNG observam — nenhum componente decide cores por si.
 *
 * A escolha vive em localStorage (cache do dispositivo) e, com sessão, também em
 * `users.theme_preference` (ver AuthService): o servidor ganha no login, o localStorage garante a
 * primeira pintura e o modo sem sessão. O script inline de `index.html` lê a mesma
 * chave antes do Angular arrancar, para a primeira pintura já sair no tema certo.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly systemQuery =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;

  private readonly _mode = signal<ThemeMode>(this.readStored());
  private readonly systemDark = signal<boolean>(this.systemQuery?.matches ?? false);

  readonly mode = this._mode.asReadonly();
  readonly resolved = computed<ResolvedTheme>(() => {
    const mode = this._mode();
    if (mode === 'system') return this.systemDark() ? 'dark' : 'light';
    return mode;
  });

  /** Aplica o tema guardado e passa a seguir a preferência do sistema enquanto o modo for `system`. */
  init(): void {
    this.systemQuery?.addEventListener('change', event => {
      this.systemDark.set(event.matches);
      this.apply();
    });
    this.apply();
  }

  setMode(mode: ThemeMode): void {
    this._mode.set(mode);
    try {
      localStorage.setItem(THEME_KEY, mode);
    } catch {
      // Storage bloqueado (modo privado, política do browser): o tema vale só nesta sessão.
    }
    this.apply();
  }

  /** Valor vindo do servidor (preferência do utilizador): aceita só modos conhecidos e ignora o resto. */
  restore(mode: string | null | undefined): void {
    const known = THEME_MODES.find(m => m === mode);
    if (known && known !== this._mode()) this.setMode(known);
  }

  private apply(): void {
    document.documentElement.setAttribute('data-theme', this.resolved());
  }

  private readStored(): ThemeMode {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      return THEME_MODES.find(mode => mode === stored) ?? 'system';
    } catch {
      return 'system';
    }
  }
}
