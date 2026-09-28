import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { Panel } from 'primeng/panel';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { finalize } from 'rxjs/operators';
import { WhatsAppBusinessService, WhatsAppConnection, WhatsAppConnectionStatus } from '../../../core/services/whatsapp-business.service';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

/**
 * Configurações → Integrações → WhatsApp Business. Cada tenant autoriza o SuaOperacao a operar o
 * seu próprio WhatsApp Business pelo Embedded Signup da Meta (CLAUDE.md §9A) — nada de token, PIN
 * ou id técnico aparece aqui, só o número, o nome verificado e o estado da ligação. "Não
 * conectado" é ausência de dado, não um card vazio.
 */
@Component({
  selector: 'app-whatsapp-business',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslatePipe, ButtonModule, TagModule, ToastModule, Panel, ConfirmDialogModule,
    PageHeaderComponent, EmptyStateComponent],
  providers: [ConfirmationService],
  template: `
    <p-toast></p-toast>
    <p-confirmDialog></p-confirmDialog>

    <div class="max-w-2xl space-y-6">
      <app-page-header [title]="'whatsappBusiness.title' | translate" [description]="'whatsappBusiness.subtitle' | translate"
                       [breadcrumb]="[{ label: 'nav.administration' | translate, route: '/administration' }]"></app-page-header>

      @if (loading()) {
        <p-panel><div class="animate-pulse h-24"></div></p-panel>
      } @else if (connection(); as conn) {
        @if (!conn.available) {
          <p-panel>
            <p class="text-sm text-app-text-secondary">{{ 'whatsappBusiness.unavailable' | translate }}</p>
          </p-panel>
        } @else if (conn.status === 'NOT_CONNECTED') {
          <p-panel>
            <app-empty-state
              icon="pi pi-whatsapp"
              [message]="'whatsappBusiness.notConnected.title' | translate"
              [subtitle]="'whatsappBusiness.notConnected.description' | translate"
              [actionLabel]="'whatsappBusiness.notConnected.connect' | translate"
              (actionClick)="connect()"></app-empty-state>
          </p-panel>
        } @else {
          <p-panel>
            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium text-app-text">{{ 'whatsappBusiness.status.label' | translate }}</span>
                <p-tag [value]="statusLabel()" [severity]="statusSeverity()"></p-tag>
              </div>

              @if (conn.displayPhoneNumber) {
                <div class="flex items-center justify-between text-sm">
                  <span class="text-app-text-tertiary">{{ 'whatsappBusiness.connectedNumber' | translate }}</span>
                  <span class="text-app-text font-medium">{{ conn.displayPhoneNumber }}</span>
                </div>
              }
              @if (conn.verifiedName) {
                <div class="flex items-center justify-between text-sm">
                  <span class="text-app-text-tertiary">{{ 'whatsappBusiness.accountName' | translate }}</span>
                  <span class="text-app-text font-medium">{{ conn.verifiedName }}</span>
                </div>
              }
              @if (conn.connectedAt) {
                <div class="flex items-center justify-between text-sm">
                  <span class="text-app-text-tertiary">{{ 'whatsappBusiness.connectedSince' | translate }}</span>
                  <span class="text-app-text font-medium">{{ conn.connectedAt | date:'short' }}</span>
                </div>
              }
              @if (conn.statusReason) {
                <p class="text-sm text-app-text-secondary bg-app-surface-hover rounded-md p-3">
                  {{ 'whatsappBusiness.reason.' + conn.statusReason | translate }}
                </p>
              }

              <div class="flex gap-2 pt-2">
                @if (conn.status === 'PENDING_SETUP') {
                  <p-button [label]="'whatsappBusiness.actions.retry' | translate" icon="pi pi-refresh"
                            [loading]="acting()" (onClick)="retry()"></p-button>
                }
                @if (conn.status === 'ATTENTION_REQUIRED' || conn.status === 'ERROR' || conn.status === 'DISCONNECTED') {
                  <p-button [label]="'whatsappBusiness.actions.reconnect' | translate" icon="pi pi-whatsapp"
                            [loading]="acting()" (onClick)="connect()"></p-button>
                }
                @if (conn.status !== 'DISCONNECTED') {
                  <p-button [label]="'whatsappBusiness.actions.disconnect' | translate" icon="pi pi-times" severity="danger"
                            [outlined]="true" [loading]="acting()" (onClick)="confirmDisconnect()"></p-button>
                }
              </div>
            </div>
          </p-panel>
        }
      }
    </div>
  `,
})
export class WhatsAppBusinessComponent implements OnInit {
  private whatsapp = inject(WhatsAppBusinessService);
  private confirmation = inject(ConfirmationService);
  private messageService = inject(MessageService);
  private translate = inject(TranslateService);

