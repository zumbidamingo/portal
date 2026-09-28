import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { LOCALE_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { providePrimeNG } from 'primeng/config';
import { Observable, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../../public/assets/i18n/en.json';
import ptBR from '../../../../public/assets/i18n/pt-BR.json';
import ptPT from '../../../../public/assets/i18n/pt-PT.json';
import { DashboardService, FinanceCommandCenter, KpiMoney } from '../../core/services/dashboard.service';
import { FinanceDashboardComponent } from './finance-dashboard.component';

registerLocaleData(localePt);

const brl = (amount: number): KpiMoney => ({ amount, currency: 'BRL' });

function data(over: Partial<FinanceCommandCenter> = {}): FinanceCommandCenter {
  return {
    period: { type: 'THIS_MONTH', from: '2026-09-01', to: '2026-09-20', previousFrom: '2026-08-01', previousTo: '2026-08-20' },
    kpis: {
      invoiced: { current: brl(52480), previous: brl(46690), changePct: 12.4 },
      received: { current: brl(41250), previous: brl(35800), changePct: 15.2 },
      receivable: { amount: brl(11230), count: 12 },
      overdue: { amount: brl(2840), count: 7 },
      toInvoice: { amount: brl(6750), count: 8 },
      commissionsToPay: { amount: brl(4120), count: 21 },
    },
    attention: [
      { type: 'OVERDUE_INVOICES', severity: 'DANGER', count: 7, amount: brl(2840) },
      { type: 'FINISHED_TO_INVOICE', severity: 'WARNING', count: 8, amount: brl(6750) },
    ],
    receivables: {
      total: brl(11230), invoiceCount: 12, notDue: brl(8390), overdue: brl(2840), today: brl(1250),
      next7Days: brl(3420), days8To30: brl(3720), over30Days: brl(0), noDueDate: brl(0),
    },
    aging: [
      { range: 'DAYS_1_7', amount: brl(1120), count: 3 },
      { range: 'DAYS_8_30', amount: brl(980), count: 2 },
      { range: 'DAYS_31_60', amount: brl(520), count: 1 },
      { range: 'OVER_60', amount: brl(220), count: 1 },
    ],
    overdueInvoices: [
      { invoiceId: 'i1', invoiceNumber: 1042, customerId: 'c1', customerName: 'João Silva', outstanding: brl(450), dueDate: '2026-09-10T12:00:00Z', daysOverdue: 10 },
    ],
    toInvoice: {
      count: 8, amount: brl(6750),
      orders: [{ orderId: 'o1', orderNumber: 1048, customerId: 'c2', customerName: 'Ana Costa', description: 'Tapete', amount: brl(780) }],
    },
    series: [
      { date: '2026-09-01', invoiced: brl(1000), received: brl(400) },
      { date: '2026-09-02', invoiced: brl(0), received: brl(900) },
    ],
    seriesGranularity: 'DAY',
    upcoming: [
      { date: '2026-09-20', amount: brl(1250), invoiceCount: 3 },
      { date: '2026-09-21', amount: brl(780), invoiceCount: 1 },
      { date: '2026-09-22', amount: brl(0), invoiceCount: 0 },
    ],
    commissions: {
      toPay: brl(4120), toPayCount: 21, toCalculateCount: 2, needsReviewCount: 1, paidInPeriod: brl(8430),
      byProvider: [{ providerId: 'p1', providerName: 'Carlos', amount: brl(950), orderCount: 27 }],
    },
    paymentMethods: [
      { method: 'PIX', amount: brl(18400), sharePct: 45 },
      { method: 'CASH', amount: brl(4200), sharePct: 10 },
    ],
    ...over,
  };
}

function setup(payload: FinanceCommandCenter, lang: 'pt-BR' | 'pt-PT' | 'en' = 'pt-BR', source = () => of(payload) as Observable<FinanceCommandCenter>) {
  const dashboardService = { getFinanceCommandCenter: vi.fn(source) };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [FinanceDashboardComponent],
    providers: [
      providePrimeNG({}),
      provideRouter([]),
      provideTranslateService({ fallbackLang: 'pt-BR' }),
      { provide: LOCALE_ID, useValue: 'pt' },
      { provide: DashboardService, useValue: dashboardService },
    ],
  });
  const translate = TestBed.inject(TranslateService);
  translate.setTranslation('pt-BR', ptBR);
  translate.setTranslation('pt-PT', ptPT);
  translate.setTranslation('en', en);
  translate.use(lang);
  const fixture = TestBed.createComponent(FinanceDashboardComponent);
  fixture.detectChanges();
  return { fixture, dashboardService };
}

