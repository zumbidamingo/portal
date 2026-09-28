import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Notification, NotificationCategory, NotificationTab } from '../../core/models/notification.model';
import { NotificationService } from '../../core/services/notification.service';
import { NotificationItemComponent } from '../../shared/components/notification-item/notification-item.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { dayBucket } from '../../shared/utils/notification-text';
import { formatLocalizedDate } from '../../shared/i18n/date-locale';

const PAGE_SIZE = 20;
const CATEGORIES: NotificationCategory[] = ['SALES', 'OPERATIONS', 'FINANCE', 'SYSTEM'];

interface DayGroup {
  key: string;
  label: string;
  items: Notification[];
}

/**
 * Central de notificações (issue #335): duas abas — "Precisam de ação" (o que exige alguém) e
 * "Atividade" (informação) —, filtro por categoria, agrupamento por dia, tempo real por SSE e o
 * destino de cada aviso vindo do backend. Abrir uma notificação marca-a como lida e leva direto ao
 * registo. Nenhuma tabela tipo→ícone/rota/texto vive aqui: ícone é da categoria, cor da severidade,
 * texto das chaves `notifications.types.<TIPO>` e link do backend.
 */
@Component({
  selector: 'app-notifications',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule, RouterLink, TranslatePipe, ButtonModule, SelectModule,
    PageHeaderComponent, EmptyStateComponent, NotificationItemComponent,
  ],
  template: `
    <div class="max-w-2xl space-y-4">
      <app-page-header [title]="'notifications.title' | translate" [description]="'notifications.subtitle' | translate">
        <a routerLink="/notifications/preferences" class="text-sm text-app-accent hover:underline mr-3">
          {{ 'notifications.preferences' | translate }}
        </a>
        @if (counters().unreadTotal > 0) {
          <p-button [label]="'notifications.markAllAsRead' | translate" [text]="true" size="small"
                    (onClick)="markAllRead()"></p-button>
        }
      </app-page-header>

      <div class="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" class="inline-flex rounded-md border border-app-border p-0.5" [attr.aria-label]="'notifications.title' | translate">
          <button type="button" role="tab" [attr.aria-selected]="tab() === 'ACTION'"
                  class="rounded px-3 py-1.5 text-sm cursor-pointer border-0"
                  [class]="tab() === 'ACTION' ? 'bg-app-accent-soft text-app-accent font-medium' : 'bg-transparent text-app-text-secondary'"
                  (click)="selectTab('ACTION')">
            {{ 'notifications.tabAction' | translate }}
            @if (counters().actionOpen > 0) {
              <span class="ml-1 rounded-full bg-app-danger-text px-1.5 text-[11px] text-app-action-text">{{ counters().actionOpen }}</span>
            }
          </button>
          <button type="button" role="tab" [attr.aria-selected]="tab() === 'ACTIVITY'"
                  class="rounded px-3 py-1.5 text-sm cursor-pointer border-0"
                  [class]="tab() === 'ACTIVITY' ? 'bg-app-accent-soft text-app-accent font-medium' : 'bg-transparent text-app-text-secondary'"
                  (click)="selectTab('ACTIVITY')">
            {{ 'notifications.tabActivity' | translate }}
          </button>
        </div>

        <p-select [options]="categoryOptions()" [formControl]="categoryControl" optionLabel="label" optionValue="value"
                  appendTo="body" [showClear]="true" class="w-56"
                  [placeholder]="'notifications.filterByCategory' | translate"
                  [attr.aria-label]="'notifications.filterByCategory' | translate"></p-select>
      </div>

      <!-- Anuncia ao leitor de ecrã o que chegou sem o utilizador ter de procurar. -->
      <p class="sr-only" aria-live="polite">{{ liveMessage() }}</p>

      <div class="border-t border-app-border" role="list" [attr.aria-busy]="loading()">
        @if (loading()) {
          @for (i of [1, 2, 3]; track i) {
            <div class="flex animate-pulse items-start gap-3 border-b border-app-border py-4 pl-5" aria-hidden="true">
              <div class="h-9 w-9 rounded-md bg-app-neutral-bg"></div>
              <div class="flex-1 space-y-2">
                <div class="h-3 w-1/3 rounded bg-app-neutral-bg"></div>
                <div class="h-3 w-2/3 rounded bg-app-neutral-bg"></div>
              </div>
            </div>
          }
        } @else if (error()) {
          <div class="py-12 text-center">
            <p class="text-sm text-app-text-secondary">{{ 'notifications.loadError' | translate }}</p>
            <p-button class="mt-3" [label]="'notifications.retry' | translate" [outlined]="true" size="small" (onClick)="reload()"></p-button>
          </div>
        } @else {
          @for (group of groups(); track group.key) {
            <p class="border-b border-app-border bg-app-surface px-5 py-1.5 text-xs font-medium uppercase tracking-wide text-app-text-tertiary">
              {{ group.label }}
            </p>
            @for (notif of group.items; track notif.id) {
              <app-notification-item [notification]="notif" (opened)="open($event)" (dismissed)="dismiss($event)"></app-notification-item>
            }
          }
          @if (!rows().length) {
            <app-empty-state [icon]="categoryControl.value ? 'pi pi-filter-slash' : 'pi pi-check-circle'"
                             [message]="emptyMessageKey() | translate"></app-empty-state>
          }
        }
      </div>

      @if (hasMore() && !loading() && !error()) {
        <div class="text-center">
          <p-button [label]="'notifications.loadMore' | translate" [outlined]="true" size="small"
                    [loading]="loadingMore()" (onClick)="loadMore()"></p-button>
        </div>
      }
    </div>
  `,
})
export class NotificationsComponent implements OnInit {
  private notifService = inject(NotificationService);
  private router = inject(Router);
  private translate = inject(TranslateService);
  private messageService = inject(MessageService);
  private destroyRef = inject(DestroyRef);

