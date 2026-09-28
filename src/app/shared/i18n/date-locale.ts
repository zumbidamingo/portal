/**
 * Centralised, locale-aware date/time formatting.
 *
 * Every date, time and interval shown in the Portal must be formatted through
 * this module so presentation follows the locale the user selected (see
 * {@link ../../core/services/locale.service}) instead of a hardcoded locale.
 * Backend timestamps travel as raw ISO strings and are formatted here, at the
 * presentation layer, per the active locale.
 */

export type DateFormatKind = 'date' | 'time' | 'datetime' | 'shortDate' | 'medium' | 'monthYear' | 'weekdayDate' | 'weekdayDatetime';

/**
 * O locale ativo já é uma etiqueta BCP-47 completa ('pt-BR', 'pt-PT', 'en'), portanto não há mapa
 * nenhum a fazer aqui — o Intl resolve-a diretamente. Este ficheiro deixou de traduzir idioma
 * em região porque a região passou a fazer parte do valor.
 */
const FALLBACK_TAG = 'en-GB';

const OPTIONS: Record<DateFormatKind, Intl.DateTimeFormatOptions> = {
  date: { day: '2-digit', month: '2-digit', year: 'numeric' },
  time: { hour: '2-digit', minute: '2-digit' },
  datetime: { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' },
  shortDate: { day: '2-digit', month: '2-digit' },
  medium: { day: '2-digit', month: 'short', year: 'numeric' },
  monthYear: { month: 'long', year: 'numeric' },
  /** Cabeçalho do navegador de datas de Rotas: "segunda-feira, 7 de setembro". */
  weekdayDate: { weekday: 'long', day: 'numeric', month: 'long' },
  /** Horário oferecido na disponibilidade: "seg., 07/09/2026, 14:00" — o dia da semana ajuda a escolher. */
  weekdayDatetime: { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' },
};

/** Placeholder shown for absent/invalid dates, matching the previous DatePt pipe. */
export const EMPTY_DATE = '-';

export function localeTag(locale: string | null | undefined): string {
  return locale?.trim() || FALLBACK_TAG;
}

// Intl.DateTimeFormat construction is comparatively expensive; cache one
// formatter per (locale, kind, timeZone) so the impure LocalizedDatePipe stays cheap.
const formatterCache = new Map<string, Intl.DateTimeFormat>();

export function dateFormatter(
  lang: string | null | undefined,
  kind: DateFormatKind,
  timeZone?: string | null,
): Intl.DateTimeFormat {
  const tag = localeTag(lang);
  const key = `${tag}:${kind}:${timeZone ?? ''}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    const options = timeZone ? { ...OPTIONS[kind], timeZone } : OPTIONS[kind];
    formatter = new Intl.DateTimeFormat(tag, options);
    formatterCache.set(key, formatter);
  }
  return formatter;
}

/**
 * Formats a single date/time value for the given locale. `timeZone` is an IANA zone id (e.g.
 * `tenants.timezone`) — pass it whenever the value is a wall-clock moment agreed with the tenant
 * (scheduling windows), so it renders as what the tenant meant, not the viewer's local zone.
 */
export function formatLocalizedDate(
  value: string | number | Date | null | undefined,
  lang: string | null | undefined,
  kind: DateFormatKind = 'date',
  timeZone?: string | null,
): string {
  if (value === null || value === undefined || value === '') return EMPTY_DATE;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return EMPTY_DATE;
  return dateFormatter(lang, kind, timeZone).format(date);
}

/** Formats a start–end interval, e.g. "23/07/2026 – 25/07/2026". */
export function formatLocalizedRange(
  start: string | number | Date | null | undefined,
  end: string | number | Date | null | undefined,
  lang: string | null | undefined,
  kind: DateFormatKind = 'date',
  timeZone?: string | null,
): string {
  const from = formatLocalizedDate(start, lang, kind, timeZone);
  const to = formatLocalizedDate(end, lang, kind, timeZone);
  if (from === EMPTY_DATE) return to;
  if (to === EMPTY_DATE) return from;
  return `${from} – ${to}`;
}

/**
 * Inverso de {@link formatLocalizedDate}: um `Date` cujos campos de calendário (ano, mês, dia,
 * hora, minuto) são o que o utilizador escolheu num seletor de data/hora — não o instante real,
 * que `p-datepicker` sempre constrói no fuso do browser — devolve o `Instant` que, formatado no
 * fuso do tenant, mostra exatamente esses mesmos campos. Sem isto, "escolher outra data e
 * horário" pediria disponibilidade num instante deslocado pela diferença entre o fuso do browser
 * de quem agenda e o fuso onde o técnico de facto trabalha (issue: sugestão de horário não pode
 * depender de em que fuso está o dispositivo de quem agenda — CLAUDE.md §7A).
 *
 * Sem {@code timeZone}, devolve o valor tal como veio (mesmo comportamento de antes, fuso do
 * browser) — só entra em jogo quando já se sabe o fuso do tenant.
 */
export function zonedWallClockToInstant(wallClock: Date, timeZone: string | null | undefined): Date {
  if (!timeZone) return wallClock;
  const asUtcMs = Date.UTC(
    wallClock.getFullYear(), wallClock.getMonth(), wallClock.getDate(),
    wallClock.getHours(), wallClock.getMinutes(), wallClock.getSeconds(),
  );
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(new Date(asUtcMs)).map(p => [p.type, p.value]),
  );
  // Intl. renders midnight as "24" in hour12:false — treat it as 0, same day rollover the parts
  // (year/month/day) already carry.
  const hour = Number(parts['hour']) % 24;
  const shownAsUtcMs = Date.UTC(
    Number(parts['year']), Number(parts['month']) - 1, Number(parts['day']),
    hour, Number(parts['minute']), Number(parts['second']),
  );
  const offsetMs = shownAsUtcMs - asUtcMs;
  return new Date(asUtcMs - offsetMs);
}

/**
 * Inverso de {@link zonedWallClockToInstant}: um instante real devolvido como um `Date` cujos
 * campos de calendário (ano, mês, dia, hora, minuto) são os do fuso do tenant — não os do fuso do
 * browser. Serve só para alimentar `defaultDate`/`minDate` de um `p-datepicker`, que sempre lê os
 * campos de calendário do `Date` como se fossem os do browser: sem isto, o seletor abre sugerindo
 * a hora atual do browser de quem agenda, não a do tenant (issue: seletor de "outra data e
 * horário" mostrando a hora de quem está a agendar, não a do tenant — CLAUDE.md §7A).
 */
export function instantToZonedWallClock(instant: Date, timeZone: string | null | undefined): Date {
  if (!timeZone) return new Date(instant.getTime());
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(instant).map(p => [p.type, p.value]),
  );
  const hour = Number(parts['hour']) % 24;
  return new Date(
    Number(parts['year']), Number(parts['month']) - 1, Number(parts['day']),
    hour, Number(parts['minute']), Number(parts['second']),
  );
}

/** "Agora", nos campos de calendário do fuso do tenant — ver {@link instantToZonedWallClock}. */
export function zonedNow(timeZone: string | null | undefined): Date {
  return instantToZonedWallClock(new Date(), timeZone);
}