const text = (fixture: ComponentFixture<unknown>) => ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');

describe('FinanceDashboardComponent', () => {
  it('shows the six KPIs the finance role reads first', () => {
    const { fixture } = setup(data());
    const content = text(fixture);

    for (const label of ['Faturamento', 'Recebido', 'A receber', 'Em atraso', 'A faturar', 'Comissões a pagar']) {
      expect(content).toContain(label);
    }
    expect(content).toContain('12 faturas em aberto');
    expect(content).toContain('7 faturas vencidas');
    expect(content).toContain('8 ordens finalizadas sem fatura');
  });

  it('asks the backend for the selected period', () => {
    const { fixture, dashboardService } = setup(data());
    expect(dashboardService.getFinanceCommandCenter).toHaveBeenCalledWith('THIS_MONTH', undefined, undefined);

    const buttons = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')];
    buttons.find(b => b.textContent?.trim() === 'Hoje')?.click();
    expect(dashboardService.getFinanceCommandCenter).toHaveBeenLastCalledWith('TODAY', undefined, undefined);
  });

  it('lists attention items, overdue invoices and pending orders, each linking to real screens', () => {
    const { fixture } = setup(data());
    const content = text(fixture);

    expect(content).toContain('faturas vencidas');
    expect(content).toContain('ordens finalizadas aguardando faturamento');
    expect(content).toContain('João Silva');
    expect(content).toContain('Fatura #1042 · 10 dias em atraso');
    expect(content).toContain('Ana Costa');
    const links = [...(fixture.nativeElement as HTMLElement).querySelectorAll('a')].map(a => a.getAttribute('href') ?? '');
    expect(links).toContain('/financial/invoices');
    expect(links).toContain('/financial/commissions');
    expect(links.some(href => href.includes('/orders') && href.includes('open=o1'))).toBe(true);
  });

  it('breaks receivables by due date and hides the no-due-date line when empty', () => {
    const { fixture } = setup(data());
    const content = text(fixture);

    expect(content).toContain('A vencer');
    expect(content).toContain('Vence hoje');
    expect(content).toContain('Próximos 7 dias');
    expect(content).not.toContain('Sem vencimento');
  });

  it('shows the no-due-date balance when there is one', () => {
    const payload = data();
    payload.receivables.noDueDate = brl(300);
    const { fixture } = setup(payload);

    expect(text(fixture)).toContain('Sem vencimento');
  });

  it('shows commissions, upcoming receipts and receipts by method', () => {
    const { fixture } = setup(data());
    const content = text(fixture);

    expect(content).toContain('Carlos');
    expect(content).toContain('27 ordens');
    expect(content).toContain('Sem percentual definido');
    expect(content).toContain('Hoje');
    expect(content).toContain('Amanhã');
    expect(content).toContain('PIX');
    expect(content).toContain('45%');
  });

  it('celebrates an empty desk without inventing numbers', () => {
    const { fixture } = setup(data({
      attention: [], overdueInvoices: [], paymentMethods: [], series: [],
      toInvoice: { count: 0, amount: brl(0), orders: [] },
      commissions: { toPay: brl(0), toPayCount: 0, toCalculateCount: 0, needsReviewCount: 0, paidInPeriod: brl(0), byProvider: [] },
    }));
    const content = text(fixture);

    expect(content).toContain('Nenhuma pendência financeira.');
    expect(content).toContain('Nenhuma fatura vencida.');
    expect(content).toContain('Nenhum recebimento neste período.');
    expect(content).toContain('Todas as ordens finalizadas já foram faturadas.');
  });

  it('renders in English and European Portuguese with the same keys', () => {
    expect(text(setup(data(), 'en').fixture)).toContain('Commissions to pay');
    expect(text(setup(data(), 'pt-PT').fixture)).toContain('Faturação');
  });

  it('shows a retry banner when the request fails', () => {
    const { fixture } = setup(data(), 'pt-BR', () => throwError(() => new Error('boom')));

    expect(text(fixture)).toContain('Não foi possível carregar o painel');
    expect(text(fixture)).toContain('Tentar de novo');
  });
});
