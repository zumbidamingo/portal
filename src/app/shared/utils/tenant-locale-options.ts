import { SUPPORTED_LOCALES } from '../../core/services/locale.service';

/** Moedas com Price do Stripe hoje — uma por mercado suportado (§7A: eixo operacional, muda raramente). */
export const CURRENCY_OPTIONS = [
  { label: 'BRL — Real', value: 'BRL' },
  { label: 'EUR — Euro', value: 'EUR' },
];

const LOCALE_LABELS: Record<string, string> = {
  'pt-BR': 'Português (Brasil)',
  'pt-PT': 'Português (Portugal)',
  en: 'English',
};
export const LOCALE_OPTIONS = SUPPORTED_LOCALES.map(l => ({ label: LOCALE_LABELS[l] ?? l, value: l }));

/** IANA zone ids from the runtime's own database — never a hand-maintained (and driftable) list. */
export const TIMEZONE_OPTIONS: { label: string; value: string }[] =
  (Intl as any).supportedValuesOf?.('timeZone')?.map((tz: string) => ({ label: tz, value: tz }))
  ?? [{ label: 'America/Sao_Paulo', value: 'America/Sao_Paulo' }];
