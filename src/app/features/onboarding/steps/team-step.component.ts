import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import { Quota, SubscriptionService } from '../../../core/services/subscription.service';
import { TenantInvitation, TenantUserService } from '../../../core/services/tenant-user.service';
import { UserRole } from '../../../core/models/user.model';
import { translateRole } from '../../../shared/pipes/role-label.pipe';
import { OnboardingFooterComponent } from '../onboarding-footer.component';

/**
 * Perfis convidáveis por email — os administrativos. Técnico e lavandaria nascem noutras telas
 * (Técnicos / Lavandarias) e contam no outro teto do plano, por isso aqui só se explicam.
 */
const INVITABLE_ROLES: UserRole[] = ['ADMIN', 'COMMERCIAL', 'OPERATOR', 'FINANCE'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Passo 4 — fecho e equipe. Abre com o que falta para o primeiro orçamento (serviço ativo e
 * cliente), para o dono saber se já pode orçar, e mostra os dois tetos do plano (administrativos e técnicos) e o que resta de
 * cada um antes de o dono convidar, para não convidar dez pessoas para dois lugares. O convite em
 * si continua a ser o mesmo fluxo de Administração > Equipe — este passo só o antecipa.
 */
@Component({
  selector: 'app-onboarding-team-step',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, ButtonModule, InputTextModule, SelectModule, OnboardingFooterComponent],
  template: `
    <div class="flex flex-col flex-1">
      <div class="rounded-lg border p-4 mb-6"
           [class.bg-app-accent-soft]="ready()" [class.border-app-accent-border]="ready()"
           [class.bg-app-surface]="!ready()" [class.border-app-border]="!ready()">
        <p class="text-sm font-semibold text-app-text mb-2">
          {{ (ready() ? 'onboarding.team.readyTitle' : 'onboarding.team.notReadyTitle') | translate }}
        </p>
        <ul class="space-y-1.5">
          @for (item of checklist(); track item.key) {
            <li class="flex items-center gap-2 text-sm">
              @if (item.done) {
                <i class="pi pi-check-circle text-app-success" aria-hidden="true"></i>
                <span class="text-app-text">{{ item.labelKey | translate }}</span>
              } @else {
                <i class="pi pi-circle text-app-text-tertiary" aria-hidden="true"></i>
                <span class="text-app-text-secondary">{{ item.labelKey | translate }}</span>
                <button type="button" class="text-xs underline text-app-text-secondary hover:text-app-text"
                        (click)="goStep.emit(item.step)">{{ 'onboarding.team.fix' | translate }}</button>
              }
            </li>
          }
        </ul>
      </div>

      <p class="text-sm text-app-text-secondary mb-4">{{ 'onboarding.team.explain' | translate }}</p>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <div class="rounded-lg border border-app-border bg-app-surface p-4">
          <p class="text-[11px] font-medium uppercase tracking-wide text-app-text-tertiary">{{ 'onboarding.team.adminSeats' | translate }}</p>
          <p class="text-2xl font-medium text-app-text mt-1">
            {{ adminQuota().used }}<span class="text-sm text-app-text-tertiary"> / {{ limitLabel(adminQuota()) }}</span>
          </p>
          <p class="text-xs mt-1" [class.text-app-warning]="adminRemaining() === 0" [class.text-app-text-tertiary]="adminRemaining() !== 0">
            {{ remainingLabel(adminRemaining()) }}
          </p>
          <p class="text-xs text-app-text-tertiary mt-2">{{ 'onboarding.team.adminSeatsHint' | translate }}</p>
        </div>
        <div class="rounded-lg border border-app-border bg-app-surface p-4">
          <p class="text-[11px] font-medium uppercase tracking-wide text-app-text-tertiary">{{ 'onboarding.team.fieldSeats' | translate }}</p>
          <p class="text-2xl font-medium text-app-text mt-1">
            {{ fieldQuota().used }}<span class="text-sm text-app-text-tertiary"> / {{ limitLabel(fieldQuota()) }}</span>
          </p>
          <p class="text-xs mt-1" [class.text-app-warning]="fieldRemaining() === 0" [class.text-app-text-tertiary]="fieldRemaining() !== 0">
            {{ remainingLabel(fieldRemaining()) }}
          </p>
          <p class="text-xs text-app-text-tertiary mt-2">
            {{ 'onboarding.team.fieldSeatsHint' | translate }}
            <a routerLink="/providers" class="underline hover:text-app-text">{{ 'onboarding.team.fieldSeatsLink' | translate }}</a>
          </p>
        </div>
      </div>

      <h3 class="text-sm font-semibold text-app-text mb-2">{{ 'onboarding.team.inviteTitle' | translate }}</h3>
      @if (adminAtLimit()) {
        <p class="text-xs text-app-warning mb-3">
          <i class="pi pi-lock mr-1" aria-hidden="true"></i>{{ 'onboarding.team.adminFull' | translate }}
        </p>
      } @else {
        <form [formGroup]="form" (ngSubmit)="invite()" class="grid grid-cols-1 sm:grid-cols-[1fr_12rem_auto] gap-3 items-end">
          <div>
            <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'common.email' | translate }}</label>
            <input pInputText formControlName="email" [placeholder]="'tenantUsers.emailPlaceholder' | translate" fluid />
          </div>
          <div>
            <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'tenantUsers.role' | translate }}</label>
            <p-select formControlName="role" [options]="roleOptions" optionLabel="label" optionValue="value"
                      appendTo="body" fluid [placeholder]="'tenantUsers.rolePlaceholder' | translate"></p-select>
          </div>
          <p-button type="submit" [label]="'tenantUsers.invite' | translate" icon="pi pi-send"
                    [loading]="inviting()" [disabled]="!canInvite()"></p-button>
        </form>
      }

      @if (pending().length) {
        <ul class="mt-4 space-y-1.5" [attr.aria-label]="'onboarding.team.pendingLabel' | translate">
          @for (inv of pending(); track inv.id) {
            <li class="flex items-center justify-between gap-3 text-sm rounded-md bg-app-surface px-3 py-2">
              <span class="truncate text-app-text">{{ inv.email }}</span>
              <span class="text-xs text-app-text-tertiary shrink-0">{{ roleLabel(inv.role) }}</span>
            </li>
          }
        </ul>
      }

      <div class="flex-1"></div>
      <app-onboarding-footer [label]="ready() ? 'onboarding.finishAndQuote' : 'onboarding.finish'" icon="pi pi-check" (back)="back.emit()" (primary)="finish.emit()"></app-onboarding-footer>
    </div>
  `,
})
export class OnboardingTeamStepComponent implements OnInit {
  private tenantUserService = inject(TenantUserService);
  private subscriptionService = inject(SubscriptionService);
  private messageService = inject(MessageService);
  private translate = inject(TranslateService);

