import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TooltipModule } from 'primeng/tooltip';
import { Panel } from 'primeng/panel';
import { MessageService } from 'primeng/api';
import { TagBadgeComponent } from '../../../shared/components/tag-badge/tag-badge.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LocalizedDatePipe } from '../../../shared/pipes/localized-date.pipe';
import { RoleLabelPipe } from '../../../shared/pipes/role-label.pipe';
import { Observable, Subject, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, switchMap, tap } from 'rxjs/operators';
import {
  AccessOverview, AccessPage, ConnectionStatus, UserAccessDetail, UserAccessRow, UserAccessService,
} from '../../../core/services/user-access.service';
import { TableStandardDirective } from '../../../shared/directives/table-standard.directive';

const AUTO_REFRESH_MS = 30_000;
const PAGE_SIZE = 25;

@Component({
  selector: 'app-user-access',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TranslatePipe, TableModule, ButtonModule, InputTextModule,
    SelectModule, TooltipModule, TagBadgeComponent, EmptyStateComponent, LocalizedDatePipe, RoleLabelPipe, Panel,
    TableStandardDirective],
  template: `
    <div class="pt-3 space-y-4">
      <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div class="rounded-md border border-app-border p-4 text-center">
          <p class="text-2xl font-medium text-app-success">{{ overview()?.onlineUsers ?? 0 }}</p>
          <p class="text-xs text-app-text-secondary mt-1">{{ 'admin.access.kpiOnline' | translate }}</p>
        </div>
        <div class="rounded-md border border-app-border p-4 text-center">
          <p class="text-2xl font-medium text-app-text">{{ overview()?.activeSessions ?? 0 }}</p>
          <p class="text-xs text-app-text-secondary mt-1">{{ 'admin.access.kpiSessions' | translate }}</p>
        </div>
        <div class="rounded-md border border-app-border p-4 text-center">
          <p class="text-2xl font-medium text-app-text">{{ overview()?.loginsToday ?? 0 }}</p>
          <p class="text-xs text-app-text-secondary mt-1">{{ 'admin.access.kpiLoginsToday' | translate }}</p>
        </div>
        <div class="rounded-md border border-app-border p-4 text-center">
          <p class="text-2xl font-medium" [class]="(overview()?.failedLoginsToday ?? 0) > 0 ? 'text-app-warning' : 'text-app-text-tertiary'">
            {{ overview()?.failedLoginsToday ?? 0 }}
          </p>
          <p class="text-xs text-app-text-secondary mt-1">{{ 'admin.access.kpiFailedToday' | translate }}</p>
        </div>
        <div class="rounded-md border border-app-border p-4 text-center">
          <p class="text-2xl font-medium text-app-text-secondary">{{ overview()?.neverLoggedIn ?? 0 }}</p>
          <p class="text-xs text-app-text-secondary mt-1">{{ 'admin.access.kpiNeverLoggedIn' | translate }}</p>
        </div>
      </div>

      @if (accessEmpty()) {
        <app-empty-state icon="pi pi-users" [message]="'admin.access.empty' | translate"></app-empty-state>
      } @else {
      <p-panel>
      <div class="space-y-4">
        <div class="flex flex-wrap items-end gap-3">
          <div class="flex-1 min-w-56">
            <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5" for="accessSearch">{{ 'common.search' | translate }}</label>
            <input pInputText id="accessSearch" fluid [(ngModel)]="search"
                   [placeholder]="'admin.access.searchPlaceholder' | translate"
                   autocomplete="off"
                   (ngModelChange)="applyFilters()" />
          </div>
          <div class="w-44">
            <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'admin.role' | translate }}</label>
            <p-select [options]="roleOptions" [(ngModel)]="role" optionLabel="label" optionValue="value"
                      appendTo="body" fluid [showClear]="true"
                      [placeholder]="'admin.access.allRoles' | translate" (onChange)="applyFilters()"></p-select>
          </div>
          <div class="w-44">
            <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'admin.access.connection' | translate }}</label>
            <p-select [options]="statusOptions" [(ngModel)]="status" optionLabel="label" optionValue="value"
                      appendTo="body" fluid [showClear]="true"
                      [placeholder]="'admin.access.allStatuses' | translate" (onChange)="applyFilters()"></p-select>
          </div>
          @if (hasActiveFilters()) {
            <p-button [label]="'common.clearFilters' | translate" icon="pi pi-filter-slash" [text]="true" size="small"
                      (onClick)="clearFilters()"></p-button>
          }
        </div>

        <!-- A janela de presença vem do servidor: quem lê a coluna "ligado" tem de saber o que ela mede. -->
        <p class="text-xs text-app-text-tertiary">
          {{ 'admin.access.presenceHint' | translate: { minutes: overview()?.presenceWindowMinutes ?? 5 } }}
        </p>

        <p-table appTableStandard [value]="rows()" dataKey="id" styleClass="p-datatable-sm"
                 [lazy]="true" [rows]="pageSize" [totalRecords]="total()"
                 [loading]="loading()" [showLoader]="false" [first]="first()"
                 [expandedRowKeys]="expandedRows" (onLazyLoad)="onLazyLoad($event)" (onRowExpand)="onRowExpand($event)">
          <ng-template pTemplate="header">
            <tr>
              <th style="width: 3rem"></th>
              <th>{{ 'admin.access.user' | translate }}</th>
              <th>{{ 'admin.role' | translate }}</th>
              <th>{{ 'admin.access.connection' | translate }}</th>
              <th>{{ 'admin.access.lastLogin' | translate }}</th>
              <th>{{ 'admin.access.lastSeen' | translate }}</th>
              <th>{{ 'admin.access.origin' | translate }}</th>
              <th class="text-right">{{ 'admin.access.sessions' | translate }}</th>
              <th class="text-right">{{ 'admin.access.logins' | translate }}</th>
            </tr>
          </ng-template>

          <ng-template pTemplate="body" let-row let-expanded="expanded">
            <tr>
              <td>
                <p-button [icon]="expanded ? 'pi pi-chevron-down' : 'pi pi-chevron-right'"
                          [text]="true" size="small" severity="secondary"
                          [pRowToggler]="row" [pTooltip]="'admin.access.viewDetail' | translate"></p-button>
              </td>
              <td>
                <div class="font-medium text-app-text">{{ row.name }}</div>
                <div class="text-xs text-app-text-secondary">{{ row.email }}</div>
              </td>
              <td>
                <app-tag-badge [value]="row.role | roleLabel" severity="info"></app-tag-badge>
                @if (!row.active) {
                  <div class="text-xs text-app-danger mt-1">{{ 'common.inactive' | translate }}</div>
                }
              </td>
              <td>
                <app-tag-badge [value]="connectionLabel(row.connectionStatus) | translate"
                               [severity]="connectionSeverity(row.connectionStatus)"></app-tag-badge>
              </td>
              <td class="whitespace-nowrap">
                {{ row.lastLoginAt ? (row.lastLoginAt | localizedDate: 'datetime') : '—' }}
              </td>
              <td class="whitespace-nowrap">
                {{ row.lastSeenAt ? (row.lastSeenAt | localizedDate: 'datetime') : '—' }}
              </td>
              <td>
                <div class="text-sm text-app-text">{{ row.lastDevice ?? '—' }}</div>
                <div class="text-xs text-app-text-secondary">{{ row.lastIp ?? '—' }} · {{ providerLabel(row.authProvider) | translate }}</div>
              </td>
              <td class="text-right">{{ row.activeSessions }}</td>
              <td class="text-right">
                <span>{{ row.loginCount }}</span>
                @if (row.failedCount > 0) {
                  <span class="text-app-warning text-xs ml-1"
                        [pTooltip]="'admin.access.failedTooltip' | translate">/ {{ row.failedCount }}</span>
                }
              </td>
            </tr>
          </ng-template>

          <!-- PrimeNG 21 renomeou este template: "rowexpansion" é silenciosamente ignorado, a linha
               alterna o estado interno e não desenha nada. O nome atual é "expandedrow". -->
          <ng-template pTemplate="expandedrow" let-row>
            <tr>
              <td colspan="9" class="bg-app-surface">
                @if (detail()[row.id]; as info) {
                  <div class="p-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div>
                      <h4 class="font-medium text-app-text mb-2">{{ 'admin.access.sessionsTitle' | translate }}</h4>
                      @if (info.sessions.length === 0) {
                        <p class="text-sm text-app-text-secondary">{{ 'admin.access.noSessions' | translate }}</p>
                      } @else {
                        <ul class="space-y-2">
                          @for (session of info.sessions; track session.id) {
                            <li class="flex items-start justify-between gap-3 border-b border-app-border-subtle pb-2 last:border-0">
                              <div>
                                <div class="text-sm font-medium text-app-text">
                                  {{ session.device ?? ('admin.access.unknownDevice' | translate) }}
                                </div>
                                <div class="text-xs text-app-text-secondary">
                                  {{ session.ipAddress ?? '—' }} · {{ providerLabel(session.authProvider) | translate }}
                                </div>
                                <div class="text-xs text-app-text-secondary">
                                  {{ 'admin.access.started' | translate }}: {{ session.startedAt | localizedDate: 'datetime' }}
                                  · {{ 'admin.access.lastSeen' | translate }}: {{ session.lastSeenAt | localizedDate: 'datetime' }}
                                </div>
                              </div>
                              <app-tag-badge [value]="sessionLabel(session) | translate"
                                             [severity]="sessionSeverity(session)"></app-tag-badge>
                            </li>
                          }
                        </ul>
                      }
                    </div>

                    <div>
                      <h4 class="font-medium text-app-text mb-2">{{ 'admin.access.historyTitle' | translate }}</h4>
                      @if (info.events.length === 0) {
                        <p class="text-sm text-app-text-secondary">{{ 'admin.access.noEvents' | translate }}</p>
                      } @else {
                        <ul class="space-y-1 max-h-72 overflow-y-auto pr-1">
                          @for (event of info.events; track event.id) {
                            <li class="flex items-center justify-between gap-3 text-sm">
                              <span [class]="event.eventType === 'LOGIN_FAILED' ? 'text-app-warning' : 'text-app-text-secondary'">
                                {{ eventLabel(event.eventType) | translate }}
                                @if (event.failureReason) {
                                  <span class="text-xs text-app-text-tertiary">({{ failureLabel(event.failureReason) | translate }})</span>
                                }
                              </span>
                              <span class="text-xs text-app-text-tertiary whitespace-nowrap">
                                {{ event.ipAddress ?? '—' }} · {{ event.createdAt | localizedDate: 'datetime' }}
                              </span>
                            </li>
                          }
                        </ul>
                      }
                    </div>
                  </div>
                } @else {
                  <div class="p-4 text-sm text-app-text-secondary">
                    <i class="pi pi-spin pi-spinner mr-2"></i>{{ 'common.loading' | translate }}
                  </div>
                }
              </td>
            </tr>
          </ng-template>

          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="9" class="text-center text-app-text-tertiary py-10">
                <i class="pi pi-search text-2xl mb-2 block"></i>
                <p class="text-sm font-medium text-app-text">{{ 'common.noResults' | translate }}</p>
                <p-button [label]="'common.clearFilters' | translate" [text]="true" size="small" class="inline-block mt-2"
                          (onClick)="clearFilters()"></p-button>
              </td>
            </tr>
          </ng-template>
        </p-table>
      </div>
      </p-panel>
      }
    </div>
  `,
})
export class UserAccessComponent implements OnInit {
  private userAccessService = inject(UserAccessService);
  private messageService = inject(MessageService);
  private translate = inject(TranslateService);
  private destroyRef = inject(DestroyRef);

