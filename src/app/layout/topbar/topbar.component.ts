import { CommonModule } from '@angular/common';
import { Component, EventEmitter, inject, Output, computed, signal, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MenuItem } from 'primeng/api';
import { BadgeModule } from 'primeng/badge';
import { Menu, MenuModule } from 'primeng/menu';
import { Popover, PopoverModule } from 'primeng/popover';
import { Notification } from '../../core/models/notification.model';
import { NotificationItemComponent } from '../../shared/components/notification-item/notification-item.component';
import { AuthService } from '../../core/auth/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { SubscriptionService } from '../../core/services/subscription.service';
import { TenantService } from '../../core/services/tenant.service';
import { mediaUrl } from '../../shared/utils/media-url';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe, BadgeModule, MenuModule, PopoverModule, NotificationItemComponent],
  template: `
    <header class="h-14 bg-app-sidebar border-b border-app-border flex items-center justify-between px-6 sticky top-0 z-40">

      <!-- Hamburger (mobile) -->
      <button class="lg:hidden p-2 rounded-md hover:bg-app-surface-hover" (click)="menuToggle.emit()">
        <i class="pi pi-bars text-app-text-secondary"></i>
      </button>

      <div class="flex-1"></div>

      <!-- Actions -->
      <div class="flex items-center gap-3">
        <!-- Notificações: só quem as recebe. PLATFORM_ADMIN não pertence a tenant nenhum — nunca
             é alvo de um job de notificação (CLAUDE.md §9), o sino seria sempre zero, e mantê-lo
             obrigava a uma contagem e a um stream SSE aberto a vida toda sem nada para entregar.
             ADMIN da empresa é destinatário normal do ciclo operacional (issue #109/#111). -->
        @if (!isPlatformAdmin()) {
          <button type="button" class="relative p-2 rounded-md hover:bg-app-surface-hover transition-colors cursor-pointer bg-transparent border-0"
                  aria-haspopup="dialog"
                  [attr.aria-label]="(notifService.badge() > 0 ? ('notifications.bellCount' | translate: { count: notifService.badge() }) : ('notifications.bellLabel' | translate))"
                  (click)="bell.toggle($event)">
            <i class="pi pi-bell text-app-text-secondary text-lg" aria-hidden="true"></i>
            @if (notifService.badge() > 0) {
              <span class="absolute -top-0.5 -right-0.5 bg-app-danger-text text-app-action-text text-[10px] rounded-full min-w-4 h-4 px-1 flex items-center justify-center" aria-hidden="true">
                {{ notifService.badge() > 9 ? '9+' : notifService.badge() }}
              </span>
            }
          </button>
          <!-- Dropdown curto: o que precisa de ação (ou, sem nada a fazer, a atividade recente) e o caminho para a central. -->
          <p-popover #bell appendTo="body" (onShow)="loadRecent()">
            <div class="w-[22rem] max-w-[90vw]">
              <div class="flex items-center justify-between border-b border-app-border px-4 py-2.5">
                <span class="text-sm font-semibold text-app-text">{{ 'notifications.title' | translate }}</span>
                <a routerLink="/notifications" class="text-xs text-app-accent hover:underline" (click)="bell.hide()">
                  {{ 'notifications.viewAll' | translate }}
                </a>
              </div>
              @if (recent().length) {
                <div role="list">
                  @for (n of recent(); track n.id) {
                    <app-notification-item [notification]="n" [compact]="true"
                                           (opened)="openFromBell($event, bell)" (dismissed)="dismissFromBell($event)"></app-notification-item>
                  }
                </div>
              } @else {
                <p class="px-4 py-8 text-center text-sm text-app-text-tertiary">
                  {{ (recentLoading() ? 'common.loading' : 'notifications.bellEmpty') | translate }}
                </p>
              }
            </div>
          </p-popover>
        }

        <!-- Empresa: nome e plano, junto ao sino. PLATFORM_ADMIN não pertence a nenhuma empresa. -->
        @if (!isPlatformAdmin()) {
          <button type="button"
                  class="flex items-center gap-2.5 rounded-md hover:bg-app-surface-hover p-1.5 cursor-pointer text-left"
                  aria-haspopup="menu"
                  (click)="menu.toggle($event)">
            <span class="w-7 h-7 rounded-md bg-app-accent-soft text-app-accent-hover font-semibold text-sm flex items-center justify-center flex-shrink-0 overflow-hidden">
              @if (companyLogo(); as logo) {
                <img [src]="logo" alt="" class="w-full h-full object-cover">
              } @else {
                {{ companyName().charAt(0).toUpperCase() }}
              }
            </span>
            <span class="hidden md:block leading-tight">
              <span class="block text-sm font-medium text-app-text">{{ companyName() }}</span>
              @if (planKey(); as plan) {
                <span class="block text-xs text-app-text-tertiary">{{ ('subscription.plans.' + plan) | translate }}</span>
              }
            </span>
            <i class="pi pi-chevron-down text-app-text-tertiary text-xs"></i>
          </button>
        }
      </div>
    </header>

    <p-menu #menu [model]="menuItems()" [popup]="true" appendTo="body"></p-menu>
  `
})
export class TopbarComponent implements OnInit, OnDestroy {
  auth = inject(AuthService);
  notifService = inject(NotificationService);
  private translate = inject(TranslateService);
  private router = inject(Router);
  private tenantService = inject(TenantService);
  private subService = inject(SubscriptionService);

