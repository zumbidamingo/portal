import { AfterViewInit, Component, DestroyRef, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MenuItem } from 'primeng/api';
import { AvatarModule } from 'primeng/avatar';
import { Menu, MenuModule } from 'primeng/menu';
import { TooltipModule } from 'primeng/tooltip';
import { AuthService } from '../../core/auth/auth.service';
import { LaundryFeatureService } from '../../core/services/laundry-feature.service';
import { TenantService } from '../../core/services/tenant.service';
import { THEME_MODES, ThemeMode, ThemeService } from '../../core/services/theme.service';
import { BrandLogoComponent } from '../../shared/components/brand-logo/brand-logo.component';
import { navigationFor } from './sidebar-navigation';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, TranslatePipe, AvatarModule, MenuModule, TooltipModule, BrandLogoComponent],
  template: `
    <aside class="flex flex-col h-full bg-app-sidebar text-app-text border-r border-app-border transition-[width] duration-200"
           [ngClass]="collapsed ? 'w-16' : 'w-[212px]'">

      <!-- Logo -->
      <div class="h-14 flex items-center flex-shrink-0" [class.px-4]="!collapsed" [class.justify-center]="collapsed">
        <a routerLink="/" class="flex items-center" [attr.aria-label]="'nav.home' | translate">
          @if (collapsed) {
            <app-brand-logo variant="symbol" [size]="28" />
          } @else {
            <app-brand-logo variant="wordmark" [size]="26" />
          }
        </a>
      </div>

      <!-- Nav items -->
      <!-- Esmaece a ponta onde ainda há itens por baixo (mesma máscara do kanban de Ordens): sem
           isso o item cortado pela logo ou pelo rodapé parece o fim do menu. -->
      <nav #navScroll class="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar pt-1 pb-3"
           [class.nav-fade-top]="fadeTop()" [class.nav-fade-bottom]="fadeBottom()"
           [attr.aria-label]="'nav.mainMenu' | translate" (scroll)="updateFades()">
        <div #navContent>
        @for (group of navGroups(); track group.label) {
          <!-- Grupos separam-se só por espaço vertical (DESIGN.md → Navigation). O rótulo lê-se como
               categoria e não como item por ser maiúsculo, pequeno, terciário e sem hover. Recolhido,
               o rótulo sai e fica só o espaço. -->
          <div class="px-2" [class.mt-5]="!$first && !collapsed" [class.mt-3]="!$first && collapsed">
            @if (!collapsed && group.label) {
              <div class="px-2 pb-1.5 text-[11px] font-semibold text-app-text-tertiary uppercase tracking-wide select-none">
                {{ group.label | translate }}
              </div>
            }
          </div>
          <ul class="space-y-0.5 px-2">
            @for (item of group.items; track item.route) {
              <li>
                <ng-container *ngTemplateOutlet="navLink; context: { $implicit: item }" />
              </li>
            }
          </ul>
        }
        </div>
      </nav>

      <!-- Rodapé: configuração da empresa, recolher/expandir e o utilizador. -->
      <div class="p-2 border-t border-app-border space-y-0.5">
        @for (item of footerItems(); track item.route) {
          <ng-container *ngTemplateOutlet="navLink; context: { $implicit: item }" />
        }

        @if (collapsible) {
          <button type="button"
                  class="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md text-app-text-secondary text-sm font-medium hover:bg-app-surface-hover hover:text-app-text transition-colors cursor-pointer"
                  [class.justify-center]="collapsed"
                  [attr.aria-expanded]="!collapsed"
                  [attr.aria-label]="(collapsed ? 'nav.expandMenu' : 'nav.collapseMenu') | translate"
                  [pTooltip]="collapsed ? ('nav.expandMenu' | translate) : ''"
                  tooltipPosition="right" appendTo="body"
                  (click)="collapsedChange.emit(!collapsed)">
            <i class="pi text-[15px] flex-shrink-0" [class.pi-angle-double-left]="!collapsed" [class.pi-angle-double-right]="collapsed" aria-hidden="true"></i>
            @if (!collapsed) {
              <span class="flex-1 text-left">{{ 'nav.collapseMenu' | translate }}</span>
            }
          </button>
        }

        <button type="button"
                class="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md text-left hover:bg-app-surface-hover transition-colors cursor-pointer"
                [class.justify-center]="collapsed"
                aria-haspopup="menu"
                [attr.aria-label]="collapsed ? (auth.currentUser()?.name ?? '') : null"
                [pTooltip]="collapsed ? (auth.currentUser()?.name ?? '') : ''"
                tooltipPosition="right" appendTo="body"
                (click)="userMenu.toggle($event)">
          <p-avatar
            [image]="auth.avatarBlobUrl() || ''"
            [label]="!auth.avatarBlobUrl() ? auth.currentUser()?.name?.charAt(0) : ''"
            styleClass="bg-app-accent-soft text-app-accent-hover shrink-0"
            size="normal"
            shape="circle">
          </p-avatar>
          @if (!collapsed) {
            <span class="flex-1 min-w-0 leading-tight">
              <span class="block text-sm font-medium text-app-text truncate">{{ auth.currentUser()?.name }}</span>
              @if (getRoleLabel(); as roleLabel) {
                <span class="block text-xs text-app-text-tertiary truncate">{{ roleLabel }}</span>
              }
            </span>
            <i class="pi pi-chevron-up text-app-text-tertiary text-xs"></i>
          }
        </button>
      </div>
    </aside>

    <ng-template #navLink let-item>
      <!-- Recolhido, o nome sai do ecrã mas não do link: aria-label para leitores de ecrã e tooltip
           à direita para quem passa o rato ou navega por teclado. -->
      <a [routerLink]="item.route"
         routerLinkActive="bg-app-surface-hover text-app-text font-semibold"
         [routerLinkActiveOptions]="{ paths: item.matchPrefix ? 'subset' : 'exact', queryParams: 'ignored', fragment: 'ignored', matrixParams: 'ignored' }"
         #rla="routerLinkActive"
         [attr.aria-current]="rla.isActive ? 'page' : null"
         [attr.aria-label]="collapsed ? (item.label | translate) : null"
         [pTooltip]="collapsed ? (item.label | translate) : ''"
         tooltipPosition="right" appendTo="body"
         class="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-app-text font-medium hover:bg-app-surface-hover transition-colors cursor-pointer text-sm"
         [class.justify-center]="collapsed"
        >
        <i [class]="item.icon + ' text-[15px] flex-shrink-0' + (rla.isActive ? ' text-app-accent-hover' : '')" aria-hidden="true"></i>
        @if (!collapsed) {
          <span class="flex-1 truncate">{{ item.label | translate }}</span>
        }
      </a>
    </ng-template>

    <p-menu #userMenu [model]="userMenuItems()" [popup]="true" appendTo="body"></p-menu>
  `,
  styles: [`
    .nav-fade-top {
      mask-image: linear-gradient(to bottom, transparent 0, black 28px);
      -webkit-mask-image: linear-gradient(to bottom, transparent 0, black 28px);
    }
    .nav-fade-bottom {
      mask-image: linear-gradient(to bottom, black calc(100% - 28px), transparent 100%);
      -webkit-mask-image: linear-gradient(to bottom, black calc(100% - 28px), transparent 100%);
    }
    .nav-fade-top.nav-fade-bottom {
      mask-image: linear-gradient(to bottom, transparent 0, black 28px, black calc(100% - 28px), transparent 100%);
      -webkit-mask-image: linear-gradient(to bottom, transparent 0, black 28px, black calc(100% - 28px), transparent 100%);
    }
  `]
})
export class SidebarComponent implements OnInit, AfterViewInit {
  auth = inject(AuthService);
  private tenantService = inject(TenantService);
  private laundryFeature = inject(LaundryFeatureService);
  private translate = inject(TranslateService);
  private router = inject(Router);
  private theme = inject(ThemeService);

