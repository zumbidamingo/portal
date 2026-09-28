import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TokenService } from '../auth/token.service';

export type ImportJobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'COMPLETED_WITH_ERRORS' | 'FAILED' | 'CANCELLED';

export interface ImportJobResponse {
  id: string;
  status: ImportJobStatus;
  fileName: string;
  totalRows: number;
  processedRows: number;
  importedRows: number;
  errorRows: number;
  progress: number;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface ImportJobErrorRow {
  line: number;
  rawType: string | null;
  rawName: string | null;
  rawTaxId: string | null;
  errorCode: string;
  errorMessage: string;
  createdAt: string;
}

export interface ImportJobPage<T> {
  content: T[];
  page: { totalElements: number; totalPages: number; number: number; size: number };
}

const ACTIVE_JOB_STORAGE_KEY = 'suaoperacao.customerImport.activeJobId';
const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_DELAY_MS = 30000;
const FALLBACK_POLL_INTERVAL_MS = 4000;
const TERMINAL_STATUSES: ImportJobStatus[] = ['COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED'];

/**
 * Acompanhamento de importações de clientes por CSV (rework issue #35): o job corre em
 * background no servidor, este serviço só reflete o progresso. Mesma técnica de
 * `NotificationService` (SSE com fallback de polling e reconexão com backoff) — chave por
 * `importId` em vez de `userId`.
 *
 * `activeJob` é lido pela área persistente de progresso no layout (sobrevive a navegação porque
 * o serviço é `providedIn: 'root'`, singleton para toda a app) e o id ativo fica em
 * `localStorage` para sobreviver também a um refresh da página — sem isso, recarregar a app a
 * meio de uma importação faria a barra de progresso desaparecer mesmo com o job ainda a correr.
 */
@Injectable({ providedIn: 'root' })
export class CustomerImportService {
  private http = inject(HttpClient);
  private tokenService = inject(TokenService);
  private readonly API = `${environment.apiUrl}/customers/imports`;

  activeJob = signal<ImportJobResponse | null>(null);

  private eventSource: EventSource | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = RECONNECT_DELAY_MS;
  private fallbackPollTimer: ReturnType<typeof setInterval> | null = null;
  private streamActive = false;

  constructor() {
    const storedId = localStorage.getItem(ACTIVE_JOB_STORAGE_KEY);
    if (storedId) {
      this.resume(storedId);
    }
  }

  startImport(file: File): Observable<ImportJobResponse> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<ImportJobResponse>(this.API, form);
  }

  /** Chamado depois de `startImport` responder — passa a acompanhar este job. */
  track(job: ImportJobResponse): void {
    this.activeJob.set(job);
    this.persistActiveId(job);
    this.connectStream(job.id);
  }

  getJob(id: string): Observable<ImportJobResponse> {
    return this.http.get<ImportJobResponse>(`${this.API}/${id}`);
  }

  getErrors(id: string, page = 0, size = 50): Observable<ImportJobPage<ImportJobErrorRow>> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<ImportJobPage<ImportJobErrorRow>>(`${this.API}/${id}/errors`, { params });
  }

  getHistory(page = 0, size = 20): Observable<ImportJobPage<ImportJobResponse>> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<ImportJobPage<ImportJobResponse>>(this.API, { params });
  }

  /** O utilizador fechou a área de progresso — para de ouvir, mas não cancela o job no servidor. */
  dismiss(): void {
    this.disconnectStream();
    this.activeJob.set(null);
    localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
  }

  private resume(id: string): void {
    this.getJob(id).subscribe({
      next: job => {
        this.activeJob.set(job);
        if (TERMINAL_STATUSES.includes(job.status)) {
          localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
        } else {
          this.connectStream(job.id);
        }
      },
      error: () => localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY),
    });
  }

  private persistActiveId(job: ImportJobResponse): void {
    if (TERMINAL_STATUSES.includes(job.status)) {
      localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
    } else {
      localStorage.setItem(ACTIVE_JOB_STORAGE_KEY, job.id);
    }
  }

  private connectStream(importId: string): void {
    if (this.eventSource) {
      return;
    }
    const token = this.tokenService.getAccessToken();
    if (!token) {
      return;
    }

    const es = new EventSource(`${this.API}/${importId}/stream?token=${encodeURIComponent(token)}`);
    this.eventSource = es;

    es.addEventListener('import-progress', (event: MessageEvent) => {
      this.streamActive = true;
      this.reconnectDelay = RECONNECT_DELAY_MS;
      this.stopFallbackPolling();
      this.applyProgress(importId, JSON.parse(event.data));
    });

    es.onerror = () => {
      this.streamActive = false;
      es.close();
      this.eventSource = null;
      this.startFallbackPolling(importId);
      this.scheduleReconnect(importId);
    };
  }

  private applyProgress(importId: string, data: {
    status?: ImportJobStatus; total?: number; processed?: number; imported?: number;
    errors?: number; progress?: number;
  }): void {
    const current = this.activeJob();
    if (!current || current.id !== importId) {
      return;
    }
    const updated: ImportJobResponse = {
      ...current,
      status: data.status ?? current.status,
      totalRows: data.total ?? current.totalRows,
      processedRows: data.processed ?? current.processedRows,
      importedRows: data.imported ?? current.importedRows,
      errorRows: data.errors ?? current.errorRows,
      progress: data.progress ?? current.progress,
    };
    this.activeJob.set(updated);
    this.persistActiveId(updated);
    if (TERMINAL_STATUSES.includes(updated.status)) {
      this.disconnectStream();
    }
  }

  private disconnectStream(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopFallbackPolling();
    this.eventSource?.close();
    this.eventSource = null;
    this.streamActive = false;
  }

  private scheduleReconnect(importId: string): void {
    if (this.reconnectTimer) {
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
      this.connectStream(importId);
    }, this.reconnectDelay);
  }

  private startFallbackPolling(importId: string): void {
    if (this.fallbackPollTimer) {
      return;
    }
    this.fallbackPollTimer = setInterval(() => {
      if (this.streamActive) {
        return;
      }
      this.getJob(importId).subscribe({
        next: job => {
          this.activeJob.set(job);
          this.persistActiveId(job);
          if (TERMINAL_STATUSES.includes(job.status)) {
            this.disconnectStream();
          }
        },
      });
    }, FALLBACK_POLL_INTERVAL_MS);
  }

  private stopFallbackPolling(): void {
    if (this.fallbackPollTimer) {
      clearInterval(this.fallbackPollTimer);
      this.fallbackPollTimer = null;
    }
  }
}
