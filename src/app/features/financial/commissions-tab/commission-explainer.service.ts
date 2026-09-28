import { CurrencyPipe, formatNumber } from '@angular/common';
import { Injectable, LOCALE_ID, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Commission, Money, PaymentMethod } from '../../../core/services/financial.service';

/**
 * Traduz uma comissão para o que o dono precisa de ler: a frase que responde "por que este valor?"
 * e a regra em palavras simples. O backend devolve a regra estruturada (tipo, percentual, valor) e
 * o dinheiro sem formatar; a frase é montada aqui, no idioma e na moeda de quem lê.
 */
@Injectable({ providedIn: 'root' })
export class CommissionExplainerService {
  private readonly translate = inject(TranslateService);
  private readonly locale = inject(LOCALE_ID);
  private readonly currencyPipe = new CurrencyPipe(this.locale);

  money(value: Money | null | undefined): string {
    return value ? (this.currencyPipe.transform(value.amount, value.currency) ?? '') : '';
  }

  percentage(value: number | null | undefined): string {
    return formatNumber(Number(value ?? 0), this.locale, '1.0-2');
  }

  /** "10% do valor do serviço" / "R$ 20,00 por serviço" — a regra sem jargão. */
  ruleLabel(commission: Commission): string {
    if (commission.ruleType === 'PERCENTAGE' && commission.rulePercentage != null) {
      return this.translate.instant('financial.commissions.rule.percentage', {
        percentage: this.percentage(commission.rulePercentage),
      });
    }
    if (commission.ruleFixedAmount) {
      return this.translate.instant('financial.commissions.rule.fixed', { fixed: this.money(commission.ruleFixedAmount) });
    }
    return this.translate.instant('financial.commissions.rule.none');
  }

  /** A conta feita à vista, numa frase: "João recebe 10% do valor do serviço: 10% de R$ 300,00 = R$ 30,00." */
  explain(commission: Commission): string {
    const name = commission.providerName ?? '';
    const amount = this.money(commission.computedAmount);
    const base = this.money(commission.baseAmount);
    if (commission.situation === 'TO_CALCULATE') {
      return this.translate.instant('financial.commissions.explain.TO_CALCULATE', { name });
    }
    if (commission.ruleType === 'PERCENTAGE' && commission.rulePercentage != null) {
      return this.translate.instant('financial.commissions.explain.PERCENTAGE', {
        name, percentage: this.percentage(commission.rulePercentage), base, amount,
      });
    }
    if (commission.ruleFixedAmount && commission.ruleFixedAmount.amount > 0) {
      const quantity = Math.round(commission.computedAmount.amount / commission.ruleFixedAmount.amount);
      return this.translate.instant(quantity > 1 ? 'financial.commissions.explain.FIXED_MANY' : 'financial.commissions.explain.FIXED', {
        name, fixed: this.money(commission.ruleFixedAmount), quantity, amount,
      });
    }
    return this.translate.instant('financial.commissions.explain.UNKNOWN', { base, amount });
  }

  methodLabel(method: PaymentMethod | null | undefined): string {
    return method ? this.translate.instant(`financial.payments.method${method}`) : '';
  }
}
