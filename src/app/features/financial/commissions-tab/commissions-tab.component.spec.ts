import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { LOCALE_ID, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ptBR from '../../../../../public/assets/i18n/pt-BR.json';
import { AuthService } from '../../../core/auth/auth.service';
import {
  Commission, CommissionOverview, CommissionRates, FinancialService,
} from '../../../core/services/financial.service';
import { TenantService } from '../../../core/services/tenant.service';
import { CommissionExplainerService } from './commission-explainer.service';
import { CommissionsTabComponent } from './commissions-tab.component';

registerLocaleData(localePt);

// jsdom não traz ResizeObserver, que o p-tablist do PrimeNG usa ao iniciar.
globalThis.ResizeObserver ??= class { observe(): void {} unobserve(): void {} disconnect(): void {} } as unknown as typeof ResizeObserver;

const brl = (amount: number) => ({ amount, currency: 'BRL' });

const anaCommission = (id: string, orderNumber: number, amount: number, base: number): Commission => ({
  id, orderId: `order-${orderNumber}`, orderNumber, customerName: 'Maria Oliveira',
  serviceSummary: 'Higienização de sofá', providerId: 'ana', providerName: 'Ana Souza',
  commissionRuleId: 'rule-1', ruleType: 'PERCENTAGE', rulePercentage: 10, ruleFixedAmount: null,
  baseAmount: brl(base), computedAmount: brl(amount), situation: 'TO_PAY', commissionPaymentId: null,
  paidAt: null, paymentMethod: null, needsReview: false, reviewReason: null, calculatedAt: '2026-09-17T12:00:00Z',
});

const overview: CommissionOverview = {
  toPayTotal: brl(73), toPayCount: 2, paidThisMonthTotal: brl(120), toCalculateCount: 1,
  providers: [
    { providerId: 'ana', providerName: 'Ana Souza', toPayTotal: brl(73), toPayCount: 2, toCalculateCount: 0, oldestCalculatedAt: '2026-09-15T12:00:00Z' },
    { providerId: 'bruno', providerName: 'Bruno Lima', toPayTotal: brl(0), toPayCount: 0, toCalculateCount: 1, oldestCalculatedAt: null },
  ],
};

const rates: CommissionRates = {
  suggestedPercentage: 10,
  providers: [
    { providerId: 'ana', providerName: 'Ana Souza', ruleId: 'rule-1', ruleType: 'PERCENTAGE', percentage: 10, fixedAmount: null },
    { providerId: 'bruno', providerName: 'Bruno Lima', ruleId: null, ruleType: null, percentage: null, fixedAmount: null },
  ],
};

function setup(role = 'OWNER') {
  const financialService = {
    getCommissionOverview: vi.fn(() => of(overview)),
    getCommissionRates: vi.fn(() => of(rates)),
    listCommissionPayments: vi.fn(() => of({ content: [], page: { totalElements: 0, totalPages: 0, number: 0, size: 10 } })),
    listPendingForPayment: vi.fn(() => of([anaCommission('c1', 101, 30, 300), anaCommission('c2', 102, 43, 430)])),
    listPaymentCommissions: vi.fn(() => of([])),
    registerCommissionPayment: vi.fn(() => of({ id: 'pay-1' })),
    reverseCommissionPayment: vi.fn(() => of({})),
    setCommissionRate: vi.fn(() => of({})),
  };

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [CommissionsTabComponent],
    providers: [
      providePrimeNG({}),
      provideRouter([]),
      provideTranslateService({ fallbackLang: 'pt-BR' }),
      { provide: LOCALE_ID, useValue: 'pt' },
      { provide: FinancialService, useValue: financialService },
      { provide: TenantService, useValue: { getMe: () => of({ countryCode: 'BR' }) } },
      { provide: AuthService, useValue: { userRole: signal(role) } },
      MessageService,
      ConfirmationService,
    ],
  });
  const translate = TestBed.inject(TranslateService);
  translate.setTranslation('pt-BR', ptBR);
  translate.use('pt-BR');

  const fixture = TestBed.createComponent(CommissionsTabComponent);
  fixture.detectChanges();
  return { fixture, financialService };
}

const text = (fixture: ComponentFixture<unknown>) => (fixture.nativeElement as HTMLElement).textContent ?? '';
const bodyText = () => document.body.textContent ?? '';
const buttonWith = (label: string): HTMLButtonElement | undefined =>
  [...document.body.querySelectorAll('button')].find(b => (b.textContent ?? '').includes(label));

