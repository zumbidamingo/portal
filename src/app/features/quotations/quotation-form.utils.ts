import { FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import type { PriceType, QuotationStatus } from '../../core/services/quotation.service';
import type { PaymentMethod, PaymentCondition, CreditCardInstallmentPlan } from '../../core/services/payment-method.service';
import type { BadgeSeverity } from '../../shared/utils/status.utils';

export { priceTypeQuantityConfig, priceTypeUnitLabelKey } from '../../shared/utils/price-type.utils';
export type { PriceTypeQuantityConfig } from '../../shared/utils/price-type.utils';

/** Códigos fechados de forma de pagamento — `OUTRO` liberta o texto livre em `paymentTermsCustom`. */
export const PAYMENT_TERMS_CODES = ['A_VISTA', 'PARCELADO', 'PIX', 'CARTAO_CREDITO', 'BOLETO', 'TRANSFERENCIA'] as const;

/** Códigos que ganharam um seletor estruturado próprio ("Meio de pagamento", com juros e
 *  parcelas) na reestruturação de Formas de Pagamento — somem da lista de "Forma de pagamento"
 *  (texto livre) porque mostrar os dois lado a lado duplicava a mesma escolha na tela (ex.:
 *  "Forma de pagamento: Cartão de crédito" ao lado de "Meio de pagamento: Cartão de crédito").
 *  Continuam em {@link PAYMENT_TERMS_CODES} só para orçamentos antigos que já gravaram um desses
 *  valores continuarem a exibir o rótulo traduzido em vez do texto cru. `A_VISTA`, `PARCELADO`,
 *  `BOLETO` e `OUTRO` não têm equivalente estruturado, continuam disponíveis para escolha. */
const PAYMENT_TERMS_CODES_SUPERSEDED_BY_PAYMENT_METHOD = new Set(['PIX', 'CARTAO_CREDITO', 'TRANSFERENCIA']);

/** Referência comercial legível do orçamento ("000123") — zero-padded a 6 dígitos, sem acoplar a
 *  ano/data (CLAUDE.md: formato simples, preparado para crescimento). Ponto único de formatação —
 *  toda tela que mostra o número do orçamento ao usuário passa por aqui. */
export function formatQuotationNumber(quotationNumber: number): string {
  return String(quotationNumber).padStart(6, '0');
}

export interface PaymentTermsOption {
  label: string;
  value: string;
}

export function buildPaymentTermsOptions(translate: TranslateService): PaymentTermsOption[] {
  return [...PAYMENT_TERMS_CODES, 'OUTRO']
    .filter(code => !PAYMENT_TERMS_CODES_SUPERSEDED_BY_PAYMENT_METHOD.has(code))
    .map(code => ({
      label: translate.instant(`quotations.paymentTerms.${code}`),
      value: code,
    }));
}

/** Rótulo de {@link PaymentMethod} — ponto único usado pelo diálogo de criação e pelo
 *  quotation-edit, para os dois nunca divergirem no texto mostrado para o mesmo método. */
export function paymentMethodLabel(translate: TranslateService, method: PaymentMethod): string {
  return translate.instant(`financial.payments.method${method}`);
}

/** Rótulo de {@link PaymentCondition} (reestruturação de Formas de Pagamento) — mesmo ponto
 *  único de {@link paymentMethodLabel}, para o diálogo de criação e o quotation-edit nunca
 *  divergirem no texto de "À vista"/"A prazo". */
export function paymentConditionLabel(translate: TranslateService, condition: PaymentCondition): string {
  return translate.instant(`financial.payments.condition${condition}`);
}

export interface InstallmentOption {
  label: string;
  value: number;
}

/**
 * Uma opção por parcela individual (não por faixa) — cada faixa "4x-6x" configurada pelo tenant
 * vira três opções no seletor, uma por quantidade, para quem monta o orçamento escolher a parcela
 * exata que o cliente quer. Ponto único usado pelo diálogo de criação de orçamento e pelo
 * quotation-edit: as duas telas resolvem juro de cartão de crédito a partir do mesmo plano de
 * parcelamento do tenant e têm de mostrar exatamente as mesmas opções — nenhuma reimplementação
 * paralela que possa divergir (issue: reestruturação de Formas de Pagamento — parcelamento).
 */
export function buildInstallmentOptions(plan: CreditCardInstallmentPlan | null, translate: TranslateService): InstallmentOption[] {
  const tiers = plan?.tiers ?? [];
  const options: InstallmentOption[] = [];
  for (const tier of [...tiers].sort((a, b) => a.minInstallments - b.minInstallments)) {
    for (let n = tier.minInstallments; n <= tier.maxInstallments; n++) {
      options.push({
        label: tier.interestPercentage > 0
          ? translate.instant('quotations.installmentOptionWithInterest', { n, percentage: tier.interestPercentage })
          : translate.instant('quotations.installmentOptionNoInterest', { n }),
        value: n,
      });
    }
  }
  return options;
}

export function paymentTermsDisplay(value: string | null, translate: TranslateService): string {
  if (!value) return '—';
  if ((PAYMENT_TERMS_CODES as readonly string[]).includes(value)) {
    return translate.instant(`quotations.paymentTerms.${value}`);
  }
  return value;
}

export function resolvePaymentTerms(preset: string | null, custom: string | null): string | undefined {
  if (!preset) return undefined;
  if (preset === 'OUTRO') return (custom || '').trim() || undefined;
  return preset;
}

export function resolvePaymentTermsPresetFromValue(value: string | null): { preset: string | null; custom: string } {
  if (!value) return { preset: null, custom: '' };
  if ((PAYMENT_TERMS_CODES as readonly string[]).includes(value)) return { preset: value, custom: '' };
  return { preset: 'OUTRO', custom: value };
}

export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** "Outro" só faz sentido com um texto — sem isso a condição de pagamento não é salva de forma alguma. */
export function wirePaymentTermsCustomValidator(group: FormGroup): void {
  const preset = group.get('paymentTermsPreset')!;
  const custom = group.get('paymentTermsCustom')!;
  preset.valueChanges.subscribe(value => {
    custom.setValidators(value === 'OUTRO' ? [Validators.required] : []);
    custom.updateValueAndValidity({ emitEvent: false });
  });
}

/** Hierarquia de cor por estado — rascunho é neutro, enviado é destaque (aguardando o cliente),
 *  aprovado é positivo, recusado é negativo e expirado é um alerta (perdido por tempo, não por
 *  rejeição). 'info' fica de fora de propósito: no preset do tema (app.config.ts) ele é o mesmo
 *  cinza de 'secondary' — usá-lo aqui deixaria "enviado" e "rascunho" com a cor idêntica. */
const QUOTATION_STATUS_SEVERITY: Record<QuotationStatus, BadgeSeverity> = {
  DRAFT: 'secondary',
  SENT: 'primary',
  APPROVED: 'success',
  DECLINED: 'danger',
  EXPIRED: 'warn',
};

export function quotationStatusSeverity(status: QuotationStatus): BadgeSeverity {
  return QUOTATION_STATUS_SEVERITY[status] ?? 'secondary';
}

/** Forma mínima usada pelos helpers de desconto abaixo — tanto {@link QuotationItem} (interno)
 *  quanto {@code PublicQuotationItem} (link público, sem type/value de redisplay) a satisfazem. */
export interface GrossAmountItem {
  priceType: PriceType;
  unitPrice: number;
  quantity: number;
  discountAmount: number;
}

/** Valor bruto da linha antes de desconto — mesma regra de {@code QuotationItem#grossAmount}
 *  no backend: preço fixo não multiplica por quantidade. */
export function itemGrossAmount(item: GrossAmountItem): number {
  return item.priceType === 'FIXED' ? item.unitPrice : item.unitPrice * item.quantity;
}

/** Percentual efetivo do desconto sobre o bruto da linha, para sempre mostrar "-R$ X (Y%)"
 *  mesmo quando o desconto foi digitado como valor monetário. */
export function itemDiscountPercent(item: GrossAmountItem): number {
  const gross = itemGrossAmount(item);
  if (gross <= 0) return 0;
  return (item.discountAmount / gross) * 100;
}

/** Soma do bruto de todas as linhas, antes de qualquer desconto de item — usado na composição
 *  "Subtotal dos itens" quando o desconto por item está habilitado (ambiguidade do enunciado). */
export function quotationItemsGrossSubtotal(items: GrossAmountItem[]): number {
  return items.reduce((sum, item) => sum + itemGrossAmount(item), 0);
}

/** Soma dos descontos já aplicados a cada linha — "Descontos dos itens" na composição de valores. */
export function quotationItemsDiscountTotal(items: GrossAmountItem[]): number {
  return items.reduce((sum, item) => sum + item.discountAmount, 0);
}

/** Percentual efetivo do desconto do orçamento inteiro sobre o subtotal líquido de item — mesma
 *  ideia de {@link itemDiscountPercent}, um nível acima. */
export function quotationDiscountPercent(q: { discountAmount: number; subtotal: number }): number {
  if (q.subtotal <= 0) return 0;
  return (q.discountAmount / q.subtotal) * 100;
}

/** Detalhe de negócio do backend quando existe (`quotations.errors.<code>`); senão a mensagem genérica traduzida. */
export function quotationErrorMessage(err: unknown, translate: TranslateService, fallbackKey: string): string {
  const code = (err as { error?: { errorCode?: string } })?.error?.errorCode;
  const detail = (err as { error?: { detail?: string } })?.error?.detail;
  if (code && translate.instant(`quotations.errors.${code}`) !== `quotations.errors.${code}`) {
    return translate.instant(`quotations.errors.${code}`);
  }
  return detail || translate.instant(fallbackKey);
}
