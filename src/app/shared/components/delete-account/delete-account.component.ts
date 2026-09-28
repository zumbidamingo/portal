import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { DialogModule } from 'primeng/dialog';
import { PanelModule } from 'primeng/panel';
import { AuthService } from '../../../core/auth/auth.service';
import { AccountDeletionImpact, AccountDeletionService } from '../../../core/services/account-deletion.service';

/**
 * Zona de perigo: exclusão da conta autenticada. Aqui só se pede, em dois passos — rever o que será
 * apagado e, no passo final, digitar o nome (da empresa, para o OWNER) e reconhecer que é permanente.
 * O backend repete as duas verificações e envia um link por email; a exclusão só é agendada (com
 * carência) quando o titular abre o link. Para o OWNER isto apaga também a empresa, por isso vive em
 * Administração para ele e em Meu Perfil para os restantes perfis.
 */
@Component({
  selector: 'app-delete-account',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe, ButtonModule, CheckboxModule, InputTextModule, DialogModule, PanelModule],
  template: `
    <p-panel [header]="'settings.dangerZone' | translate" class="block border border-app-danger/30 rounded-md">
      <p class="text-sm text-app-text-secondary mb-4">
        {{ (isOwner() ? 'settings.dangerDescOwner' : 'settings.dangerDesc') | translate }}
      </p>
      <p-button [label]="'settings.deleteAccount' | translate" icon="pi pi-trash" severity="danger"
                [outlined]="true" (click)="open()"></p-button>
    </p-panel>

    <p-dialog
      [(visible)]="showDialog"
      [modal]="true"
      [draggable]="false"
      [resizable]="false"
      [dismissableMask]="!sending()"
      [closable]="!sending()"
      [style]="{ width: 'min(34rem, calc(100vw - 2rem))' }"
      (onHide)="reset()">

      <ng-template pTemplate="header">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-8 h-8 rounded-lg bg-app-danger/10 flex items-center justify-center shrink-0">
            <i class="pi pi-trash text-app-danger text-sm" aria-hidden="true"></i>
          </div>
          <span class="text-base font-semibold text-app-text">
            {{ 'settings.deleteAccountTitle' | translate }}
          </span>
        </div>
      </ng-template>

      @if (sent()) {
        <div class="text-center py-2">
          <div class="w-14 h-14 rounded-full bg-app-accent-soft flex items-center justify-center mx-auto mb-4">
            <i class="pi pi-envelope text-app-accent-hover text-2xl" aria-hidden="true"></i>
          </div>
          <p class="text-base font-semibold text-app-text mb-2">{{ 'accountDeletion.sentTitle' | translate }}</p>
          <p class="text-sm text-app-text-secondary leading-relaxed" style="text-wrap: pretty">
            {{ 'accountDeletion.sentBody' | translate: { email: auth.currentUser()?.email } }}
          </p>
        </div>
      } @else if (step() === 'review') {
        <h2 class="text-lg font-bold text-app-text mb-1" style="text-wrap: balance">
          {{ (isOwner() ? 'accountDeletion.review.titleOwner' : 'accountDeletion.review.titleUser') | translate: { name: confirmationName() } }}
        </h2>
        <p class="text-sm text-app-text-secondary leading-relaxed mb-3" style="text-wrap: pretty">
          {{ (isOwner() ? 'accountDeletion.review.subtitleOwner' : 'accountDeletion.review.subtitleUser') | translate }}
        </p>

        @if (impact(); as i) {
          <div class="rounded-md border border-app-danger/30 bg-app-danger/10 px-3 py-2.5">
            <p class="text-xs font-semibold text-app-text mb-1.5">
              <i class="pi pi-exclamation-triangle text-app-danger mr-1" aria-hidden="true"></i>
              {{ (i.owner ? 'accountDeletion.impact.title' : 'accountDeletion.impact.titleUser') | translate }}
            </p>
            <ul class="text-xs text-app-text leading-relaxed list-disc pl-5 space-y-0.5">
              @if (i.owner) {
                <li>{{ 'accountDeletion.impact.company' | translate }}</li>
                @if (i.otherActiveUsers > 0) {
                  <li>{{ 'accountDeletion.impact.users' | translate: { count: i.otherActiveUsers } }}</li>
                }
                @if (i.openOrders > 0) {
                  <li>{{ 'accountDeletion.impact.orders' | translate: { count: i.openOrders } }}</li>
                }
                @if (i.unpaidInvoices > 0) {
                  <li>{{ 'accountDeletion.impact.invoices' | translate: { count: i.unpaidInvoices } }}</li>
                }
                @if (i.unpaidCommissions > 0) {
                  <li>{{ 'accountDeletion.impact.commissions' | translate: { count: i.unpaidCommissions } }}</li>
                }
                @if (i.activePaidSubscription) {
                  <li>{{ 'accountDeletion.impact.subscription' | translate }}</li>
                }
              } @else {
                <li>{{ 'accountDeletion.impact.personal' | translate }}</li>
                <li>{{ 'accountDeletion.impact.companyKept' | translate }}</li>
              }
            </ul>
          </div>

          @if (i.owner) {
            <!-- Transparência exigida pelo RGPD (Art. 13) e não só UX: guardamos um registo
                 pseudonimizado da concessão do trial que sobrevive à exclusão, e o utilizador tem de
                 saber disso antes de decidir. -->
            <div class="flex items-start gap-2 rounded-md border border-app-warning/30 bg-app-warning/10 px-3 py-2 mt-2">
              <i class="pi pi-info-circle text-app-warning text-sm mt-0.5 shrink-0" aria-hidden="true"></i>
              <p class="text-xs text-app-text leading-relaxed" style="text-wrap: pretty">
                {{ 'settings.deleteAccountTrialNotice' | translate }}
              </p>
            </div>
          }

          <p class="text-[11px] font-semibold uppercase tracking-wide text-app-text-secondary mt-4 mb-2">
            {{ 'accountDeletion.steps.title' | translate }}
          </p>
          <ol class="space-y-2">
            <li class="flex items-start gap-3">
              <span class="w-6 h-6 rounded-full border border-app-border bg-app-surface text-[11px] font-semibold text-app-text flex items-center justify-center shrink-0">1</span>
              <span class="text-xs text-app-text leading-relaxed pt-1" style="text-wrap: pretty">{{ 'accountDeletion.steps.s1' | translate }}</span>
            </li>
            <li class="flex items-start gap-3">
              <span class="w-6 h-6 rounded-full border border-app-border bg-app-surface text-[11px] font-semibold text-app-text flex items-center justify-center shrink-0">2</span>
              <span class="text-xs text-app-text leading-relaxed pt-1" style="text-wrap: pretty">{{ 'accountDeletion.steps.s2' | translate }}</span>
            </li>
            <li class="flex items-start gap-3">
              <span class="w-6 h-6 rounded-full border border-app-border bg-app-surface text-[11px] font-semibold text-app-text flex items-center justify-center shrink-0">3</span>
              <span class="text-xs text-app-text leading-relaxed pt-1" style="text-wrap: pretty">{{ 'accountDeletion.steps.s3' | translate: { days: i.graceDays } }}</span>
            </li>
          </ol>
        } @else {
          <p class="text-xs text-app-danger" role="alert">{{ 'accountDeletion.impact.loadError' | translate }}</p>
        }
      } @else {
        <h2 class="text-lg font-bold text-app-text mb-1">{{ 'accountDeletion.final.title' | translate }}</h2>
        <p class="text-sm text-app-text-secondary leading-relaxed mb-3" style="text-wrap: pretty">
          {{ (isOwner() ? 'accountDeletion.final.subtitleOwner' : 'accountDeletion.final.subtitleUser') | translate }}
        </p>

        <form [formGroup]="form" (ngSubmit)="send()" novalidate>
          <div class="flex items-center justify-between gap-2 rounded-md border border-app-border bg-app-surface px-3 py-2">
            <code class="flex-1 min-w-0 truncate text-sm font-mono text-app-text">{{ confirmationName() }}</code>
            <button
              type="button"
              class="shrink-0 rounded p-1.5 text-app-text-secondary transition-colors hover:bg-app-surface-hover hover:text-app-text focus:outline-none focus-visible:ring-2 focus-visible:ring-app-danger"
              [attr.aria-label]="(copied() ? 'settings.deleteAccountCopied' : 'settings.deleteAccountCopyName') | translate"
              [title]="'settings.deleteAccountCopyName' | translate"
              (click)="copyName()">
              <i class="pi" [class]="copied() ? 'pi-check text-app-success' : 'pi-copy'" aria-hidden="true"></i>
            </button>
          </div>
          <span class="sr-only" role="status" aria-live="polite">{{ copied() ? ('settings.deleteAccountCopied' | translate) : '' }}</span>

          <div class="mt-4">
            <label for="deleteConfirmInput" class="block text-[11px] font-medium text-app-text-secondary mb-1.5">
              {{ 'settings.deleteAccountTypeToConfirm' | translate: { name: confirmationName() } }}
            </label>
            <input
              pInputText
              id="deleteConfirmInput"
              type="text"
              class="w-full"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              formControlName="confirmText" />
          </div>

          <div class="flex items-start gap-2.5 mt-4">
            <p-checkbox formControlName="acknowledged" [binary]="true" inputId="deleteAckInput" class="mt-0.5"></p-checkbox>
            <label for="deleteAckInput" class="text-xs text-app-text leading-relaxed cursor-pointer" style="text-wrap: pretty">
              {{ (isOwner() ? 'accountDeletion.final.ackOwner' : 'accountDeletion.final.ackUser') | translate }}
            </label>
          </div>

          @if (errorKey(); as key) {
            <small class="text-app-danger block mt-3" role="alert">{{ key | translate }}</small>
          }
        </form>
      }

      <ng-template pTemplate="footer">
        <div class="flex gap-2 justify-end">
          @if (sent()) {
            <p-button [label]="'common.close' | translate" severity="secondary" [outlined]="true"
                      (onClick)="showDialog = false"></p-button>
          } @else if (step() === 'review') {
            <p-button
              [label]="'settings.deleteAccountReject' | translate"
              severity="secondary"
              [outlined]="true"
              (onClick)="showDialog = false">
            </p-button>
            <p-button
              [label]="'accountDeletion.review.continue' | translate"
              icon="pi pi-arrow-right"
              iconPos="right"
              severity="danger"
              [disabled]="!impact()"
              (onClick)="goToFinal()">
            </p-button>
          } @else {
            <p-button
              [label]="'accountDeletion.final.back' | translate"
              severity="secondary"
              [outlined]="true"
              [disabled]="sending()"
              (onClick)="step.set('review')">
            </p-button>
            <p-button
              [label]="'accountDeletion.sendEmail' | translate"
              icon="pi pi-envelope"
              severity="danger"
              [loading]="sending()"
              [disabled]="sending() || !canSend()"
              (onClick)="send()">
            </p-button>
          }
        </div>
      </ng-template>
    </p-dialog>
  `,
})
export class DeleteAccountComponent implements OnInit {
  protected auth = inject(AuthService);
  private accountDeletion = inject(AccountDeletionService);

