import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { LOCALE_ID, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../../public/assets/i18n/en.json';
import ptBR from '../../../../public/assets/i18n/pt-BR.json';
import ptPT from '../../../../public/assets/i18n/pt-PT.json';
import { AuthService } from '../../core/auth/auth.service';
import { AiDecision, AiPolicy, AiUsage, IntelligenceService } from '../../core/services/intelligence.service';
import { IntelligenceComponent } from './intelligence.component';

registerLocaleData(localePt);

// O PrimeNG mede as abas com ResizeObserver, que o jsdom não traz.
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });

function decision(over: Partial<AiDecision> = {}): AiDecision {
  return {
    id: 'd1', agent: 'PRICING', actionType: 'CHANGE_SERVICE_PRICE', status: 'PENDING_APPROVAL', riskLevel: 'HIGH',
    recommendation: 'Subir o preço de BRL 200.00 para BRL 250.00', reason: 'Mediana de BRL 250.00 em 6 vendas',
    dataUsed: null, estimatedImpact: 'Impacto estimado de BRL 500.00 por mês', confidence: 0.7,
    actionPayload: null, autoExecuted: false, requestedBy: 'u1', expiresAt: '2026-09-22T12:00:00Z',
    decidedBy: null, decidedAt: null, executedAt: null, failureReason: null, createdAt: '2026-09-21T12:00:00Z',
    canDecide: true, ...over,
  };
}

const page = (items: AiDecision[]) => ({
  content: items, page: { totalElements: items.length, totalPages: 1, number: 0, size: 20 },
});

const usage = (over: Partial<AiUsage> = {}): AiUsage => ({
  windowStart: '2026-09-01T03:00:00Z', creditsLimit: 5000, creditsUsed: 1250, exhausted: false, modelAvailable: true,
  pendingApprovals: 1, byAgent: [{ agent: 'PRICING', calls: 4, inputTokens: 2000, outputTokens: 500, credits: 9 }], ...over,
});

const policies = (): AiPolicy[] => [
  { actionType: 'CREATE_FOLLOWUP', defaultRisk: 'LOW', effectiveRisk: 'LOW', effectiveAutoExecute: true },
  { actionType: 'CANCEL_ORDER', defaultRisk: 'HIGH', effectiveRisk: 'HIGH', effectiveAutoExecute: false },
];

interface Setup {
  fixture: ComponentFixture<IntelligenceComponent>;
  service: Record<string, ReturnType<typeof vi.fn>>;
  messages: MessageService;
  text: () => string;
  button: (label: string) => HTMLButtonElement | undefined;
}

function setup(role: string, queue: AiDecision[], usageData: AiUsage = usage(), lang: 'pt-BR' | 'pt-PT' | 'en' = 'pt-BR'): Setup {
  const service = {
    listDecisions: vi.fn(() => of(page(queue))),
    pendingCount: vi.fn(() => of(queue.length)),
    approve: vi.fn(() => of({ decision: decision({ status: 'EXECUTED', canDecide: false }), executed: true, message: 'ok' })),
    reject: vi.fn(() => of(decision({ status: 'REJECTED', canDecide: false }))),
    listPolicies: vi.fn(() => of(policies())),
    setPolicy: vi.fn((type: string) => of({ ...policies()[1], actionType: type, effectiveAutoExecute: true })),
    usage: vi.fn(() => of(usageData)),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [IntelligenceComponent],
    providers: [
      providePrimeNG({}),
      provideRouter([]),
      provideTranslateService({ fallbackLang: 'pt-BR' }),
      { provide: LOCALE_ID, useValue: 'pt' },
      { provide: IntelligenceService, useValue: service },
      { provide: AuthService, useValue: { userRole: signal(role) } },
      ConfirmationService,
      MessageService,
    ],
  });
  const translate = TestBed.inject(TranslateService);
  translate.setTranslation('pt-BR', ptBR);
  translate.setTranslation('pt-PT', ptPT);
  translate.setTranslation('en', en);
  translate.use(lang);
  // O diálogo de confirmação é o global do layout; aqui a confirmação é dada na hora.
  vi.spyOn(TestBed.inject(ConfirmationService), 'confirm').mockImplementation(c => { c.accept?.(); return TestBed.inject(ConfirmationService); });
  const messages = TestBed.inject(MessageService);
  const fixture = TestBed.createComponent(IntelligenceComponent);
  fixture.detectChanges();
  const text = () => (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ') ?? '';
  const button = (label: string) => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'))
    .find(b => b.textContent?.trim() === label);
  return { fixture, service: service as unknown as Setup['service'], messages, text, button };
}

