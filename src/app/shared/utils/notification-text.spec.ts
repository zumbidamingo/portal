import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it } from 'vitest';
import en from '../../../../public/assets/i18n/en.json';
import ptBR from '../../../../public/assets/i18n/pt-BR.json';
import { categoryIcon, dayBucket, formatNotificationParams, renderNotificationText, severityClasses } from './notification-text';

describe('notification text', () => {
  let translate: TranslateService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideTranslateService({ fallbackLang: 'pt-BR' })] });
    translate = TestBed.inject(TranslateService);
    translate.setTranslation('pt-BR', ptBR);
    translate.setTranslation('en', en);
    translate.use('pt-BR');
  });

  it('fills the order and customer into the text — no generic "an order was rescheduled"', () => {
    const text = renderNotificationText({
      type: 'ORDER_RESCHEDULED', title: null, body: null,
      params: { orderNumber: '1042', customerName: 'Maria Silva', newStartAt: '2026-09-27T17:00:00Z' },
    }, translate, 'pt-BR', 'America/Sao_Paulo');

    expect(text.title).toBe('Horário da ordem mudou');
    expect(text.body).toContain('#1042');
    expect(text.body).toContain('Maria Silva');
    expect(text.body).toContain('27/09/2026');
    expect(text.body).toContain('14:00');
  });

  it('re-renders in the active language instead of keeping the text the backend stored', () => {
    const params = { orderNumber: '7', customerName: 'Ana' };
    const pt = renderNotificationText({ type: 'ORDER_ASSIGNED', title: 'x', body: 'y', params }, translate, 'pt-BR');
    translate.use('en');
    const english = renderNotificationText({ type: 'ORDER_ASSIGNED', title: 'x', body: 'y', params }, translate, 'en');

    expect(pt.title).toBe('Nova ordem na sua agenda');
    expect(english.title).toBe('New order on your schedule');
    expect(english.body).toBe('Order #7 for Ana was assigned to you.');
  });

  it('formats money in the reader\'s locale using the currency that came with it', () => {
    const params = formatNotificationParams({ totalAmount: '1234.5', currency: 'BRL' }, translate, 'pt-BR');
    expect(params['totalAmount']).toMatch(/R\$\s?1\.234,50/);
  });

  it('shows a readable text for backend codes and keeps unknown codes as they are', () => {
    const params = formatNotificationParams({ reason: 'NO_EMAIL', dimension: 'ORDERS', source: 'MYSTERY' }, translate, 'pt-BR');
    expect(params['reason']).toBe('o cliente não tem email');
    expect(params['dimension']).toBe('ordens do mês');
    expect(params['source']).toBe('MYSTERY');
  });

  it('falls back to the text the backend stored when the portal does not know the type', () => {
    const text = renderNotificationText({ type: 'SOMETHING_NEW', title: 'Stored title', body: 'Stored body', params: null }, translate, 'pt-BR');
    expect(text).toEqual({ title: 'Stored title', body: 'Stored body' });
  });

  it('shows a dash instead of a raw placeholder when a parameter is missing', () => {
    const text = renderNotificationText({ type: 'ORDER_ASSIGNED', title: null, body: null, params: { orderNumber: '9' } }, translate, 'pt-BR');
    expect(text.body).toBe('A ordem #9 de — foi atribuída a você.');
  });

  it('gives each category its own icon and each severity its own colour token, with no fixed colours', () => {
    expect(new Set(['SALES', 'OPERATIONS', 'FINANCE', 'SYSTEM'].map(c => categoryIcon(c as never))).size).toBe(4);
    expect(severityClasses('CRITICAL')).toContain('app-danger');
    expect(severityClasses('HIGH')).toContain('app-warning');
    expect(severityClasses(null)).toContain('app-accent');
    for (const s of ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'] as const) {
      expect(severityClasses(s)).not.toMatch(/#|rgb|bg-(red|green|blue|yellow)/);
    }
  });

  it('groups by calendar day: today, yesterday, or the date itself', () => {
    const now = new Date(2026, 8, 25, 10, 0, 0);
    expect(dayBucket(new Date(2026, 8, 25, 1, 0).toISOString(), now)).toBe('today');
    expect(dayBucket(new Date(2026, 8, 24, 23, 0).toISOString(), now)).toBe('yesterday');
    expect(dayBucket(new Date(2026, 8, 20, 12, 0).toISOString(), now)).toBe('2026-09-20');
  });
});
