import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { LOCALE_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { providePrimeNG } from 'primeng/config';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ptBR from '../../../../public/assets/i18n/pt-BR.json';
import { Customer, CustomerService } from '../../core/services/customer.service';
import { Quotation, QuotationService } from '../../core/services/quotation.service';
import { RecurringContract, RecurringContractService } from '../../core/services/recurring-contract.service';
import { RecurringContractsComponent } from './recurring-contracts.component';
import { startOfDay, suggestedFirstRun } from './recurring-contract.utils';

registerLocaleData(localePt);

// jsdom não traz ResizeObserver, que componentes do PrimeNG usam ao iniciar.
globalThis.ResizeObserver ??= class { observe(): void {} unobserve(): void {} disconnect(): void {} } as unknown as typeof ResizeObserver;

const page = <T>(content: T[]) => ({ content, page: { totalElements: content.length, totalPages: 1, number: 0, size: 50 } });

const joao = { id: 'c-joao', name: 'João da Silva', taxId: '12345678909', city: 'São Paulo' } as Customer;
const maria = { id: 'c-maria', name: 'Maria Oliveira', taxId: null, city: null } as Customer;

const quotation = (id: string, number: number, service: string, total: number): Quotation => ({
  id, quotationNumber: number, customerId: joao.id, status: 'APPROVED', currency: 'BRL', total,
  createdAt: '2026-09-01T12:00:00Z', items: [{ description: service }],
} as unknown as Quotation);

const activeContractOn = (quotationId: string): RecurringContract => ({
  id: 'rc-1', customerId: joao.id, customerName: joao.name, quotationId, serviceNames: [], periodicity: 'MONTHLY',
  nextRunDate: '2026-10-01', lastRunDate: null, active: true, createdAt: '2026-09-01T12:00:00Z', updatedAt: '2026-09-01T12:00:00Z',
});

function setup(options: { quotationsByCustomer?: Record<string, Quotation[]>; contracts?: RecurringContract[] } = {}) {
  const quotationsByCustomer = options.quotationsByCustomer ?? {};
  const quotationService = {
    list: vi.fn((query: { customerId?: string }) => of(page(quotationsByCustomer[query.customerId ?? ''] ?? []))),
  };
  const customerService = { list: vi.fn(() => of(page([joao, maria]))) };
  const recurringContractService = {
    list: vi.fn(() => of(page(options.contracts ?? []))),
    create: vi.fn(() => of({} as RecurringContract)),
  };

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [RecurringContractsComponent],
    providers: [
      providePrimeNG({}),
      provideRouter([]),
      provideTranslateService({ fallbackLang: 'pt-BR' }),
      { provide: LOCALE_ID, useValue: 'pt' },
      { provide: QuotationService, useValue: quotationService },
      { provide: CustomerService, useValue: customerService },
      { provide: RecurringContractService, useValue: recurringContractService },
    ],
  });
  const translate = TestBed.inject(TranslateService);
  translate.setTranslation('pt-BR', ptBR);
  translate.use('pt-BR');

  const fixture: ComponentFixture<RecurringContractsComponent> = TestBed.createComponent(RecurringContractsComponent);
  fixture.detectChanges();
  const component = fixture.componentInstance;
  component.openCreate();
  fixture.detectChanges();

  const pick = (customer: Customer | null) => {
    component.createForm.controls.customer.setValue(customer);
    fixture.detectChanges();
  };
  return { fixture, component, quotationService, recurringContractService, pick };
}

const bodyText = () => document.body.textContent ?? '';
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

