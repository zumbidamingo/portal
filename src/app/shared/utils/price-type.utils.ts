import type { PriceType } from '../../core/services/catalog.service';

/** Chave i18n da unidade curta mostrada ao lado de quantidade e preço unitário. `FIXED` não tem
 *  unidade — a linha é "1 serviço", não "1 un.". Compartilhado entre Quotation e Order: os dois
 *  mostram a mesma linha de item ("N x R$ X"), com a mesma noção de unidade do catálogo. */
const PRICE_TYPE_UNIT_LABEL_KEY: Record<PriceType, string> = {
  FIXED: '',
  PER_SQUARE_METER: 'quotations.unit.sqm',
  PER_PIECE: 'quotations.unit.piece',
  PER_HOUR: 'quotations.unit.hour',
};

export function priceTypeUnitLabelKey(priceType: PriceType): string {
  return PRICE_TYPE_UNIT_LABEL_KEY[priceType];
}

export interface PriceTypeQuantityConfig {
  /** Preço fixo não escala com quantidade — o campo nem aparece, é sempre 1 (CLAUDE.md, issue #39). */
  fixed: boolean;
  min: number;
  step: number;
  /** Casas decimais aceitas — peça é inteira, m²/hora aceitam fração. */
  decimals: number;
}

const PRICE_TYPE_QUANTITY_CONFIG: Record<PriceType, PriceTypeQuantityConfig> = {
  FIXED: { fixed: true, min: 1, step: 1, decimals: 0 },
  PER_PIECE: { fixed: false, min: 1, step: 1, decimals: 0 },
  PER_SQUARE_METER: { fixed: false, min: 0.00, step: 1.00, decimals: 2 },
  PER_HOUR: { fixed: false, min: 0.25, step: 0.25, decimals: 2 },
};

export function priceTypeQuantityConfig(priceType: PriceType): PriceTypeQuantityConfig {
  return PRICE_TYPE_QUANTITY_CONFIG[priceType];
}
