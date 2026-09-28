/** Minutes between two ISO instants — used to show the service duration next to a
 *  scheduled start time, since a bare start timestamp reads as a single point in time
 *  rather than the window it actually represents (start of service → end of service). */
export function scheduleDurationMinutes(startIso: string, endIso: string): number {
  return Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
}

/** Rótulo de exibição para os N técnicos de uma visita (issue N prestadores) — junta os nomes
 *  com vírgula; "—" quando nenhum resolveu nome (id de outro tenant, improvável). Tamanho 1 fora
 *  de rota conjunta, como sempre foi. */
export function technicianNamesLabel(names: (string | null)[]): string {
  const resolved = names.filter((n): n is string => !!n);
  return resolved.length ? resolved.join(', ') : '—';
}
