import { LOCALE_ID, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import { Subject, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../../public/assets/i18n/en.json';
import ptBR from '../../../../public/assets/i18n/pt-BR.json';
import { Notification } from '../../core/models/notification.model';
import { NotificationService } from '../../core/services/notification.service';
import { TenantService } from '../../core/services/tenant.service';
import { NotificationsComponent } from './notifications.component';

vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });

function notification(over: Partial<Notification> = {}): Notification {
  return {
    id: 'n1', userId: 'u1', type: 'ORDER_NOT_STARTED', category: 'OPERATIONS', severity: 'HIGH', requiresAction: true,
    status: 'OPEN', title: 'stored', body: 'stored', read: false, occurrenceCount: 1, subjectType: 'ORDER',
    subjectId: 'o1', params: { orderNumber: '1042', customerName: 'Maria Silva', technicianName: 'João', minutesLate: '15' },
    payload: null, link: { route: '/orders', queryParams: { open: 'o1' } },
    createdAt: new Date().toISOString(), lastOccurredAt: new Date().toISOString(), ...over,
  };
}

const page = (items: Notification[]) => ({ content: items, page: { totalElements: items.length, totalPages: 1, number: 0, size: 20 } });

function setup(items: Notification[] = [notification()]) {
  const received = new Subject<Notification>();
  const resolved = new Subject<string>();
  const service = {
    counters: signal({ actionOpen: items.length, unreadCritical: 0, unreadTotal: items.length, badge: items.length, byCategory: {} }),
    list: vi.fn(() => of(page(items))),
    loadCounters: vi.fn(() => of({})),
    markAsRead: vi.fn(() => of(undefined)),
    markAllAsRead: vi.fn(() => of(undefined)),
    dismiss: vi.fn(() => of(undefined)),
    notificationReceived$: received.asObservable(),
    notificationResolved$: resolved.asObservable(),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [NotificationsComponent],
    providers: [
      providePrimeNG({}), provideRouter([]),
      provideTranslateService({ fallbackLang: 'pt-BR' }),
      { provide: LOCALE_ID, useValue: 'pt' },
      { provide: NotificationService, useValue: service },
      { provide: TenantService, useValue: { current: signal({ timezone: 'America/Sao_Paulo' }) } },
      MessageService,
    ],
  });
  const translate = TestBed.inject(TranslateService);
  translate.setTranslation('pt-BR', ptBR);
  translate.setTranslation('en', en);
  translate.use('pt-BR');
  const router = TestBed.inject(Router);
  const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  const fixture: ComponentFixture<NotificationsComponent> = TestBed.createComponent(NotificationsComponent);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const text = () => el.textContent?.replace(/\s+/g, ' ') ?? '';
  return { fixture, service, received, resolved, navigate, el, text, messages: TestBed.inject(MessageService) };
}

describe('NotificationsComponent', () => {
  it('opens on the "needs action" tab and asks the backend only for that tab', () => {
    const { service, text } = setup();

    expect(service.list).toHaveBeenCalledWith(expect.objectContaining({ tab: 'ACTION', category: null, page: 0 }));
    expect(text()).toContain('Precisam de ação');
    expect(text()).toContain('Atividade');
  });

  it('shows the order and the customer in the text, with the priority colour and no hard-coded type map', () => {
    const { text, el } = setup();

    expect(text()).toContain('Ordem não iniciada');
    expect(text()).toContain('#1042');
    expect(text()).toContain('Maria Silva');
    expect(text()).toContain('João');
    expect(el.querySelector('i.pi-wrench')).not.toBeNull();
  });

  it('opening one marks it read and goes straight to the link the backend calculated', () => {
    const { el, service, navigate } = setup();

    (el.querySelector('app-notification-item button') as HTMLButtonElement).click();

    expect(service.markAsRead).toHaveBeenCalledWith('n1');
    expect(navigate).toHaveBeenCalledWith(['/orders'], { queryParams: { open: 'o1' } });
  });

  it('an unread row is marked read only once, and a read one is not touched again', () => {
    const { el, service } = setup([notification({ read: true })]);

    (el.querySelector('app-notification-item button') as HTMLButtonElement).click();

    expect(service.markAsRead).not.toHaveBeenCalled();
  });

  it('dismisses an actionable notification and takes it off the list', () => {
    const { el, service, text, fixture } = setup();
    const dismiss = Array.from(el.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Dispensar')!;

    dismiss.click();
    fixture.detectChanges();

    expect(service.dismiss).toHaveBeenCalledWith('n1');
    expect(text()).toContain('Nada precisa da sua ação');
  });

  it('switching to the activity tab reloads with that tab', () => {
    const { el, service, fixture } = setup();
    const tab = Array.from(el.querySelectorAll('[role="tab"]')).find(b => b.textContent?.includes('Atividade')) as HTMLButtonElement;

    tab.click();
    fixture.detectChanges();

    expect(service.list).toHaveBeenLastCalledWith(expect.objectContaining({ tab: 'ACTIVITY' }));
  });

  it('a notification pushed over SSE appears at the top and is announced; a resolved one leaves the action tab', () => {
    const { received, resolved, fixture, text, el } = setup([notification({ id: 'a' })]);

    received.next(notification({ id: 'b', type: 'ORDER_NEEDS_SCHEDULING', params: { orderNumber: '7', customerName: 'Ana' } }));
    fixture.detectChanges();
    expect(text()).toContain('Ordem aprovada precisa de agendamento');
    expect(el.querySelectorAll('app-notification-item').length).toBe(2);
    expect(el.querySelector('[aria-live="polite"]')?.textContent).toContain('Nova notificação que precisa de ação');

    resolved.next('a');
    fixture.detectChanges();
    expect(el.querySelectorAll('app-notification-item').length).toBe(1);
  });

  it('shows a retry when loading fails, instead of an empty list that looks fine', () => {
    const { service, fixture, text } = setup();
    service.list.mockReturnValue(throwError(() => new Error('down')) as never);

    fixture.componentInstance.reload();
    fixture.detectChanges();

    expect(text()).toContain('Não foi possível carregar as notificações');
    expect(text()).toContain('Tentar novamente');
  });

  it('marks everything as read for the chosen category only', () => {
    const { service, fixture } = setup();
    fixture.componentInstance.categoryControl.setValue('FINANCE');

    fixture.componentInstance.markAllRead();

    expect(service.markAllAsRead).toHaveBeenCalledWith('FINANCE');
  });
});