  showDialog = false;
  step = signal<'review' | 'final'>('review');
  copied = signal(false);
  sending = signal(false);
  sent = signal(false);
  errorKey = signal<string | null>(null);
  impact = signal<AccountDeletionImpact | null>(null);

  form = new FormGroup({
    confirmText: new FormControl('', { nonNullable: true }),
    acknowledged: new FormControl(false, { nonNullable: true }),
  });

  isOwner = computed(() => this.auth.userRole() === 'OWNER');
  /** O que se digita: vem do backend, que o valida — empresa para o OWNER, nome da conta nos demais. */
  confirmationName = computed(() => this.impact()?.confirmationName ?? this.auth.currentUser()?.name ?? '');

  ngOnInit(): void {
    // Sem isto o aviso "o que será apagado" só chegaria depois de abrir o diálogo.
    this.loadImpact();
  }

  private loadImpact(): void {
    this.accountDeletion.impact().subscribe({
      next: impact => this.impact.set(impact),
      error: () => this.impact.set(null),
    });
  }

  open(): void {
    this.reset();
    this.loadImpact();
    this.showDialog = true;
  }

  reset(): void {
    this.form.reset({ confirmText: '', acknowledged: false });
    this.step.set('review');
    this.copied.set(false);
    this.errorKey.set(null);
    this.sent.set(false);
  }

