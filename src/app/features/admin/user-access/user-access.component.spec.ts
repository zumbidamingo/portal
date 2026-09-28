import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { UserAccessComponent } from './user-access.component';
import { UserAccessDetail, UserAccessRow, UserAccessService } from '../../../core/services/user-access.service';

// Cobertura de regressão: o template da linha expandida chamava-se `rowexpansion` em versões
// anteriores do PrimeNG. Em 21 o nome é `expandedrow` e o antigo é ignorado em silêncio — a linha
// alternava o estado interno e não desenhava nada, que é indistinguível de "o clique não funciona".

const row: UserAccessRow = {
  id: 'u1', name: 'Tasca do Zé', email: 'zé@tasca.pt', role: 'OPERATOR',
  active: true, emailVerified: true, authProvider: 'LOCAL', connectionStatus: 'ONLINE',
  lastLoginAt: '2026-08-19T20:00:00Z', lastSeenAt: '2026-08-19T20:30:00Z',
  lastIp: '10.0.0.7', lastDevice: 'Chrome · Windows',
  activeSessions: 1, loginCount: 12, failedCount: 0, createdAt: '2026-01-05T10:00:00Z',
};

const detail: UserAccessDetail = {
  userId: 'u1', name: 'Tasca do Zé', email: 'zé@tasca.pt', role: 'OPERATOR',
  sessions: [{
    id: 's1', device: 'Chrome · Windows', userAgent: 'Mozilla/5.0', ipAddress: '10.0.0.7',
    authProvider: 'LOCAL', startedAt: '2026-08-19T19:00:00Z', lastSeenAt: '2026-08-19T20:30:00Z',
    expiresAt: '2026-09-18T19:00:00Z', endedAt: null, endReason: null, online: true,
  }],
  events: [{
    id: 'e1', eventType: 'LOGIN_SUCCESS', authProvider: 'LOCAL', failureReason: null,
    ipAddress: '10.0.0.7', device: 'Chrome · Windows', createdAt: '2026-08-19T19:00:00Z',
  }],
};

function setup() {
  const userAccessService = {
    getOverview: vi.fn(() => of({
      onlineUsers: 1, activeSessions: 1, loginsToday: 3, failedLoginsToday: 0,
      loginsLast7Days: 9, neverLoggedIn: 2, presenceWindowMinutes: 5,
    })),
    listUsers: vi.fn(() => of({ content: [row], page: { totalElements: 1, totalPages: 1, number: 0, size: 25 } })),
    getDetail: vi.fn(() => of(detail)),
  };

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [UserAccessComponent],
    providers: [
      providePrimeNG({}),
      provideTranslateService({ fallbackLang: 'en' }),
      { provide: UserAccessService, useValue: userAccessService },
      { provide: MessageService, useValue: { add: vi.fn() } },
    ],
  });

  const fixture = TestBed.createComponent(UserAccessComponent);
  fixture.detectChanges();
  return { fixture, userAccessService };
}

describe('UserAccessComponent', () => {
  it('lists the access board rows', () => {
    const { fixture } = setup();

    expect(fixture.nativeElement.textContent).toContain('Tasca do Zé');
    expect(fixture.nativeElement.textContent).toContain('Chrome · Windows');
  });

  it('renders sessions and history when the row is expanded', () => {
    const { fixture, userAccessService } = setup();

    const toggler = fixture.nativeElement.querySelector('tbody button') as HTMLButtonElement;
    expect(toggler).toBeTruthy();
    toggler.click();
    fixture.detectChanges();

    expect(userAccessService.getDetail).toHaveBeenCalledWith('u1');
    // Sem traduções carregadas o pipe devolve a própria chave — chega para provar que a linha
    // expandida foi mesmo desenhada.
    expect(fixture.nativeElement.textContent).toContain('admin.access.sessionsTitle');
    expect(fixture.nativeElement.textContent).toContain('admin.access.historyTitle');
  });
});