  @Input() collapsed = false;
  /** Só a barra fixa do desktop recolhe; a gaveta do mobile abre sempre inteira. */
  @Input() collapsible = false;
  @Output() collapsedChange = new EventEmitter<boolean>();
  @ViewChild('userMenu') userMenu!: Menu;
  @ViewChild('navScroll') private navScroll?: ElementRef<HTMLElement>;
  @ViewChild('navContent') private navContent?: ElementRef<HTMLElement>;
  private destroyRef = inject(DestroyRef);

  fadeTop = signal(false);
  fadeBottom = signal(false);

  userMenuItems = computed<MenuItem[]>(() => [
    // Única entrada de "coisas do utilizador": dados pessoais, palavra-passe, idioma e exclusão
    // de conta vivem todos em /profile — nada de uma segunda entrada "Definições".
    { label: this.translate.instant('nav.myProfile'), icon: 'pi pi-user', command: () => this.navigateTo('/profile') },
    { separator: true },
    // Tema: três entradas de escolha única; a ativa mostra o visto em vez do ícone do modo.
    ...THEME_MODES.map(mode => this.themeItem(mode)),
    { separator: true },
    { label: this.translate.instant('auth.logout'), icon: 'pi pi-sign-out', command: () => this.logout() },
  ]);

  // `/tenants/me` responde a todos os perfis; `/subscriptions/me` só a OWNER/ADMIN.
  private navigation = computed(() => navigationFor(this.auth.userRole(), {
    laundryActive: this.laundryFeature.active(),
    hasAi: this.tenantService.current()?.intelligence?.availableInPlan ?? false,
  }));
  navGroups = computed(() => this.navigation().groups);
  footerItems = computed(() => this.navigation().footer);

