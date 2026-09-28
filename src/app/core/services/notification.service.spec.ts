import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  let service: NotificationService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(NotificationService);
    http = TestBed.inject(HttpTestingController);
  });

  it('lists by tab and category, paged, with no tenant or user anywhere in the request', () => {
    service.list({ tab: 'ACTION', category: 'FINANCE', page: 2, size: 20 }).subscribe();

    const req = http.expectOne(r => r.url.endsWith('/notifications'));
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('tab')).toBe('ACTION');
    expect(req.request.params.get('category')).toBe('FINANCE');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('size')).toBe('20');
    expect(req.request.params.has('tenantId')).toBe(false);
    expect(req.request.params.has('userId')).toBe(false);
    req.flush({ content: [], page: { totalElements: 0, totalPages: 0, number: 2, size: 20 } });
  });

  it('omits the tab and category filters when they are not chosen', () => {
    service.list().subscribe();

    const req = http.expectOne(r => r.url.endsWith('/notifications'));
    expect(req.request.params.has('tab')).toBe(false);
    expect(req.request.params.has('category')).toBe(false);
    req.flush({ content: [], page: { totalElements: 0, totalPages: 0, number: 0, size: 20 } });
  });

  it('keeps the counters the backend returned, so the bell shows actions plus unread critical', () => {
    service.loadCounters().subscribe();
    http.expectOne(r => r.url.endsWith('/notifications/counters'))
      .flush({ actionOpen: 3, unreadCritical: 1, unreadTotal: 7, badge: 4, byCategory: { FINANCE: 2 } });

    expect(service.counters().actionOpen).toBe(3);
    expect(service.badge()).toBe(4);
  });

  it('marking all as read is one PATCH, optionally for a single category, then refreshes the counters', () => {
    service.markAllAsRead('SALES').subscribe();

    const req = http.expectOne(r => r.url.endsWith('/notifications/read-all'));
    expect(req.request.method).toBe('PATCH');
    expect(req.request.params.get('category')).toBe('SALES');
    req.flush(null);
    http.expectOne(r => r.url.endsWith('/notifications/counters')).flush({ actionOpen: 0, unreadCritical: 0, unreadTotal: 0, badge: 0, byCategory: {} });
    expect(service.badge()).toBe(0);
  });

  it('dismissing an actionable notification is a PATCH on that id and refreshes the counters', () => {
    service.dismiss('n-1').subscribe();

    const req = http.expectOne(r => r.url.endsWith('/notifications/n-1/dismiss'));
    expect(req.request.method).toBe('PATCH');
    req.flush(null);
    http.expectOne(r => r.url.endsWith('/notifications/counters')).flush({ actionOpen: 2, unreadCritical: 0, unreadTotal: 2, badge: 2, byCategory: {} });
    expect(service.counters().actionOpen).toBe(2);
  });
});