  readonly counters = this.notifService.counters;
  readonly tab = signal<NotificationTab>('ACTION');
  readonly categoryControl = new FormControl<NotificationCategory | null>(null);
  readonly rows = signal<Notification[]>([]);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly loadingMore = signal(false);
  readonly error = signal(false);
  readonly liveMessage = signal('');
  private page = 0;

  readonly hasMore = computed(() => this.rows().length < this.total());
  readonly emptyMessageKey = computed(() =>
    this.categoryControl.value ? 'notifications.noneForCategory'
      : this.tab() === 'ACTION' ? 'notifications.noAction' : 'notifications.noActivity');

  readonly categoryOptions = computed(() => {
    this.langVersion();
    return CATEGORIES.map(value => ({ value, label: this.translate.instant(`notifications.categories.${value}`) }));
  });
  private langVersion = signal(0);

  readonly groups = computed<DayGroup[]>(() => {
    this.langVersion();
    const lang = this.translate.getCurrentLang();
    const groups: DayGroup[] = [];
    for (const n of this.rows()) {
      const key = dayBucket(n.lastOccurredAt ?? n.createdAt);
      let group = groups.find(g => g.key === key);
      if (!group) {
        const label = key === 'today' ? this.translate.instant('notifications.today')
          : key === 'yesterday' ? this.translate.instant('notifications.yesterday')
            : formatLocalizedDate(n.lastOccurredAt ?? n.createdAt, lang, 'date');
        group = { key, label, items: [] };
        groups.push(group);
      }
      group.items.push(n);
    }
    return groups;
  });

  ngOnInit(): void {
    this.load(true);
    this.notifService.loadCounters().subscribe({ error: () => undefined });

    this.categoryControl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.load(true));
    this.translate.onLangChange.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.langVersion.update(v => v + 1));
    this.translate.onTranslationChange.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.langVersion.update(v => v + 1));

    // Tempo real: uma notificação nova entra na lista certa; uma que se fechou sozinha sai da aba de ação.
    this.notifService.notificationReceived$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(n => this.onReceived(n));
    this.notifService.notificationResolved$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(id => this.onResolved(id));
  }

  selectTab(tab: NotificationTab): void {
    if (this.tab() === tab) return;
    this.tab.set(tab);
    this.load(true);
  }

  reload(): void {
    this.load(true);
  }

  loadMore(): void {
    this.loadingMore.set(true);
    this.notifService.list({ tab: this.tab(), category: this.categoryControl.value, page: this.page + 1, size: PAGE_SIZE }).subscribe({
      next: result => {
        this.page += 1;
        this.rows.update(existing => [...existing, ...result.content.filter(n => !existing.some(e => e.id === n.id))]);
        this.total.set(result.page.totalElements);
        this.loadingMore.set(false);
      },
      error: () => this.loadingMore.set(false),
    });
  }

  open(notif: Notification): void {
    if (!notif.read) {
      this.notifService.markAsRead(notif.id).subscribe({ error: () => undefined });
      this.rows.update(rows => rows.map(n => n.id === notif.id ? { ...n, read: true } : n));
    }
    if (notif.link) {
      void this.router.navigate([notif.link.route], { queryParams: notif.link.queryParams });
    }
  }

  dismiss(notif: Notification): void {
    this.notifService.dismiss(notif.id).subscribe({
      next: () => {
        this.rows.update(rows => rows.filter(n => n.id !== notif.id));
        this.total.update(t => Math.max(0, t - 1));
        this.messageService.add({ severity: 'success', summary: this.translate.instant('notifications.dismissed') });
      },
      error: () => this.messageService.add({ severity: 'error', summary: this.translate.instant('notifications.loadError') }),
    });
  }

  markAllRead(): void {
    this.notifService.markAllAsRead(this.categoryControl.value).subscribe(() => {
      this.rows.update(rows => rows.map(n => ({ ...n, read: true })));
    });
  }

  private load(reset: boolean): void {
    if (reset) {
      this.page = 0;
      this.loading.set(true);
    }
    this.error.set(false);
    this.notifService.list({ tab: this.tab(), category: this.categoryControl.value, page: 0, size: PAGE_SIZE }).subscribe({
      next: result => {
        this.rows.set(result.content);
        this.total.set(result.page.totalElements);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set(true);
      },
    });
  }

  private fitsCurrentView(n: Notification): boolean {
    const category = this.categoryControl.value;
    if (category && n.category !== category) return false;
    const inAction = n.requiresAction && n.status === 'OPEN';
    return this.tab() === 'ACTION' ? inAction : !inAction && n.status !== 'DISMISSED';
  }

  private onReceived(n: Notification): void {
    if (n.requiresAction && n.status === 'OPEN') {
      this.liveMessage.set(this.translate.instant('notifications.newAction'));
    }
    if (!this.fitsCurrentView(n)) return;
    this.rows.update(rows => {
      const without = rows.filter(r => r.id !== n.id);
      if (without.length === rows.length) this.total.update(t => t + 1);
      return [n, ...without];
    });
  }

  private onResolved(id: string): void {
    if (this.tab() === 'ACTION') {
      this.rows.update(rows => rows.filter(n => n.id !== id));
      this.total.update(t => Math.max(0, t - 1));
    } else {
      this.rows.update(rows => rows.map(n => n.id === id ? { ...n, status: 'RESOLVED' as const, read: true } : n));
    }
  }
}