describe('CommissionsTabComponent', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('opens with the one sentence the owner cares about: how much there is to pay', () => {
    const { fixture } = setup();

    expect(text(fixture)).toMatch(/Você tem\s+R\$\s*73,00\s+em comissões para pagar/);
    expect(text(fixture)).toContain('Pago neste mês');
  });

  it('shows one card per provider with the balance and a way to pay', () => {
    const { fixture } = setup();

    const content = text(fixture);
    expect(content).toContain('Ana Souza');
    expect(content).toContain('Ver e pagar');
    expect(content).toContain('Bruno Lima');
    expect(content).toContain('esperando a comissão ser definida');
  });

  it('asks the owner to confirm a suggested percentage instead of showing a configuration form', () => {
    const { fixture } = setup();

    expect(text(fixture)).toContain('Defina quanto cada prestador recebe');
    expect(text(fixture)).toContain('Falta definir: Bruno Lima');
    expect(text(fixture)).toContain('Usar 10% para todos');
  });

  it('hides the banner and every write action from a role that cannot manage commissions', () => {
    const { fixture } = setup('ADMIN');

    expect(text(fixture)).not.toContain('Defina quanto cada prestador recebe');
  });

  it('applies the suggested percentage to every provider without one, after a single confirmation', () => {
    const { fixture, financialService } = setup();
    const confirmation = TestBed.inject(ConfirmationService);
    const confirm = vi.spyOn(confirmation, 'confirm').mockImplementation(options => {
      options.accept?.();
      return confirmation;
    });

    const applyAll = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')]
      .find(b => (b.textContent ?? '').includes('Usar 10% para todos'));
    applyAll!.click();

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(financialService.setCommissionRate).toHaveBeenCalledTimes(1);
    expect(financialService.setCommissionRate).toHaveBeenCalledWith('bruno', 10);
  });

  it('pays a provider from the drawer: everything pre-selected, one confirmation, correct payload', async () => {
    const { fixture, financialService } = setup();

    const pay = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')]
      .find(b => (b.textContent ?? '').includes('Ver e pagar'));
    pay!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(financialService.listPendingForPayment).toHaveBeenCalledWith('ana');
    expect(bodyText()).toContain('Comissões de Ana Souza');
    expect(bodyText()).toMatch(/Confirmar pagamento de\s+R\$\s*73,00/);

    buttonWith('Confirmar pagamento')!.click();
    fixture.detectChanges();

    expect(financialService.registerCommissionPayment).toHaveBeenCalledTimes(1);
    expect(financialService.registerCommissionPayment).toHaveBeenCalledWith({
      providerId: 'ana', commissionIds: ['c1', 'c2'], paymentMethod: 'PIX', paymentReference: null, notes: null,
    });
  });

  it('explains why a commission has its value, without the owner doing any math', async () => {
    const { fixture } = setup();

    [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')]
      .find(b => (b.textContent ?? '').includes('Ver e pagar'))!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    buttonWith('Por que esse valor?')!.click();
    fixture.detectChanges();

    expect(bodyText()).toMatch(/Ana Souza recebe 10% do valor do serviço: 10% de R\$\s*300,00 = R\$\s*30,00/);
  });
});

describe('CommissionExplainerService', () => {
  function explainer() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideTranslateService({ fallbackLang: 'pt-BR' }), { provide: LOCALE_ID, useValue: 'pt' }],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('pt-BR', ptBR);
    translate.use('pt-BR');
    return TestBed.inject(CommissionExplainerService);
  }

  it('describes a fixed amount per service, including how many services it covered', () => {
    const c: Commission = {
      ...anaCommission('c', 1, 40, 500), ruleType: 'FIXED', rulePercentage: null, ruleFixedAmount: brl(20),
    };

    expect(explainer().explain(c)).toMatch(/Ana Souza recebe R\$\s*20,00 por serviço, em 2 serviços: R\$\s*40,00/);
  });

  it('tells the owner what to do when the provider has no rate yet', () => {
    const c: Commission = { ...anaCommission('c', 1, 0, 200), situation: 'TO_CALCULATE', commissionRuleId: null, ruleType: null, rulePercentage: null };

    expect(explainer().explain(c)).toContain('ainda não tem comissão definida');
    expect(explainer().explain(c)).toContain('Quanto cada um ganha');
  });
});