  goToFinal(): void {
    if (!this.impact()) return;
    this.errorKey.set(null);
    this.step.set('final');
  }

  canSend(): boolean {
    const { confirmText, acknowledged } = this.form.getRawValue();
    return !!this.confirmationName() && confirmText.trim() === this.confirmationName() && acknowledged;
  }

  copyName(): void {
    const name = this.confirmationName();
    if (!name || !navigator.clipboard) return;
    navigator.clipboard.writeText(name).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }).catch(() => this.errorKey.set('settings.deleteAccountCopyError'));
  }

  send(): void {
    if (!this.canSend() || this.sending()) return;
    this.sending.set(true);
    this.errorKey.set(null);
    this.accountDeletion.request(this.form.getRawValue().confirmText.trim(), true).subscribe({
      next: () => {
        this.sending.set(false);
        this.sent.set(true);
      },
      error: (err: HttpErrorResponse) => {
        this.sending.set(false);
        this.errorKey.set(this.errorKeyFor(err));
      },
    });
  }

  private errorKeyFor(err: HttpErrorResponse): string {
    if (err.status === 429) return 'accountDeletion.error.rateLimited';
    switch (err.error?.errorCode) {
      case 'ACCOUNT_NAME_MISMATCH': return 'accountDeletion.error.nameMismatch';
      case 'ACCOUNT_ALREADY_SCHEDULED': return 'accountDeletion.error.alreadyScheduled';
      case 'DELETION_NOT_ACKNOWLEDGED': return 'accountDeletion.error.notAcknowledged';
      default: return 'settings.deleteAccountError';
    }
  }
}