describe('IntelligenceComponent', () => {
  it('shows a pending action with its recommendation, reason, estimated impact and confidence', () => {
    const { text } = setup('OWNER', [decision()]);

    expect(text()).toContain('Subir o preço de BRL 200.00 para BRL 250.00');
    expect(text()).toContain('Mediana de BRL 250.00 em 6 vendas');
    expect(text()).toContain('Impacto estimado: Impacto estimado de BRL 500.00 por mês');
    expect(text()).toContain('Confiança: 70%');
    expect(text()).toContain('Alterar preço de serviço');
    expect(text()).toContain('Alto');
  });

  it('offers approve and reject only when the backend says the viewer can decide', () => {
    const decidable = setup('OWNER', [decision()]);
    expect(decidable.button('Aprovar')).toBeDefined();
    expect(decidable.button('Rejeitar')).toBeDefined();

    const notDecidable = setup('OPERATOR', [decision({ canDecide: false })]);
    expect(notDecidable.button('Aprovar')).toBeUndefined();
    expect(notDecidable.text()).toContain('O seu perfil não pode decidir esta ação.');
  });

  it('approving calls the backend for that decision, then reloads the queue', () => {
    const { button, service, messages } = setup('OWNER', [decision({ id: 'abc' })]);
    const toast = vi.spyOn(messages, 'add');
    const before = service['listDecisions'].mock.calls.length;

    button('Aprovar')!.click();

    expect(service['approve']).toHaveBeenCalledWith('abc');
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
    expect(service['listDecisions'].mock.calls.length).toBeGreaterThan(before);
  });

  it('warns when the approval was recorded but the domain refused the action', () => {
    const { button, service, messages } = setup('OWNER', [decision()]);
    service['approve'].mockReturnValue(of({ decision: decision({ status: 'FAILED' }), executed: false, message: 'SERVICE_PRICE_CURRENCY_MISMATCH' }));
    const toast = vi.spyOn(messages, 'add');

    button('Aprovar')!.click();

    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ severity: 'warn', detail: 'SERVICE_PRICE_CURRENCY_MISMATCH' }));
  });

  it('reports an error when the decision cannot be completed (expired or already decided)', () => {
    const { button, service, messages } = setup('OWNER', [decision()]);
    service['approve'].mockReturnValue(throwError(() => new Error('422')));
    const toast = vi.spyOn(messages, 'add');

    button('Aprovar')!.click();

    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
  });

  it('rejecting calls the backend and never the approval', () => {
    const { button, service } = setup('OWNER', [decision({ id: 'xyz' })]);

    button('Rejeitar')!.click();

    expect(service['reject']).toHaveBeenCalledWith('xyz');
    expect(service['approve']).not.toHaveBeenCalled();
  });

  it('shows the empty state when nothing awaits approval', () => {
    const { text } = setup('OWNER', []);

    expect(text()).toContain('Nada aguardando aprovação');
  });

  it('tells the owner when the plan has no AI, with a way to the plans', () => {
    const { text } = setup('OWNER', [], usage({ creditsLimit: 0, creditsUsed: 0 }));

    expect(text()).toContain('não inclui inteligência artificial');
    expect(text()).toContain('Ver planos');
  });

  it('warns when the credits of the cycle are exhausted', () => {
    const { text } = setup('OWNER', [], usage({ exhausted: true, creditsUsed: 5000 }));

    expect(text()).toContain('Os créditos de IA deste ciclo acabaram');
  });

  it('shows the credits used against the ceiling and the usage per agent', () => {
    const { text } = setup('OWNER', [], usage());

    expect(text()).toContain('1.250');
    expect(text()).toContain('5.000');
    expect(text()).toContain('Preços');
  });

  it('roles that cannot manage never load policies or usage', () => {
    const { service } = setup('OPERATOR', [decision({ canDecide: false })]);

    expect(service['listPolicies']).not.toHaveBeenCalled();
    expect(service['usage']).not.toHaveBeenCalled();
  });

  it('the owner can save a policy, sending the risk and the explicit consent', () => {
    const { fixture, service } = setup('OWNER', []);
    const component = fixture.componentInstance;
    const row = component.policyForms.at(1);
    row.controls.autoExecute.setValue(true);
    row.controls.autoExecute.markAsDirty();

    component.savePolicy(row, 1);

    expect(service['setPolicy']).toHaveBeenCalledWith('CANCEL_ORDER', 'HIGH', true);
  });

  it('the risk choices of a policy never go below the default of the action', () => {
    const { fixture } = setup('OWNER', []);
    const component = fixture.componentInstance;

    expect(component.riskOptions('HIGH').map(o => o.value)).toEqual(['HIGH']);
    expect(component.riskOptions('LOW').map(o => o.value)).toEqual(['LOW', 'MEDIUM', 'HIGH']);
  });

  it('renders in English too', () => {
    const { text } = setup('OWNER', [decision()], usage(), 'en');

    expect(text()).toContain('Estimated impact');
    expect(text()).toContain('Change service price');
  });
});