describe('RecurringContractsComponent — criação', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('só mostra o passo do cliente até um cliente ser escolhido', () => {
    const { component } = setup();

    expect(bodyText()).toContain('Cliente');
    expect(bodyText()).not.toContain('O que será repetido?');
    expect(component.canCreate()).toBe(false);
  });

  it('pede só os orçamentos aprovados do cliente escolhido', () => {
    const { pick, quotationService } = setup({ quotationsByCustomer: { [joao.id]: [quotation('q1', 1, 'Sofá', 250)] } });

    pick(joao);

    expect(quotationService.list).toHaveBeenCalledWith(expect.objectContaining({ status: 'APPROVED', customerId: joao.id }));
  });

  it('explica o motivo e oferece o próximo passo quando o cliente não tem orçamento aprovado', () => {
    const { pick, component } = setup();

    pick(maria);

    expect(bodyText()).toContain('Maria Oliveira ainda não tem orçamento aprovado');
    expect(bodyText()).toContain('Ir para orçamentos');
    expect(component.canCreate()).toBe(false);
  });

  it('seleciona sozinho o único orçamento aprovado e já mostra o resumo', () => {
    const { pick, component } = setup({ quotationsByCustomer: { [joao.id]: [quotation('q1', 12, 'Higienização de sofá', 250)] } });

    pick(joao);

    expect(component.selectedQuotation()?.id).toBe('q1');
    expect(component.autoSelected()).toBe(true);
    expect(component.canCreate()).toBe(true);
    expect(bodyText()).toContain('único orçamento aprovado');
    expect(bodyText()).toContain('Higienização de sofá');
    expect(bodyText()).toMatch(/R\$\s*250,00/);
    expect(bodyText()).toContain('Primeira execução');
  });

  it('não escolhe por conta própria quando há vários orçamentos', () => {
    const { pick, component } = setup({
      quotationsByCustomer: { [joao.id]: [quotation('q1', 1, 'Sofá', 250), quotation('q2', 2, 'Tapete', 90)] },
    });

    pick(joao);

    expect(component.selectedQuotation()).toBeNull();
    expect(component.canCreate()).toBe(false);
    component.selectQuotation(component.quotationChoices()[1]);
    expect(component.selectedQuotation()?.id).toBe('q2');
    expect(component.canCreate()).toBe(true);
  });

  it('descarta o orçamento escolhido ao trocar de cliente', () => {
    const { pick, component } = setup({
      quotationsByCustomer: {
        [joao.id]: [quotation('q1', 1, 'Sofá', 250), quotation('q2', 2, 'Tapete', 90)],
        [maria.id]: [],
      },
    });
    pick(joao);
    component.selectQuotation(component.quotationChoices()[0]);
    expect(component.selectedQuotation()).not.toBeNull();

    pick(maria);

    expect(component.selectedQuotation()).toBeNull();
    expect(component.quotationChoices()).toEqual([]);
    expect(component.canCreate()).toBe(false);
  });

  it('limpar o cliente esconde de novo os passos seguintes', () => {
    const { pick, component } = setup({ quotationsByCustomer: { [joao.id]: [quotation('q1', 1, 'Sofá', 250)] } });
    pick(joao);

    pick(null);

    expect(component.selectedCustomer()).toBeNull();
    expect(component.canCreate()).toBe(false);
    expect(bodyText()).not.toContain('O que será repetido?');
  });

  it('não oferece orçamento que já sustenta um contrato ativo', () => {
    const { pick, component } = setup({
      quotationsByCustomer: { [joao.id]: [quotation('q1', 1, 'Sofá', 250)] },
      contracts: [activeContractOn('q1')],
    });

    pick(joao);

    expect(component.quotationChoices()[0].inUse).toBe(true);
    expect(component.selectedQuotation()).toBeNull();
    expect(component.allQuotationsInUse()).toBe(true);
    expect(bodyText()).toContain('já têm contrato recorrente');
  });

  it('ignora orçamento sem serviços — não há o que repetir', () => {
    const empty = { ...quotation('q0', 3, 'x', 10), items: [] } as unknown as Quotation;
    const { pick, component } = setup({ quotationsByCustomer: { [joao.id]: [empty] } });

    pick(joao);

    expect(component.quotationChoices()).toEqual([]);
  });

  it('sugere a primeira execução um período à frente e a acompanha ao mudar a periodicidade', () => {
    const { pick, component } = setup({ quotationsByCustomer: { [joao.id]: [quotation('q1', 1, 'Sofá', 250)] } });
    pick(joao);
    const today = startOfDay(new Date());

    expect(component.firstRunDate()).toEqual(suggestedFirstRun(today, 'MONTHLY'));
    component.selectPeriodicity('WEEKLY');
    expect(component.firstRunDate()).toEqual(addDays(today, 7));
    expect(component.thenRepeatsDate()).toEqual(addDays(today, 14));

    component.selectPeriodicity('BIWEEKLY');
    expect(component.firstRunDate()).toEqual(addDays(today, 14));
  });

  it('deixa de mexer na data depois que o usuário a escolhe', () => {
    const { pick, component } = setup({ quotationsByCustomer: { [joao.id]: [quotation('q1', 1, 'Sofá', 250)] } });
    pick(joao);
    const chosen = addDays(startOfDay(new Date()), 3);
    component.createForm.controls.firstRunDate.setValue(chosen);
    component.firstRunTouched = true;

    component.selectPeriodicity('WEEKLY');

    expect(component.firstRunDate()).toEqual(chosen);
  });

  it('bloqueia a criação com data no passado', () => {
    const { pick, component } = setup({ quotationsByCustomer: { [joao.id]: [quotation('q1', 1, 'Sofá', 250)] } });
    pick(joao);

    component.createForm.controls.firstRunDate.setValue(addDays(startOfDay(new Date()), -1));

    expect(component.firstRunInPast()).toBe(true);
    expect(component.canCreate()).toBe(false);
  });

  it('cria o contrato com orçamento, periodicidade e data escolhidos — sem cliente no payload', () => {
    const { pick, component, recurringContractService } = setup({
      quotationsByCustomer: { [joao.id]: [quotation('q1', 1, 'Sofá', 250)] },
    });
    pick(joao);
    component.selectPeriodicity('QUARTERLY');
    const first = component.firstRunDate() as Date;

    component.createContract();

    const y = first.getFullYear(), m = String(first.getMonth() + 1).padStart(2, '0'), d = String(first.getDate()).padStart(2, '0');
    expect(recurringContractService.create).toHaveBeenCalledWith({
      quotationId: 'q1', periodicity: 'QUARTERLY', firstRunDate: `${y}-${m}-${d}`,
    });
    expect(component.createDialogVisible()).toBe(false);
  });

  it('não chama o backend enquanto o formulário está incompleto', () => {
    const { component, recurringContractService } = setup();

    component.createContract();

    expect(recurringContractService.create).not.toHaveBeenCalled();
  });

  it('traduz o erro de negócio do backend em vez de mostrar o código', () => {
    const { pick, component, recurringContractService } = setup({
      quotationsByCustomer: { [joao.id]: [quotation('q1', 1, 'Sofá', 250)] },
    });
    recurringContractService.create.mockReturnValueOnce(throwError(() => ({
      error: { errorCode: 'RECURRING_CONTRACT_QUOTATION_ALREADY_RECURRING', detail: 'raw' },
    })));
    pick(joao);
    const messages: string[] = [];
    (component as unknown as { messageService: { add: (m: { summary: string }) => void } }).messageService.add =
      m => messages.push(m.summary);

    component.createContract();

    expect(messages).toEqual(['Este orçamento já tem um contrato recorrente ativo.']);
    expect(component.saving()).toBe(false);
    expect(component.createDialogVisible()).toBe(true);
  });
});
