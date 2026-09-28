import { describe, it, expect } from 'vitest';
import ptBR from '../../public/assets/i18n/pt-BR.json';
import ptPT from '../../public/assets/i18n/pt-PT.json';
import en from '../../public/assets/i18n/en.json';

function collectKeys(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([key, value]) =>
    collectKeys(value, prefix ? `${prefix}.${key}` : key)
  );
}

describe('i18n key parity', () => {
  const locales: [string, unknown][] = [
    ['pt-BR.json', ptBR],
    ['pt-PT.json', ptPT],
    ['en.json', en],
  ];

  it('pt-BR.json, pt-PT.json and en.json declare the same set of keys', () => {
    const keySets = locales.map(([name, data]) => [name, new Set(collectKeys(data))] as const);

    for (const [name, keys] of keySets) {
      for (const [otherName, otherKeys] of keySets) {
        if (name === otherName) continue;
        const missing = [...keys].filter(k => !otherKeys.has(k));
        expect(missing, `Keys in ${name} missing from ${otherName}: ${missing.join(', ')}`).toEqual([]);
      }
    }
  });
});