  readonly pageSize = PAGE_SIZE;

  overview = signal<AccessOverview | null>(null);
  rows = signal<UserAccessRow[]>([]);
  total = signal(0);
  first = signal(0);
  loading = signal(true);
  accessEmpty = computed(() => !this.loading() && this.total() === 0 && !this.hasActiveFilters());
  detail = signal<Record<string, UserAccessDetail>>({});
  expandedRows: Record<string, boolean> = {};

  search = '';
  role: string | null = null;
  status: ConnectionStatus | null = null;

  readonly roleOptions = [
    { label: this.translate.instant('roles.OWNER'), value: 'OWNER' },
    { label: this.translate.instant('roles.ADMIN'), value: 'ADMIN' },
    { label: this.translate.instant('roles.COMMERCIAL'), value: 'COMMERCIAL' },
    { label: this.translate.instant('roles.OPERATOR'), value: 'OPERATOR' },
    { label: this.translate.instant('roles.FINANCE'), value: 'FINANCE' },
    { label: this.translate.instant('roles.TECHNICIAN'), value: 'TECHNICIAN' },
    { label: this.translate.instant('roles.LAUNDRY'), value: 'LAUNDRY' },
    { label: this.translate.instant('roles.PLATFORM_ADMIN'), value: 'PLATFORM_ADMIN' },
  ];

