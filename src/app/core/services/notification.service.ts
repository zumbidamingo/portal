import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, Subject, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Notification, NotificationCategory, NotificationCounters, NotificationPage, NotificationTab,
} from '../models/notification.model';
import { TokenService } from '../auth/token.service';

const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_DELAY_MS = 30000;
const FALLBACK_POLL_INTERVAL_MS = 30000;

const EMPTY_COUNTERS: NotificationCounters = { actionOpen: 0, unreadCritical: 0, unreadTotal: 0, badge: 0, byCategory: {} };

export interface NotificationQuery {
  tab?: NotificationTab | null;
  category?: NotificationCategory | null;
  page?: number;
  size?: number;
}

/**
 * Sino de notificações do utilizador (issues #330, #335): API paginada por aba/categoria, contadores
 * e tempo real por SSE (`notification`, `notification-resolved`, `counters`) com reconexão e
 * fallback de polling. O destino de cada notificação vem do backend (`link`); nada aqui mapeia tipo→rota.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private http = inject(HttpClient);
  private tokenService = inject(TokenService);
  private readonly API = `${environment.apiUrl}/notifications`;

  readonly counters = signal<NotificationCounters>(EMPTY_COUNTERS);
  /** O número do sino: ações abertas + críticas não lidas. */
  readonly badge = computed(() => this.counters().badge);

  /** Cada notificação empurrada pelo backend — quem mostra uma lista viva funde-a sem recarregar. */
  private readonly received$ = new Subject<Notification>();
  readonly notificationReceived$ = this.received$.asObservable();
  /** O id de uma notificação que se fechou sozinha (a condição acabou). */
  private readonly resolved$ = new Subject<string>();
  readonly notificationResolved$ = this.resolved$.asObservable();

  private eventSource: EventSource | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = RECONNECT_DELAY_MS;
  private fallbackPollTimer: ReturnType<typeof setInterval> | null = null;
  private streamActive = false;

  list(query: NotificationQuery = {}): Observable<NotificationPage> {
    let params = new HttpParams().set('page', query.page ?? 0).set('size', query.size ?? 20);
    if (query.tab) params = params.set('tab', query.tab);
    if (query.category) params = params.set('category', query.category);
    return this.http.get<NotificationPage>(this.API, { params });
  }

  markAsRead(id: string): Observable<void> {
    return this.http.patch<void>(`${this.API}/${id}/read`, {}).pipe(tap(() => this.loadCounters().subscribe()));
  }

  markAllAsRead(category?: NotificationCategory | null): Observable<void> {
    let params = new HttpParams();
    if (category) params = params.set('category', category);
    return this.http.patch<void>(`${this.API}/read-all`, {}, { params }).pipe(tap(() => this.loadCounters().subscribe()));
  }

  dismiss(id: string): Observable<void> {
    return this.http.patch<void>(`${this.API}/${id}/dismiss`, {}).pipe(tap(() => this.loadCounters().subscribe()));
  }

  loadCounters(): Observable<NotificationCounters> {
    return this.http.get<NotificationCounters>(`${this.API}/counters`).pipe(
      tap(counters => this.counters.set({ ...EMPTY_COUNTERS, ...counters })),
    );
  }

  connectStream(): void {
    if (this.eventSource) {
      return;
    }
    const token = this.tokenService.getAccessToken();
    if (!token) {
      return;
    }

    const es = new EventSource(`${this.API}/stream?token=${encodeURIComponent(token)}`);
    this.eventSource = es;

    es.addEventListener('counters', (event: MessageEvent) => {
      this.streamActive = true;
      this.reconnectDelay = RECONNECT_DELAY_MS;
      this.stopFallbackPolling();
      this.counters.set({ ...EMPTY_COUNTERS, ...(JSON.parse(event.data) as NotificationCounters) });
    });

    es.addEventListener('notification', (event: MessageEvent) => {
      this.received$.next(JSON.parse(event.data) as Notification);
    });

    es.addEventListener('notification-resolved', (event: MessageEvent) => {
      this.resolved$.next((JSON.parse(event.data) as { id: string }).id);
    });

    es.onerror = () => {
      this.streamActive = false;
      es.close();
      this.eventSource = null;
      this.startFallbackPolling();
      this.scheduleReconnect();
    };
  }

  disconnectStream(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopFallbackPolling();
    this.eventSource?.close();
    this.eventSource = null;
    this.streamActive = false;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
      this.connectStream();
    }, this.reconnectDelay);
  }

  private startFallbackPolling(): void {
    if (this.fallbackPollTimer) {
      return;
    }
    this.fallbackPollTimer = setInterval(() => {
      if (!this.streamActive) {
        this.loadCounters().subscribe({ error: () => undefined });
      }
    }, FALLBACK_POLL_INTERVAL_MS);
  }

  private stopFallbackPolling(): void {
    if (this.fallbackPollTimer) {
      clearInterval(this.fallbackPollTimer);
      this.fallbackPollTimer = null;
    }
  }
}