  private themeItem(mode: ThemeMode): MenuItem {
    const icons: Record<ThemeMode, string> = { light: 'pi-sun', dark: 'pi-moon', system: 'pi-desktop' };
    const active = this.theme.mode() === mode;
    return {
      label: this.translate.instant('theme.' + mode),
      icon: 'pi ' + (active ? 'pi-check' : icons[mode]),
      // O visto sozinho, cinza como os ícones vizinhos, não se distingue: a ativa ganha acento.
      styleClass: active
        ? 'bg-app-accent-soft [&_.p-menu-item-label]:font-semibold [&_.p-menu-item-label]:text-app-accent [&_.p-menu-item-icon]:text-app-accent'
        : undefined,
      command: () => this.auth.saveThemePreference(mode),
    };
  }

  private navigateTo(path: string): void {
    this.userMenu?.hide();
    setTimeout(() => this.router.navigate([path]));
  }

  private logout(): void {
    this.userMenu?.hide();
    setTimeout(() => this.auth.logout());
  }

  getRoleLabel(): string {
    // No logout o AuthService limpa currentUser antes de o redirect resolver — sem perfil,
    // devolver '' esconde a linha em vez de mostrar a chave i18n crua.
    const role = this.auth.userRole();
    return role ? this.translate.instant('roles.' + role) : '';
  }

  ngOnInit() {
    if (this.auth.userRole() !== 'PLATFORM_ADMIN') this.laundryFeature.ensureLoaded();
  }

  ngAfterViewInit(): void {
    // Altura da janela, recolher/expandir e itens que chegam depois (lavanderia, IA) mudam o overflow
    // sem nenhum evento de scroll: observar a caixa visível e o conteúdo cobre os três.
    const nav = this.navScroll?.nativeElement;
    if (!nav || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => this.updateFades());
    observer.observe(nav);
    if (this.navContent) observer.observe(this.navContent.nativeElement);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }

  updateFades(): void {
    const el = this.navScroll?.nativeElement;
    if (!el) return;
    const hasOverflow = el.scrollHeight > el.clientHeight + 1;
    this.fadeTop.set(hasOverflow && el.scrollTop > 1);
    this.fadeBottom.set(hasOverflow && el.scrollTop + el.clientHeight < el.scrollHeight - 1);
  }
}
