import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { MessageService } from 'primeng/api';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { SidebarComponent } from './sidebar/sidebar.component';
import { TopbarComponent } from './topbar/topbar.component';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ProgressBarModule } from 'primeng/progressbar';
import { ButtonModule } from 'primeng/button';
import { NotificationService } from '../core/services/notification.service';
import { renderNotificationText } from '../shared/utils/notification-text';
import { CustomerImportService, ImportJobStatus } from '../core/services/customer-import.service';
import { PaywallModalComponent } from '../shared/components/paywall-modal/paywall-modal.component';

/** Preferência deste navegador (conveniência por dispositivo, não dado da conta). */
const SIDEBAR_COLLAPSED_KEY = 'so_sidebar_collapsed';

const TERMINAL_IMPORT_STATUSES: ImportJobStatus[] = ['COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED'];

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, TranslatePipe, SidebarComponent, TopbarComponent, ToastModule, ConfirmDialogModule,
    ProgressBarModule, ButtonModule, PaywallModalComponent],
  template: `
    <div class="flex h-screen overflow-hidden bg-app-surface">
      <!-- Sidebar desktop -->
      <div class="hidden lg:flex shrink-0">
        <app-sidebar [collapsed]="sidebarCollapsed()" [collapsible]="true"
                     (collapsedChange)="setSidebarCollapsed($event)"></app-sidebar>
      </div>

      <!-- Mobile sidebar overlay -->
      @if (mobileSidebarOpen()) {
        <div class="lg:hidden fixed inset-0 z-50 flex">
          <div class="fixed inset-0 bg-[var(--app-scrim)]" (click)="mobileSidebarOpen.set(false)"></div>
          <div class="relative z-10 shrink-0">
            <app-sidebar [collapsed]="false"></app-sidebar>
          </div>
        </div>
      }

      <!-- Main content -->
      <div class="flex-1 flex flex-col min-w-0 overflow-hidden">
        <app-topbar (menuToggle)="mobileSidebarOpen.set(true)"></app-topbar>

        <main class="relative flex-1 overflow-y-auto">
          <div class="max-w-[1400px] mx-auto px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
            <router-outlet></router-outlet>
          </div>
        </main>
      </div>
    </div>

    <p-toast position="top-right"></p-toast>
    <p-confirmDialog [style]="{ width: '26rem' }"></p-confirmDialog>
    <p-confirmDialog key="session-expired" [style]="{ width: '26rem' }" [closable]="false"
                     [closeOnEscape]="false" [dismissableMask]="false"></p-confirmDialog>
    <app-paywall-modal></app-paywall-modal>

    <!-- Área persistente de progresso da importação de clientes (rework issue #35): vive no
         layout, não numa rota, por isso sobrevive a navegação — e o próprio serviço restaura o
         job ativo do localStorage no arranque, por isso sobrevive a um refresh também. -->
    @if (importJob(); as job) {
      <div class="fixed bottom-4 right-4 z-50 w-80 rounded-lg border border-app-border bg-app-bg p-4 space-y-2">
        <div class="flex items-start justify-between gap-2">
          <p class="text-sm font-medium text-app-text">{{ 'customers.import.tray.title' | translate }}</p>
          <button type="button" class="text-app-text-tertiary hover:text-app-text" (click)="dismissImportTray()"
                  [attr.aria-label]="'customers.import.tray.dismiss' | translate">
            <i class="pi pi-times text-xs"></i>
          </button>
        </div>
        <p class="text-xs text-app-text-secondary truncate">{{ job.fileName }}</p>
        <p-progressbar [value]="job.progress" [showValue]="true" class="h-2"></p-progressbar>
        <p class="text-xs text-app-text-secondary">
          {{ 'customers.import.tray.progress' | translate:{ processed: job.processedRows, total: job.totalRows } }}
        </p>
        <div class="flex items-center justify-between text-xs">
          <span class="text-app-success">{{ 'customers.import.tray.imported' | translate:{ count: job.importedRows } }}</span>
          @if (job.errorRows > 0) {
            <span class="text-app-danger">{{ 'customers.import.tray.errors' | translate:{ count: job.errorRows } }}</span>
          }
        </div>
        <div class="flex justify-end">
          <a [routerLink]="['/customers/imports', job.id]" class="text-xs text-app-accent-hover underline"
             (click)="dismissImportTray()">
            {{ 'customers.import.tray.viewDetails' | translate }}
          </a>
        </div>
      </div>
    }
  `
})
export class LayoutComponent {
  private notifService = inject(NotificationService);
  private customerImportService = inject(CustomerImportService);
  private messageService = inject(MessageService);
  private translate = inject(TranslateService);
  private destroyRef = inject(DestroyRef);
  private router = inject(Router);

  sidebarCollapsed = signal(readSidebarCollapsed());
  mobileSidebarOpen = signal(false);

  importJob = this.customerImportService.activeJob;

  private lastNotifiedImportId: string | null = null;

  constructor() {

    // Surface each SSE-pushed notification as a toast, wherever the user is in the app — the
    // bell/list only update for someone already on /notifications, and reads should feel
    // real-time everywhere, not just there.
    const sub = this.notifService.notificationReceived$.subscribe(notif => {
      const text = renderNotificationText(notif, this.translate, this.translate.getCurrentLang());
      this.messageService.add({
        severity: notif.severity === 'CRITICAL' ? 'error' : notif.severity === 'HIGH' ? 'warn' : 'info',
        summary: text.title,
        detail: text.body,
        life: 6000,
      });
    });
    this.destroyRef.onDestroy(() => sub.unsubscribe());

    // A gaveta do mobile fecha-se quando a navegação termina, não no clique: destruí-la no clique
    // aborta a view transition do router e a página nunca chega a mudar.
    const navSub = this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) this.mobileSidebarOpen.set(false);
    });
    this.destroyRef.onDestroy(() => navSub.unsubscribe());

    // Não um spinner até acabar (issue #35 rework §16): toast dedicado assim que o job chega a
    // um estado terminal, uma vez só por job (marcado por id, não por status — vários updates
    // no mesmo estado terminal não repetem o toast).
    effect(() => {
      const job = this.importJob();
      if (!job || !TERMINAL_IMPORT_STATUSES.includes(job.status) || this.lastNotifiedImportId === job.id) {
        return;
      }
      this.lastNotifiedImportId = job.id;
      if (job.status === 'FAILED') {
        this.messageService.add({ severity: 'error', summary: this.translate.instant('customers.import.notify.failed') });
      } else if (job.status === 'COMPLETED_WITH_ERRORS') {
        this.messageService.add({
          severity: 'warn',
          summary: this.translate.instant('customers.import.notify.partial', { imported: job.importedRows, errors: job.errorRows }),
        });
      } else if (job.status === 'COMPLETED') {
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('customers.import.notify.success', { imported: job.importedRows }),
        });
      }
    });
  }

  setSidebarCollapsed(collapsed: boolean): void {
    this.sidebarCollapsed.set(collapsed);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
    } catch {
      // Armazenamento bloqueado (janela privada, política do navegador): vale só para esta sessão.
    }
  }

  dismissImportTray(): void {
    this.customerImportService.dismiss();
  }
}

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}
