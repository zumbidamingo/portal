import { LOCALE_ID, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../../public/assets/i18n/en.json';
import ptBR from '../../../../public/assets/i18n/pt-BR.json';
import { NotificationCategoryPreference } from '../../core/models/notification.model';
import { NotificationPreferencesService } from '../../core/services/notification-preferences.service';
import { TenantService } from '../../core/services/tenant.service';
import { NotificationPreferencesComponent } from './notification-preferences.component';

const rows = (): NotificationCategoryPreference[] => [
  { category: 'FINANCE', push: true, bell: true, hasCritical: true },
  { category: 'OPERATIONS', push: true, bell: false, hasCritical: false },
];

function setup(service: Record<string, unknown>, quiet: object | null = { notificationQuietHoursEnabled: true, notificationQuietStart: '20:00', notificationQuietEnd: '07:00' }) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [NotificationPreferencesComponent],
    providers: [
      providePrimeNG({}), provideRouter([]),
      provideTranslateService({ fallbackLang: 'pt-BR' }),
      { provide: LOCALE_ID, useValue: 'pt' },
      { provide: NotificationPreferencesService, useValue: service },
      { provide: TenantService, useValue: { current: signal(quiet ? { systemParameters: quiet } : null) } },
      MessageService,
    ],
  });
  const translate = TestBed.inject(TranslateService);
  translate.setTranslation('pt-BR', ptBR);
  translate.setTranslation('en', en);
  translate.use('pt-BR');
  const messages = TestBed.inject(MessageService);
  const fixture: ComponentFixture<NotificationPreferencesComponent> = TestBed.createComponent(NotificationPreferencesComponent);
  fixture.detectChanges();
  const text = () => (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ') ?? '';
  return { fixture, messages, text, component: fixture.componentInstance };
}

describe('NotificationPreferencesComponent', () => {
  it('shows only the categories the backend says this profile can receive, with the critical notice where it applies', () => {
    const { text } = setup({ getMine: vi.fn(() => of(rows())), update: vi.fn() });

    expect(text()).toContain('Financeiro');
    expect(text()).toContain('Operação');
    expect(text()).not.toContain('Vendas');
    expect(text()).toContain('Alertas críticos não podem ser desligados');
    // uma só categoria tem críticos
    expect(text().match(/Alertas críticos não podem ser desligados/g)).toHaveLength(1);
  });

  it('shows the company quiet hours read-only and points to where they are edited', () => {
    const { text } = setup({ getMine: vi.fn(() => of(rows())), update: vi.fn() });

    expect(text()).toContain('20:00');
    expect(text()).toContain('07:00');
    expect(text()).toContain('Parâmetros do Sistema');
  });

  it('saves a toggle at once, per category and channel, with a confirmation', () => {
    const update = vi.fn(() => of(undefined));
    const { component, messages } = setup({ getMine: vi.fn(() => of(rows())), update });
    const toast = vi.spyOn(messages, 'add');

    component.form.controls['FINANCE_PUSH'].setValue(false);

    expect(update).toHaveBeenCalledWith('FINANCE', 'PUSH', false);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
  });

  it('puts the toggle back and says so when saving fails — nothing pretends to have worked', () => {
    const update = vi.fn(() => throwError(() => new Error('boom')));
    const { component, messages } = setup({ getMine: vi.fn(() => of(rows())), update });
    const toast = vi.spyOn(messages, 'add');

    component.form.controls['OPERATIONS_BELL'].setValue(true);

    expect(update).toHaveBeenCalledTimes(1);
    expect(component.form.controls['OPERATIONS_BELL'].value).toBe(false);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
  });

  it('offers a retry when the preferences cannot be loaded', () => {
    const getMine = vi.fn().mockReturnValueOnce(throwError(() => new Error('down'))).mockReturnValue(of(rows()));
    const { fixture, text, component } = setup({ getMine, update: vi.fn() });
    expect(text()).toContain('Não foi possível carregar suas preferências');

    component.load();
    fixture.detectChanges();

    expect(text()).toContain('Financeiro');
  });
});
