import type { Periodicity } from '../../core/services/recurring-contract.service';

/**
 * Próxima data de ciclo a partir de `from` — espelha `Periodicity.next` do backend
 * (`LocalDate.plusWeeks/plusMonths`): somar meses num dia que não existe no mês de destino cai
 * no último dia dele (31/jan + 1 mês = 28 ou 29/fev), nunca transborda para o mês seguinte.
 */
export function nextCycleDate(from: Date, periodicity: Periodicity): Date {
  switch (periodicity) {
    case 'WEEKLY': return addDays(from, 7);
    case 'BIWEEKLY': return addDays(from, 14);
    case 'MONTHLY': return addMonths(from, 1);
    case 'QUARTERLY': return addMonths(from, 3);
  }
}

/** Primeira execução sugerida: um período depois de hoje — o serviço original já cobre "agora". */
export function suggestedFirstRun(today: Date, periodicity: Periodicity): Date {
  return nextCycleDate(startOfDay(today), periodicity);
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

function addMonths(d: Date, months: number): Date {
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), lastDay));
}
