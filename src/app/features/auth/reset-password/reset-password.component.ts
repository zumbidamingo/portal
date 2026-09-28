import { Component, inject, signal, OnInit } from '@angular/core';
import { FormBuilder, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { PasswordModule } from 'primeng/password';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { LandingLinksService } from '../../../core/services/landing-links.service';
import { BrandLogoComponent } from '../../../shared/components/brand-logo/brand-logo.component';

type TokenState = 'validating' | 'valid' | 'expired' | 'used' | 'invalid';

function passwordsMatch(control: AbstractControl): ValidationErrors | null {
  const pw = control.get('newPassword')?.value;
  const confirm = control.get('confirmPassword')?.value;
  return pw && confirm && pw !== confirm ? { passwordMismatch: true } : null;
}

@Component({
  selector: 'app-reset-password',
  standalone: true,
  providers: [MessageService],
  imports: [BrandLogoComponent, CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe,
            ButtonModule, PasswordModule, ToastModule],
  template: `
    <p-toast position="top-right"></p-toast>

    <div class="min-h-screen relative overflow-hidden flex items-center justify-center p-4 lg:p-12 bg-app-surface">

      <div class="absolute -top-40 -right-40 w-[520px] h-[520px] rounded-full bg-app-accent-soft/70 blur-3xl pointer-events-none"></div>
      <div class="absolute -bottom-56 -left-56 w-[440px] h-[440px] rounded-full bg-app-accent-soft/50 blur-3xl pointer-events-none"></div>

      <div class="w-full max-w-5xl flex items-center gap-12 lg:gap-20 relative z-10">

        <!-- Left branding panel — desktop only -->
        <div class="hidden lg:flex flex-col gap-10 flex-1">
          <a [href]="homeUrl" target="_self" [attr.aria-label]="'auth.backToHome' | translate"
             class="flex w-fit items-center gap-3 rounded-xl transition-opacity duration-150 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent focus-visible:ring-offset-2">
            <app-brand-logo variant="wordmark" [size]="34" />
          </a>
          <div class="space-y-4 max-w-xs">
            <h1 class="text-5xl font-bold leading-[1.1] text-app-text" style="text-wrap: balance">
              {{ 'auth.resetPasswordHeroTitle' | translate }}
            </h1>
            <p class="text-app-text-secondary text-base font-medium leading-snug">
              {{ 'auth.resetPasswordHeroSubtitle' | translate }}
            </p>
          </div>
        </div>

        <!-- Card -->
        <div class="bg-app-bg border border-app-border rounded-xl w-full lg:max-w-md p-8 lg:p-10 flex-shrink-0">

          <!-- Mobile logo -->
          <a [href]="homeUrl" target="_self" [attr.aria-label]="'auth.backToHome' | translate"
             class="flex w-fit mx-auto items-center justify-center gap-2 mb-6 lg:hidden rounded-lg transition-opacity duration-150 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent focus-visible:ring-offset-2">
            <app-brand-logo variant="wordmark" [size]="28" />
          </a>

          <!-- VALIDATING -->
          @if (tokenState() === 'validating') {
            <div class="text-center py-8">
              <i class="pi pi-spin pi-spinner text-app-accent-hover text-3xl mb-4 block"></i>
              <p class="text-app-text-secondary text-sm">{{ 'auth.tokenValidating' | translate }}</p>
            </div>
          }

          <!-- VALID → show form -->
          @if (tokenState() === 'valid' && !done()) {
            <div class="text-center mb-8">
              <div class="w-12 h-12 bg-app-accent-soft rounded-xl flex items-center justify-center mx-auto mb-4">
                <i class="pi pi-key text-app-accent-hover text-xl"></i>
              </div>
              <h2 class="text-2xl font-bold text-app-text">{{ 'auth.resetPasswordFormTitle' | translate }}</h2>
              <p class="text-app-text-secondary text-sm mt-1.5">{{ 'auth.resetPasswordFormSubtitle' | translate }}</p>
            </div>

            <form [formGroup]="form" (ngSubmit)="onSubmit()" class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-app-text mb-1">{{ 'auth.newPassword' | translate }}</label>
                <p-password formControlName="newPassword" [feedback]="true" [toggleMask]="true"
                            fluid inputStyleClass="w-full"
                            [placeholder]="'auth.newPassword' | translate"
                            [class.p-invalid]="form.get('newPassword')?.invalid && form.get('newPassword')?.touched">
                </p-password>
                @if (form.get('newPassword')?.errors?.['minlength'] && form.get('newPassword')?.touched) {
                  <small class="text-app-danger text-xs mt-1 block">{{ 'errors.minLength' | translate: { min: 8 } }}</small>
                }
              </div>

              <div>
                <label class="block text-sm font-medium text-app-text mb-1">{{ 'auth.confirmPassword' | translate }}</label>
                <p-password formControlName="confirmPassword" [feedback]="false" [toggleMask]="true"
                            fluid inputStyleClass="w-full"
                            [placeholder]="'auth.confirmPassword' | translate"
                            [class.p-invalid]="form.errors?.['passwordMismatch'] && form.get('confirmPassword')?.touched">
                </p-password>
                @if (form.errors?.['passwordMismatch'] && form.get('confirmPassword')?.touched) {
                  <small class="text-app-danger text-xs mt-1 block">{{ 'errors.passwordMismatch' | translate }}</small>
                }
              </div>

              <p-button type="submit" [label]="'auth.resetPasswordSubmit' | translate" fluid
                        [loading]="loading()" [disabled]="form.invalid"></p-button>
            </form>
          }

          <!-- SUCCESS -->
          @if (done()) {
            <div class="text-center py-4">
              <div class="w-16 h-16 bg-app-success/10 rounded-full flex items-center justify-center mx-auto mb-5">
                <i class="pi pi-check text-app-success text-2xl"></i>
              </div>
              <p class="text-app-text font-semibold text-lg">{{ 'auth.passwordResetSuccess' | translate }}</p>
              <p class="text-app-text-secondary text-sm mt-2 leading-relaxed">{{ 'auth.passwordResetSuccessDesc' | translate }}</p>
            </div>
          }

          <!-- EXPIRED -->
          @if (tokenState() === 'expired') {
            <div class="text-center py-4">
              <div class="w-16 h-16 bg-app-warning/10 rounded-full flex items-center justify-center mx-auto mb-5">
                <i class="pi pi-clock text-app-warning text-2xl"></i>
              </div>
              <p class="text-app-text font-semibold text-lg">{{ 'auth.tokenExpiredTitle' | translate }}</p>
              <p class="text-app-text-secondary text-sm mt-2 leading-relaxed max-w-xs mx-auto">{{ 'auth.tokenExpiredDesc' | translate }}</p>
              <p-button [label]="'auth.requestNewLink' | translate" styleClass="w-full mt-6"
                        routerLink="/auth/forgot-password"></p-button>
            </div>
          }

          <!-- USED -->
          @if (tokenState() === 'used') {
            <div class="text-center py-4">
              <div class="w-16 h-16 bg-app-surface-hover rounded-full flex items-center justify-center mx-auto mb-5">
                <i class="pi pi-check-circle text-app-text-tertiary text-2xl"></i>
              </div>
              <p class="text-app-text font-semibold text-lg">{{ 'auth.tokenUsedTitle' | translate }}</p>
              <p class="text-app-text-secondary text-sm mt-2 leading-relaxed max-w-xs mx-auto">{{ 'auth.tokenUsedDesc' | translate }}</p>
              <p-button [label]="'auth.requestNewLink' | translate" styleClass="w-full mt-6"
                        routerLink="/auth/forgot-password"></p-button>
            </div>
          }

          <!-- INVALID -->
          @if (tokenState() === 'invalid') {
            <div class="text-center py-4">
              <div class="w-16 h-16 bg-app-danger/10 rounded-full flex items-center justify-center mx-auto mb-5">
                <i class="pi pi-times-circle text-app-danger text-2xl"></i>
              </div>
              <p class="text-app-text font-semibold text-lg">{{ 'auth.tokenInvalidTitle' | translate }}</p>
              <p class="text-app-text-secondary text-sm mt-2 leading-relaxed max-w-xs mx-auto">{{ 'auth.tokenInvalidDesc' | translate }}</p>
              <p-button [label]="'auth.requestNewLink' | translate" styleClass="w-full mt-6"
                        routerLink="/auth/forgot-password"></p-button>
            </div>
          }

          @if (!done()) {
            <p class="text-center text-sm text-app-text-secondary mt-6">
              <a routerLink="/auth/login"
                 class="text-app-accent-hover font-semibold hover:underline transition-colors duration-150 inline-flex items-center gap-1">
                <i class="pi pi-arrow-left text-xs"></i>{{ 'auth.backToLogin' | translate }}
              </a>
            </p>
          }
        </div>
      </div>
    </div>
  `
})
export class ResetPasswordComponent implements OnInit {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private messageService = inject(MessageService);
  private translate = inject(TranslateService);

  readonly homeUrl = inject(LandingLinksService).homeUrl;

  tokenState = signal<TokenState>('validating');
  loading = signal(false);
  done = signal(false);

  private token = '';

  form = this.fb.group({
    newPassword:     ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', Validators.required]
  }, { validators: passwordsMatch });

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
    if (!this.token) {
      this.tokenState.set('invalid');
      return;
    }
    this.auth.validateResetToken(this.token).subscribe({
      next: ({ status }) => {
        const map: Record<string, TokenState> = {
          VALID: 'valid', EXPIRED: 'expired', USED: 'used', INVALID: 'invalid'
        };
        this.tokenState.set(map[status] ?? 'invalid');
      },
      error: () => this.tokenState.set('invalid')
    });
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.auth.resetPassword(this.token, this.form.value.newPassword!).subscribe({
      next: () => {
        this.done.set(true);
        this.loading.set(false);
        setTimeout(() => this.router.navigate(['/auth/login'], {
          state: { passwordResetSuccess: true }
        }), 2500);
      },
      error: (err) => {
        this.loading.set(false);
        const code = err?.error?.errorCode;
        if (code === 'TOKEN_EXPIRED') this.tokenState.set('expired');
        else if (code === 'TOKEN_ALREADY_USED') this.tokenState.set('used');
        else this.tokenState.set('invalid');
      }
    });
  }
}
