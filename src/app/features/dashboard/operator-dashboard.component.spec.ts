import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { LOCALE_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { providePrimeNG } from 'primeng/config';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../../public/assets/i18n/en.json';
import ptBR from '../../../../public/assets/i18n/pt-BR.json';
import ptPT from '../../../../public/assets/i18n/pt-PT.json';
import { DashboardService, OperatorCommandCenter, OperatorLiveOrder } from '../../core/services/dashboard.service';
import { OperatorDashboardComponent } from './operator-dashboard.component';

registerLocaleData(localePt);

const iso = (hhmm: string) => `2026-09-20T${hhmm}:00`;

const order = (over: Partial<OperatorLiveOrder>): OperatorLiveOrder => ({
  orderId: 'o1', orderNumber: 1042, scheduledStartAt: iso('09:00'), scheduledEndAt: iso('10:00'),
  customerName: null, description: 'Higienização de sofá', technicianId: 'u1', technicianName: 'João',
  status: 'IN_PROGRESS', liveState: 'IN_SERVICE', minutes: 42, expectedArrivalAt: null, risk: null, ...over,
});

const late = order({
  orderId: 'o2', orderNumber: 1045, customerName: 'João Silva', technicianName: 'Ana', status: 'ASSIGNED',
  liveState: 'LATE', minutes: 17, scheduledStartAt: iso('10:30'),
});
const risk = order({
  orderId: 'o3', orderNumber: 1053, customerName: 'Pedro Santos', technicianName: 'Pedro', status: 'ASSIGNED',
  liveState: 'NOT_STARTED', minutes: null, risk: 'NOT_DEPARTED', scheduledStartAt: iso('14:00'),
});
const enRoute = order({
  orderId: 'o4', orderNumber: 1043, description: 'Lavagem de tapete', technicianName: 'Carlos', status: 'ASSIGNED',
  liveState: 'EN_ROUTE', minutes: null, expectedArrivalAt: iso('10:18'), scheduledStartAt: iso('09:30'),
});

const rate = (onTime: number, late: number) => ({
  onTime, late, measured: onTime + late, ratePct: onTime + late === 0 ? null : Math.round((onTime * 1000) / (onTime + late)) / 10,
});

const data = (over: Partial<OperatorCommandCenter> = {}): OperatorCommandCenter => ({
  generatedAt: iso('10:05'),
  date: '2026-09-20',
  kpis: {
    ordersToday: { total: 24, completed: 7 },
    inProgress: { orders: 8, technicians: 4 },
    atRisk: 1,
    punctuality: { ratePct: 94.2, onTime: 113, late: 7, total: 120, windowDays: 7 },
    lateOrders: { count: 1, maxDelayMinutes: 17 },
    laundry: { inProcess: 18 },
  },
  liveOrders: [order({}), enRoute, late, risk],
  attention: { lateTotal: 1, late: [late], atRiskTotal: 1, atRisk: [risk] },
  sla: { windowDays: 7, arrival: rate(113, 7), start: rate(110, 10), completion: rate(115, 5) },
  pipeline: {
    toSchedule: 3,
    stages: [
      { stage: 'SCHEDULED', count: 12, late: 0 }, { stage: 'EN_ROUTE', count: 3, late: 0 },
      { stage: 'IN_PROGRESS', count: 8, late: 1 }, { stage: 'COMPLETED', count: 17, late: 0 },
    ],
  },
  laundry: {
    stages: [
      { status: 'RECEIVED', count: 6, overdue: 1 }, { status: 'PROCESSING', count: 8, overdue: 1 },
      { status: 'READY', count: 4, overdue: 0 }, { status: 'RELEASED', count: 5, overdue: 0 },
    ],
    sla: { turnaroundDays: 3, onTime: 22, late: 2, measured: 24, ratePct: 91.7 },
    overdueItems: [{
      itemId: 'l1', code: 'TP-238', description: 'Tapete 3x2m', customerName: 'Maria Costa', orderId: 'o9',
      status: 'PROCESSING', daysInLaundry: 4, deadlineAt: iso('08:00'), overdueDays: 1,
    }],
    deliveries: {
      released: 5, ready: 4, unscheduled: 1,
      upcoming: [
        { itemId: 'l2', code: 'TP-240', description: 'Tapete 2x1,5m', customerName: 'Ana Lima', orderId: 'o8',
          waitingSince: '2026-09-19T10:00:00Z', scheduledFor: iso('15:00') },
        { itemId: 'l3', code: 'TP-241', description: 'Tapete 4x3m', customerName: 'Carlos Dias', orderId: 'o7',
          waitingSince: '2026-09-18T10:00:00Z', scheduledFor: null },
      ],
    },
  },
  capacity: [
    { date: '2026-09-20', orders: 24, plannedMinutes: 2400, capacityMinutes: 2800, occupancyPct: 86, availableTechnicians: 4 },
    { date: '2026-09-21', orders: 31, plannedMinutes: 3100, capacityMinutes: 2800, occupancyPct: 111, availableTechnicians: 4 },
    { date: '2026-09-22', orders: 0, plannedMinutes: 0, capacityMinutes: null, occupancyPct: null, availableTechnicians: 0 },
  ],
  team: [
    { technicianId: 'u1', name: 'João', state: 'IN_SERVICE', orders: 5, completed: 2, currentOrderId: 'o1', currentOrderNumber: 1042, nextAt: iso('11:30') },
    { technicianId: 'u4', name: 'Ana', state: 'AVAILABLE', orders: 5, completed: 1, currentOrderId: null, currentOrderNumber: null, nextAt: null },
  ],
  exceptions: [
    { type: 'LATE_ORDERS', severity: 'DANGER', count: 1 },
    { type: 'ORDERS_ON_HOLD', severity: 'WARNING', count: 2 },
    { type: 'ORDERS_TO_SCHEDULE', severity: 'INFO', count: 3 },
  ],
  ...over,
});

function setup(payload: OperatorCommandCenter, lang: 'pt-BR' | 'pt-PT' | 'en' = 'pt-BR') {
  const dashboardService = { getOperatorCommandCenter: vi.fn(() => of(payload)) };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [OperatorDashboardComponent],
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
  const fixture = TestBed.createComponent(OperatorDashboardComponent);
  fixture.detectChanges();
  return { fixture, dashboardService };
}

const text = (fixture: ComponentFixture<unknown>) => ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');

describe('OperatorDashboardComponent', () => {
  it('shows the six KPIs the operator reads first', () => {
    const { fixture } = setup(data());
    const content = text(fixture);

    for (const label of ['Ordens hoje', 'Em andamento', 'Em risco', 'Pontualidade', 'Atrasadas', 'Lavanderia']) {
      expect(content).toContain(label);
    }
    expect(content).toContain('94.2%');
    expect(content).toContain('113 de 120 no horário');
    expect(content).toContain('Maior atraso: 17 min');
  });

  it('turns every status into something operationally useful', () => {
    const { fixture } = setup(data());
    const content = text(fixture);

    expect(content).toContain('Em andamento · 42 min');
    expect(content).toContain('A caminho · chegada prevista 10:18');
    expect(content).toContain('Atrasado · 17 min');
  });

  it('lists late orders and at-risk orders with the reason, each linking to its order', () => {
    const { fixture } = setup(data());
    const content = text(fixture);

    expect(content).toContain('João Silva');
    expect(content).toContain('A equipe ainda não saiu para o atendimento');
    const links = [...(fixture.nativeElement as HTMLElement).querySelectorAll('a')].map(a => a.getAttribute('href') ?? '');
    expect(links.some(href => href.includes('/orders') && href.includes('open=o2'))).toBe(true);
    expect(links.some(href => href.includes('/routing') && href.includes('technician=u1'))).toBe(true);
  });

  it('flags a day above capacity and a day with no crew, without inventing a percentage', () => {
    const { fixture } = setup(data());
    const content = text(fixture);

    expect(content).toContain('111%');
    expect(content).toContain('Acima da capacidade planejada.');
    expect(content).toContain('sem equipe disponível');
  });

  it('shows laundry stages, deadline breaches and unscheduled deliveries', () => {
    const { fixture } = setup(data());
    const content = text(fixture);

    expect(content).toContain('Aguardando lavagem');
    expect(content).toContain('TP-238');
    expect(content).toContain('4 dias · prazo 3');
    expect(content).toContain('Sem entrega marcada');
    expect(content).toContain('91.7% dentro do prazo');
  });

  it('hides the laundry block and KPI when the plan has no laundry module', () => {
    const payload = data();
    delete payload.laundry;
    delete payload.kpis.laundry;
    const { fixture } = setup(payload);
    const content = text(fixture);

    expect(content).not.toContain('Aguardando lavagem');
    expect(content).not.toContain('Próximas entregas');
    expect(content).not.toContain('itens no processo');
  });

  it('says there is no data instead of showing a made-up punctuality', () => {
    const payload = data();
    payload.kpis.punctuality = { ratePct: null, onTime: 0, late: 0, total: 0, windowDays: 7 };
    payload.sla = { windowDays: 7, arrival: rate(0, 0), start: rate(0, 0), completion: rate(0, 0) };
    const { fixture } = setup(payload);

    expect(text(fixture)).toContain('Sem dados');
    expect(text(fixture)).not.toContain('0%');
  });

  it('handles null fields omitted by the backend (non_null) without printing placeholders', () => {
    const payload = data();
    // O backend serializa com default-property-inclusion=non_null: campo nulo chega ausente, não null.
    const omit = <T extends object>(obj: T, ...keys: string[]) => keys.forEach(k => delete (obj as Record<string, unknown>)[k]);
    omit(payload.laundry!.sla, 'ratePct');
    omit(payload.kpis.lateOrders, 'maxDelayMinutes');
    omit(payload.capacity[2], 'capacityMinutes', 'occupancyPct');
    omit(payload.liveOrders[0], 'minutes');
    payload.sla.arrival = { onTime: 0, late: 0, measured: 0 };
    payload.kpis.punctuality = { onTime: 0, late: 0, total: 0, windowDays: 7 };
    const { fixture } = setup(payload);
    const content = text(fixture);

    expect(content).not.toContain('{{');
    expect(content).not.toContain('undefined');
    expect(content).not.toContain('Maior atraso');
    expect(content).toContain('sem equipe disponível');
    expect(content).toContain('Sem dados');
  });

  it('reassures when nothing is late or at risk', () => {
    const payload = data({ attention: { lateTotal: 0, late: [], atRiskTotal: 0, atRisk: [] }, exceptions: [] });
    const { fixture } = setup(payload);

    expect(text(fixture)).toContain('Nenhuma ordem atrasada ou em risco.');
    expect(text(fixture)).toContain('Nada fora do fluxo normal.');
  });

  it('keeps translation keys in step across pt-BR, pt-PT and en', () => {
    const keys = (obj: unknown, prefix = ''): string[] =>
      Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
        typeof v === 'object' && v !== null ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]);
    const pick = (json: unknown) => keys((json as { dashboard: { operator: unknown } }).dashboard.operator).sort();

    expect(pick(ptPT)).toEqual(pick(ptBR));
    expect(pick(en)).toEqual(pick(ptBR));
  });

  it('renders in English too', () => {
    const { fixture } = setup(data(), 'en');
    const content = text(fixture);

    expect(content).toContain('Orders today');
    expect(content).toContain('Late · 17 min');
    expect(content).not.toContain('dashboard.operator');
  });
});
