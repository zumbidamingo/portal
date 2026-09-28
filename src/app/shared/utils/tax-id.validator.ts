import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Validação estrutural do documento fiscal, por país.
 *
 * Espelha `TaxIdResolver` e os validadores do backend de propósito — o backend é que decide,
 * isto só evita uma ida ao servidor para apanhar um erro de digitação. Se um dos dois mudar,
 * o outro tem de mudar também.
 */
export type SupportedCountry = 'PT' | 'BR';

export interface TaxIdMeta {
  /** Etiqueta i18n do campo, para o rótulo do formulário. */
  labelKey: string;
  /** Máscara do PrimeNG, ou `null` quando o país admite mais do que um comprimento. */
  mask: string | null;
  placeholder: string;
}

export const TAX_ID_META: Record<SupportedCountry, TaxIdMeta> = {
  PT: { labelKey: 'profile.taxId.PT', mask: '999-999-999', placeholder: '000000000' },
  // Sem máscara fixa: o Brasil aceita CNPJ (14) e CPF (11), e uma máscara de 14 impediria
  // um prestador em nome individual de escrever o seu próprio documento.
  BR: { labelKey: 'profile.taxId.BR', mask: null, placeholder: '00.000.000/0000-00' },
};

/** Remove separadores e passa a maiúsculas. Não filtra letras: o CNPJ passou a admiti-las. */
export function normalizeTaxId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return cleaned.length ? cleaned : null;
}

/** NIF português: 9 dígitos, checksum mod 11. */
export function isValidPtNif(value: string): boolean {
  if (value.length !== 9 || !/^\d{9}$/.test(value)) return false;

  let sum = 0;
  for (let i = 0; i < 8; i++) {
    sum += Number(value[i]) * (9 - i);
  }
  const remainder = sum % 11;
  const expected = remainder < 2 ? 0 : 11 - remainder;
  return Number(value[8]) === expected;
}

/** CPF: 11 dígitos, dois verificadores mod 11. Sequências repetidas são rejeitadas. */
export function isValidBrCpf(value: string): boolean {
  if (value.length !== 11 || !/^\d{11}$/.test(value)) return false;
  if (new Set(value).size === 1) return false;

  const digit = (upTo: number, startWeight: number): number => {
    let sum = 0;
    for (let i = 0; i < upTo; i++) sum += Number(value[i]) * (startWeight - i);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  return Number(value[9]) === digit(9, 10) && Number(value[10]) === digit(10, 11);
}

const CNPJ_FIRST_WEIGHTS = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const CNPJ_SECOND_WEIGHTS = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/**
 * CNPJ: 14 posições, doze de raiz e dois verificadores.
 *
 * A raiz é alfanumérica desde que a Receita Federal passou a emitir CNPJ com letras; cada
 * posição contribui com o seu código ASCII menos 48, o que mantém válido todo o CNPJ já emitido.
 */
export function isValidBrCnpj(value: string): boolean {
  if (value.length !== 14) return false;
  if (!/^[A-Z0-9]{12}\d{2}$/.test(value)) return false;
  if (new Set(value).size === 1) return false;

  const digit = (weights: number[]): number => {
    let sum = 0;
    for (let i = 0; i < weights.length; i++) sum += (value.charCodeAt(i) - 48) * weights[i];
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  return Number(value[12]) === digit(CNPJ_FIRST_WEIGHTS) && Number(value[13]) === digit(CNPJ_SECOND_WEIGHTS);
}

/** Aceita qualquer documento válido no país indicado — o tipo é deduzido do próprio número. */
export function isValidTaxId(country: SupportedCountry, raw: string | null | undefined): boolean {
  const value = normalizeTaxId(raw);
  if (!value) return false;

  switch (country) {
    case 'PT':
      return isValidPtNif(value);
    case 'BR':
      return isValidBrCnpj(value) || isValidBrCpf(value);
  }
}

/**
 * Validador de formulário. Deixa passar o valor vazio — a obrigatoriedade é
 * `Validators.required`, para que o utilizador não veja "documento inválido" num campo que
 * ainda nem começou a preencher.
 */
export function taxIdValidator(country: () => SupportedCountry): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (!control.value) return null;
    return isValidTaxId(country(), control.value) ? null : { taxId: true };
  };
}

/** Aplica separadores a `value` progressivamente: `groups` são os tamanhos de cada bloco e `seps` o que vem antes do bloco seguinte. */
function applyGroups(value: string, groups: number[], seps: string[]): string {
  let out = '';
  let pos = 0;
  for (let i = 0; i < groups.length && pos < value.length; i++) {
    if (i > 0) out += seps[i - 1];
    out += value.slice(pos, pos + groups[i]);
    pos += groups[i];
  }
  return out;
}

/**
 * Máscara de digitação do documento brasileiro. O Brasil tem dois formatos, então não há máscara
 * fixa: só dígitos até 11 posições formatam como CPF; a partir da 12.ª posição, ou logo que
 * aparece uma letra (raiz alfanumérica do CNPJ), formata como CNPJ. Excesso é cortado nas 14.
 */
export function maskBrTaxIdInput(raw: string | null | undefined): string {
  const value = (normalizeTaxId(raw) ?? '').slice(0, 14);
  const isCpf = value.length <= 11 && /^\d*$/.test(value);
  return isCpf
    ? applyGroups(value, [3, 3, 3, 2], ['.', '.', '-'])
    : applyGroups(value, [2, 3, 3, 4, 2], ['.', '.', '/', '-']);
}

/**
 * Formata um documento já normalizado (guardado sem separadores) para leitura — CPF/CNPJ pelo
 * comprimento (11 vs. 14, já que o Brasil não tem um único formato de país), NIF nos mesmos
 * grupos de três dígitos da máscara de input. Documento que não bate com nenhum comprimento
 * conhecido volta como veio — mais seguro que inventar uma máscara errada.
 */
export function formatTaxIdForDisplay(taxId: string | null | undefined, country: SupportedCountry): string | null {
  const value = normalizeTaxId(taxId);
  if (!value) return null;

  if (country === 'PT' && /^\d{9}$/.test(value)) {
    return value.replace(/(\d{3})(\d{3})(\d{3})/, '$1-$2-$3');
  }
  if (country === 'BR') {
    if (/^\d{11}$/.test(value)) {
      return value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }
    if (/^[A-Z0-9]{12}\d{2}$/.test(value)) {
      return value.replace(/(.{2})(.{3})(.{3})(.{4})(.{2})/, '$1.$2.$3/$4-$5');
    }
  }
  return value;
}

/**
 * Documento de pessoa singular (CPF ou NIF) — o que identifica um técnico ou operador. CNPJ fica
 * de fora: identifica uma empresa. Aceita os dois países porque o backend decide pelo país da
 * empresa; aqui só se apanha o erro de digitação.
 */
export function isValidPersonalTaxId(raw: string | null | undefined): boolean {
  const value = normalizeTaxId(raw);
  if (!value) return false;
  return isValidBrCpf(value) || isValidPtNif(value);
}

/** Como {@link taxIdValidator}: valor vazio passa, a obrigatoriedade é `Validators.required`. */
export function personalTaxIdValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (!control.value) return null;
    return isValidPersonalTaxId(control.value) ? null : { taxId: true };
  };
}

/** Máscara de digitação do CPF (até 11 dígitos). Só dígitos; NIF (9) e CPF partilham o campo. */
export function maskPersonalTaxIdInput(raw: string | null | undefined): string {
  const digits = (raw ?? '').replace(/\D/g, '').slice(0, 11);
  return applyGroups(digits, [3, 3, 3, 2], ['.', '.', '-']);
}