  readonly statusOptions = [
    { label: this.translate.instant('admin.access.statusOnline'), value: 'ONLINE' },
    { label: this.translate.instant('admin.access.statusOffline'), value: 'OFFLINE' },
    { label: this.translate.instant('admin.access.statusNever'), value: 'NEVER' },
  ];

  private page = 0;
  private filterChange$ = new Subject<void>();

  ngOnInit() {
    this.loadOverview();
    this.loadUsers();
    this.wireFilters();
    this.startAutoRefresh();
  }

  /** Busca/perfil/estado disparam aqui; debounce+distinctUntilChanged evitam requests
   *  supérfluos, switchMap cancela a busca anterior quando uma nova é iniciada. */
  private wireFilters(): void {
    const sub = this.filterChange$.pipe(
      debounceTime(300),
      map(() => this.filterKey()),
      distinctUntilChanged(),
      tap(() => { this.page = 0; this.first.set(0); this.loading.set(true); }),
      switchMap(() => this.fetchUsers$().pipe(
        catchError(() => {
          this.messageService.add({ severity: 'error', summary: this.translate.instant('admin.access.loadError') });
          return of(null);
        }),
      )),
    ).subscribe(result => {
      this.loading.set(false);
      if (result) {
        this.rows.set(result.content);
        this.total.set(result.page.totalElements);
        Object.keys(this.expandedRows).forEach(id => this.loadDetail(id));
      }
    });
    this.destroyRef.onDestroy(() => sub.unsubscribe());
  }

