import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

const LOCALE_KEY = 'suaoperacao_locale';

/**
 * Locales servidos. São etiquetas BCP-47 completas de propósito: é a região que decide o
 * separador decimal, o formato de data e o vocabulário — `pt` sozinho não distingue um mercado
 * que escreve `1.234,56` de outro que escreve o mesmo número da mesma forma mas chama CNPJ ao
 * que o primeiro chama NIF.
 */
export const SUPPORTED_LOCALES = ['pt-BR', 'pt-PT', 'en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

const FALLBACK: SupportedLocale = 'en';

/**
 * Preferências herdadas ou parciais que ainda assim se conseguem servir. Um `pt` sem região
 * chega-nos de sessões antigas e de browsers configurados só com o idioma; mandá-lo para inglês
 * seria pior do que escolher o mercado maior.
 */
const REGION_FALLBACKS: Record<string, SupportedLocale> = {
  pt: 'pt-BR',
  'pt-AO': 'pt-PT',
  'pt-MZ': 'pt-PT',
  en: 'en',
};

@Injectable({ providedIn: 'root' })
export class LocaleService {
  private translate = inject(TranslateService);

  /**
   * Resolve o locale ativo. Um `lang` entregue pela Landing por parâmetro de URL ganha sempre —
   * reflete uma escolha feita nesta sessão e tem de se sobrepor ao que uma visita anterior ao
   * portal deixou em localStorage (origem diferente, storage não partilhado). A seguir vem o
   * guardado, depois a deteção pelo browser; o valor resolvido é persistido em qualquer dos casos.
   */
  getStored(): SupportedLocale {
    const fromUrl = this.detectFromUrl();
    if (fromUrl) {
      localStorage.setItem(LOCALE_KEY, fromUrl);
      return fromUrl;
    }

    const stored = this.normalize(localStorage.getItem(LOCALE_KEY));
    if (stored) return stored;

    const detected = this.detectFromBrowser();
    localStorage.setItem(LOCALE_KEY, detected);
    return detected;
  }

  setLocale(locale: string): void {
    const resolved = this.normalize(locale) ?? FALLBACK;
    localStorage.setItem(LOCALE_KEY, resolved);
    this.translate.use(resolved);
  }

  /**
   * Aproxima uma etiqueta arbitrária ao locale servido mais próximo: exato, depois pela tabela de
   * fallbacks por região, depois qualquer locale servido do mesmo idioma.
   */
  normalize(tag: string | null | undefined): SupportedLocale | null {
    if (!tag) return null;

    const canonical = tag.trim().replace('_', '-');
    const exact = SUPPORTED_LOCALES.find(l => l.toLowerCase() === canonical.toLowerCase());
    if (exact) return exact;

    const mapped = REGION_FALLBACKS[canonical.toLowerCase()];
    if (mapped) return mapped;

    const language = canonical.split("-")[0].toLowerCase();
    return SUPPORTED_LOCALES.find(l => l.split("-")[0] === language) ?? null;
  }

  private detectFromUrl(): SupportedLocale | null {
    const params = new URLSearchParams(window.location.search);
    return this.normalize(params.get('locale') ?? params.get('lang'));
  }

  private detectFromBrowser(): SupportedLocale {
    for (const candidate of navigator.languages ?? [navigator.language]) {
      const match = this.normalize(candidate);
      if (match) return match;
    }
    return FALLBACK;
  }
}