  hasService = input(false);
  hasCustomer = input(false);
  finish = output<void>();
  /** Índice do passo a que o dono quer voltar para completar o que falta. */
  goStep = output<number>();
  back = output<void>();

  readonly roleOptions = INVITABLE_ROLES.map(role => ({ label: translateRole(this.translate, role), value: role }));

  form = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    role: new FormControl<UserRole | null>(null, Validators.required),
  });
  private readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  invitations = signal<TenantInvitation[]>([]);
  inviting = signal(false);

  private me = this.subscriptionService.me;
  adminQuota = computed<Quota>(() => this.me()?.usage.adminUsers ?? { used: 0, limit: -1 });
  fieldQuota = computed<Quota>(() => this.me()?.usage.fieldUsers ?? { used: 0, limit: -1 });
  adminAtLimit = computed(() => !this.subscriptionService.hasQuota(this.adminQuota()));
  adminRemaining = computed(() => this.remaining(this.adminQuota()));
  fieldRemaining = computed(() => this.remaining(this.fieldQuota()));
  ready = computed(() => this.hasService() && this.hasCustomer());
  checklist = computed(() => [
    { key: 'service', done: this.hasService(), labelKey: 'onboarding.team.checkService', step: 1 },
    { key: 'customer', done: this.hasCustomer(), labelKey: 'onboarding.team.checkCustomer', step: 2 },
  ]);
  pending = computed(() => this.invitations().filter(i => i.status === 'PENDING'));
  canInvite = computed(() => {
    const { email, role } = this.formValue();
    return !!role && EMAIL_RE.test((email ?? '').trim()) && !this.adminAtLimit() && !this.inviting();
  });

  ngOnInit(): void {
    this.subscriptionService.getMe().subscribe();
    this.loadInvitations();
  }

  private loadInvitations(): void {
    this.tenantUserService.listInvitations().subscribe({ next: list => this.invitations.set(list), error: () => {} });
  }

  /** {@code null} quando o plano não tem teto. */
  private remaining(quota: Quota): number | null {
    return quota.limit === -1 ? null : Math.max(quota.limit - quota.used, 0);
  }

  limitLabel(quota: Quota): string | number {
    return quota.limit === -1 ? this.translate.instant('subscription.usage.unlimited') : quota.limit;
  }

  remainingLabel(remaining: number | null): string {
    if (remaining === null) return this.translate.instant('onboarding.team.noCap');
    return this.translate.instant('onboarding.team.remaining', { count: remaining });
  }

  roleLabel(role: UserRole): string {
    return translateRole(this.translate, role);
  }

  invite(): void {
    if (!this.canInvite()) return;
    const { email, role } = this.form.getRawValue();
    const trimmed = email.trim();
    this.inviting.set(true);
    this.tenantUserService.invite({ email: trimmed, role: role! }).subscribe({
      next: () => {
        this.inviting.set(false);
        this.form.reset({ email: '', role: null });
        this.messageService.add({ severity: 'success', summary: this.translate.instant('tenantUsers.invited', { email: trimmed }) });
        this.subscriptionService.getMe().subscribe();
        this.loadInvitations();
      },
      error: (err: HttpErrorResponse) => {
        this.inviting.set(false);
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('tenantUsers.inviteError'),
          detail: err.error?.detail,
        });
      },
    });
  }
}