  private filterKey(): string {
    return [this.search.trim(), this.role ?? '', this.status ?? ''].join('|');
  }

  private fetchUsers$(): Observable<AccessPage> {
    return this.userAccessService.listUsers({
      role: this.role, status: this.status, search: this.search, page: this.page, size: PAGE_SIZE,
    });
  }

  /**
   * O ecrã responde a "quem está ligado agora", e uma resposta que envelhece em silêncio é pior do
   * que nenhuma. Meio minuto fica bem abaixo da janela de presença (5 minutos por omissão), por
   * isso o estado mostrado nunca está mais do que um refrescamento atrás da verdade.
   */
  private startAutoRefresh() {
    const timer = setInterval(() => this.reload(), AUTO_REFRESH_MS);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  onLazyLoad(event: { first?: number | null; rows?: number | null }) {
    this.page = Math.floor((event.first ?? 0) / (event.rows ?? PAGE_SIZE));
    this.first.set(event.first ?? 0);
    this.loadUsers();
  }

  /** Disparado a cada tecla/seleção — alimenta o pipeline reativo em {@link wireFilters}. */
  applyFilters() {
    this.filterChange$.next();
  }

  hasActiveFilters(): boolean {
    return !!this.search.trim() || this.role !== null || this.status !== null;
  }

  clearFilters(): void {
    this.search = '';
    this.role = null;
    this.status = null;
    this.applyFilters();
  }

  reload() {
    this.loadOverview();
    this.loadUsers();
  }

  private loadOverview() {
    this.userAccessService.getOverview().subscribe({
      next: overview => this.overview.set(overview),
      error: () => {},
    });
  }

  private loadUsers() {
    this.loading.set(true);
    this.fetchUsers$().subscribe({
      next: result => {
        this.rows.set(result.content);
        this.total.set(result.page.totalElements);
        this.loading.set(false);
        // Recarrega a ficha das linhas ainda abertas — senão ficavam paradas no minuto anterior.
        Object.keys(this.expandedRows).forEach(id => this.loadDetail(id));
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('admin.access.loadError') });
      },
    });
  }

  onRowExpand(event: { data: UserAccessRow }) {
    this.loadDetail(event.data.id);
  }

  private loadDetail(userId: string) {
    this.userAccessService.getDetail(userId).subscribe({
      next: info => this.detail.update(current => ({ ...current, [userId]: info })),
      error: () => {},
    });
  }

  connectionLabel(status: ConnectionStatus): string {
    const map: Record<ConnectionStatus, string> = {
      ONLINE: 'admin.access.statusOnline',
      OFFLINE: 'admin.access.statusOffline',
      NEVER: 'admin.access.statusNever',
    };
    return map[status] ?? status;
  }

  connectionSeverity(status: ConnectionStatus): 'success' | 'secondary' | 'warn' {
    if (status === 'ONLINE') return 'success';
    return status === 'NEVER' ? 'warn' : 'secondary';
  }

  sessionLabel(session: { online: boolean; endedAt: string | null }): string {
    if (session.online) return 'admin.access.sessionOnline';
    return session.endedAt ? 'admin.access.sessionEnded' : 'admin.access.sessionIdle';
  }

  sessionSeverity(session: { online: boolean; endedAt: string | null }): 'success' | 'danger' | 'warn' {
    if (session.online) return 'success';
    return session.endedAt ? 'danger' : 'warn';
  }

  providerLabel(provider: string): string {
    const map: Record<string, string> = {
      LOCAL: 'admin.access.providerLocal',
      GOOGLE: 'admin.access.providerGoogle',
      FACEBOOK: 'admin.access.providerFacebook',
    };
    return map[provider] ?? provider;
  }

  eventLabel(type: string): string {
    const map: Record<string, string> = {
      LOGIN_SUCCESS: 'admin.access.eventLogin',
      LOGIN_FAILED: 'admin.access.eventFailed',
      TOKEN_REFRESH: 'admin.access.eventRefresh',
      LOGOUT: 'admin.access.eventLogout',
    };
    return map[type] ?? type;
  }

  failureLabel(reason: string): string {
    const map: Record<string, string> = {
      BAD_PASSWORD: 'admin.access.failureBadPassword',
      ACCOUNT_DISABLED: 'admin.access.failureDisabled',
      SOCIAL_ACCOUNT_NO_PASSWORD: 'admin.access.failureSocial',
    };
    return map[reason] ?? reason;
  }
}