  loading = signal(true);
  acting = signal(false);
  connection = signal<WhatsAppConnection | null>(null);

  statusLabel = computed(() => {
    const status = this.connection()?.status ?? 'NOT_CONNECTED';
    return this.translate.instant('whatsappBusiness.status.' + status);
  });

  statusSeverity = computed<'success' | 'info' | 'warn' | 'danger'>(() => {
    const severities: Record<WhatsAppConnectionStatus, 'success' | 'info' | 'warn' | 'danger'> = {
      NOT_CONNECTED: 'info',
      CONNECTING: 'info',
      CONNECTED: 'success',
      PENDING_SETUP: 'warn',
      ATTENTION_REQUIRED: 'warn',
      ERROR: 'danger',
      DISCONNECTED: 'danger',
    };
    return severities[this.connection()?.status ?? 'NOT_CONNECTED'];
  });

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.whatsapp.getConnection()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: connection => this.connection.set(connection),
        error: () => this.messageService.add({ severity: 'error', summary: this.translate.instant('whatsappBusiness.errors.startFailed') }),
      });
  }

  connect(): void {
    this.acting.set(true);
    this.whatsapp.connect()
      .pipe(finalize(() => this.acting.set(false)))
      .subscribe({
        next: connection => {
          this.connection.set(connection);
          if (connection.status === 'CONNECTED') {
            this.messageService.add({ severity: 'success', summary: this.translate.instant('whatsappBusiness.connected') });
          }
        },
        error: error => this.handleSignupError(error),
      });
  }

  retry(): void {
    this.acting.set(true);
    this.whatsapp.retrySetup()
      .pipe(finalize(() => this.acting.set(false)))
      .subscribe({
        next: connection => this.connection.set(connection),
        error: () => this.messageService.add({ severity: 'error', summary: this.translate.instant('whatsappBusiness.errors.retryFailed') }),
      });
  }

  confirmDisconnect(): void {
    this.confirmation.confirm({
      header: this.translate.instant('whatsappBusiness.disconnectConfirm.header'),
      message: this.translate.instant('whatsappBusiness.disconnectConfirm.message'),
      acceptLabel: this.translate.instant('whatsappBusiness.disconnectConfirm.accept'),
      rejectLabel: this.translate.instant('whatsappBusiness.disconnectConfirm.reject'),
      acceptButtonProps: { severity: 'danger' },
      accept: () => this.disconnect(),
    });
  }

  private disconnect(): void {
    this.acting.set(true);
    this.whatsapp.disconnect()
      .pipe(finalize(() => this.acting.set(false)))
      .subscribe({
        next: connection => {
          this.connection.set(connection);
          this.messageService.add({ severity: 'success', summary: this.translate.instant('whatsappBusiness.disconnected') });
        },
        error: () => this.messageService.add({ severity: 'error', summary: this.translate.instant('whatsappBusiness.errors.disconnectFailed') }),
      });
  }

  private handleSignupError(error: unknown): void {
    const code = error instanceof Error ? error.message : '';
    if (code === 'SIGNUP_CANCELLED' || code === 'SIGNUP_TIMEOUT') {
      // O tenant desistiu ou fechou a janela — não é falha do sistema, não mostra erro.
      return;
    }
    const key = code === 'META_SDK_UNAVAILABLE' ? 'whatsappBusiness.errors.sdkUnavailable' : 'whatsappBusiness.errors.completeFailed';
    this.messageService.add({ severity: 'error', summary: this.translate.instant(key) });
  }
}
