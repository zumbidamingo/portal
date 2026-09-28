/**
 * Data (dia civil), sem hora — para a navegação de datas de Rotas e para casar `Order.scheduledStartAt`
 * (um `Instant`) com o dia selecionado no fuso do tenant. `OrderController.search` filtra por
 * limites UTC do dia (ver `JpaOrderRepository`), não pelo fuso do tenant — para uma ordem
 * agendada de madrugada num fuso negativo isso pode devolvê-la no dia UTC errado. A busca de
 * orders do dia (usada para "técnico com atividade sem rota" e para enriquecer paradas) por isso
 * busca uma janela alargada (`shiftIsoDate(date, -1)`..`shiftIsoDate(date, 1)`) e filtra aqui,
 * no fuso certo. `Route.routeDate` é um `LocalDate` puro e não sofre desse problema.
 */

const ISO_CACHE = new Map<string, Intl.DateTimeFormat>();

/** Formata uma data local (do navegador) como `yyyy-MM-dd`. */
export function toIsoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayIsoDate(): string {
  return toIsoDate(new Date());
}

/** `date` +/- `days` dias civis, sem passar por fuso horário nenhum (aritmética em UTC). */
export function shiftIsoDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** `yyyy-MM-dd` do instante `isoInstant`, visto no fuso `timeZone` (fallback UTC quando ausente). */
function instantToIsoDateInZone(isoInstant: string, timeZone: string | null | undefined): string {
  const zone = timeZone?.trim() || 'UTC';
  let formatter = ISO_CACHE.get(zone);
  if (!formatter) {
    // en-CA formata nativamente como yyyy-MM-dd.
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' });
    ISO_CACHE.set(zone, formatter);
  }
  return formatter.format(new Date(isoInstant));
}

/** `instant` (um `Instant` ISO do backend, ex.: `scheduledStartAt`) cai no dia `dateIso`, olhado
 *  a partir do fuso do tenant? */
export function isSameTenantDay(instant: string | null, dateIso: string, timeZone: string | null): boolean {
  if (!instant) return false;
  return instantToIsoDateInZone(instant, timeZone) === dateIso;
}
