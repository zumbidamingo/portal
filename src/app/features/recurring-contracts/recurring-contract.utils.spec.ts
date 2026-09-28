import { describe, expect, it } from 'vitest';
import { nextCycleDate, startOfDay, suggestedFirstRun } from './recurring-contract.utils';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe('nextCycleDate — espelha Periodicity.next do backend', () => {
  it('semanal soma 7 dias e quinzenal 14, cruzando o fim do mês', () => {
    expect(nextCycleDate(d(2026, 10, 15), 'WEEKLY')).toEqual(d(2026, 10, 22));
    expect(nextCycleDate(d(2026, 10, 28), 'WEEKLY')).toEqual(d(2026, 11, 4));
    expect(nextCycleDate(d(2026, 10, 15), 'BIWEEKLY')).toEqual(d(2026, 10, 29));
  });

  it('mensal e trimestral somam meses mantendo o dia', () => {
    expect(nextCycleDate(d(2026, 10, 15), 'MONTHLY')).toEqual(d(2026, 11, 15));
    expect(nextCycleDate(d(2026, 10, 15), 'QUARTERLY')).toEqual(d(2027, 1, 15));
  });

  it('cai no último dia do mês quando o dia não existe no destino', () => {
    expect(nextCycleDate(d(2026, 1, 31), 'MONTHLY')).toEqual(d(2026, 2, 28));
    expect(nextCycleDate(d(2028, 1, 31), 'MONTHLY')).toEqual(d(2028, 2, 29));
    expect(nextCycleDate(d(2026, 11, 30), 'QUARTERLY')).toEqual(d(2027, 2, 28));
  });
});

describe('suggestedFirstRun', () => {
  it('é um período depois de hoje, ignorando a hora', () => {
    expect(suggestedFirstRun(new Date(2026, 8, 19, 23, 59), 'MONTHLY')).toEqual(d(2026, 10, 19));
    expect(suggestedFirstRun(new Date(2026, 8, 19, 8, 0), 'WEEKLY')).toEqual(d(2026, 9, 26));
  });
});

describe('startOfDay', () => {
  it('zera a hora', () => {
    expect(startOfDay(new Date(2026, 8, 19, 15, 30))).toEqual(d(2026, 9, 19));
  });
});