  @Output() menuToggle = new EventEmitter<void>();
  @ViewChild('menu') menu!: Menu;

  isPlatformAdmin = computed(() => this.auth.userRole() === 'PLATFORM_ADMIN');
  companyName = computed(() => this.tenantService.current()?.name ?? '');
  companyLogo = computed(() => mediaUrl(this.tenantService.current()?.logoUrl) || null);
  /** Só quem vê billing (mesmo grupo que /subscriptions/** exige no backend) recebe o plano. */
  planKey = computed(() => {
    const role = this.auth.userRole();
    return role === 'OWNER' || role === 'ADMIN' ? this.subService.planLabelKey() : '';
  });

  ngOnInit() {
    if (this.isPlatformAdmin()) return;
    this.tenantService.getMe().subscribe();
    if (['OWNER', 'ADMIN'].includes(this.auth.userRole() ?? '')) this.subService.getMe().subscribe();
    this.notifService.loadCounters().subscribe({ error: () => undefined });
    this.notifService.connectStream();
  }

  /** Últimas 5 que precisam de ação; sem nenhuma, a atividade recente. Carregado ao abrir o dropdown. */
  recent = signal<Notification[]>([]);
  recentLoading = signal(false);

  loadRecent(): void {
    this.recentLoading.set(true);
    this.notifService.list({ tab: 'ACTION', page: 0, size: 5 }).subscribe({
      next: result => {
        if (result.content.length) {
          this.recent.set(result.content);
          this.recentLoading.set(false);
          return;
        }
        this.notifService.list({ tab: 'ACTIVITY', page: 0, size: 5 }).subscribe({
          next: activity => { this.recent.set(activity.content); this.recentLoading.set(false); },
          error: () => this.recentLoading.set(false),
        });
      },
      error: () => this.recentLoading.set(false),
    });
  }

  openFromBell(notif: Notification, popover: Popover): void {
    if (!notif.read) {
      this.notifService.markAsRead(notif.id).subscribe({ error: () => undefined });
    }
    popover.hide();
    if (notif.link) {
      void this.router.navigate([notif.link.route], { queryParams: notif.link.queryParams });
    }
  }

  dismissFromBell(notif: Notification): void {
    this.notifService.dismiss(notif.id).subscribe({
      next: () => this.recent.update(rows => rows.filter(n => n.id !== notif.id)),
      error: () => undefined,
    });
  }

  ngOnDestroy() {
    this.notifService.disconnectStream();
  }

  menuItems = computed<MenuItem[]>(() => {
    const role = this.auth.userRole();
    const items: MenuItem[] = [];
    // Administração: mesmo grupo que a sidebar já usava para esta secção.
    if (role === 'OWNER' || role === 'ADMIN') {
      items.push(
        { label: this.translate.instant('nav.administration'), icon: 'pi pi-cog', command: () => this.navigateTo('/administration') },
        { separator: true },
      );
    }
    items.push({ label: this.translate.instant('auth.logout'), icon: 'pi pi-sign-out', command: () => this.logout() });
    return items;
  });

  private navigateTo(path: string, queryParams?: Record<string, string>): void {
    this.menu?.hide();
    setTimeout(() => this.router.navigate([path], queryParams ? { queryParams } : undefined));
  }

  private logout(): void {
    this.menu?.hide();
    setTimeout(() => this.auth.logout());
  }
}
