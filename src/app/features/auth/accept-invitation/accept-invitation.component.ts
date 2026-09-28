import { Component, inject, signal } from '@angular/core';
import { FormBuilder, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { DividerModule } from 'primeng/divider';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TenantUserService } from '../../../core/services/tenant-user.service';
import { LandingLinksService } from '../../../core/services/landing-links.service';
import { SocialAuthService } from '../../../core/auth/social-auth.service';
import { BrandLogoComponent } from '../../../shared/components/brand-logo/brand-logo.component';

type ScreenState = 'form' | 'invalid' | 'notUsable' | 'emailTaken' | 'emailMismatch' | 'planLimit';

function passwordsMatch(control: AbstractControl): ValidationErrors | null {
  const pw = control.get('password')?.value;
  const confirm = control.get('confirmPassword')?.value;
  return pw && confirm && pw !== confirm ? { passwordMismatch: true } : null;
}

@Component({
  selector: 'app-accept-invitation',
  standalone: true,
  providers: [MessageService],
  imports: [BrandLogoComponent, CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe,
            ButtonModule, InputTextModule, PasswordModule, DividerModule, ToastModule],
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
              {{ 'auth.acceptInvitationHeroTitle' | translate }}
            </h1>
            <p class="text-app-text-secondary text-base font-medium leading-snug">
              {{ 'auth.acceptInvitationHeroSubtitle' | translate }}
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

          <!-- FORM -->
          @if (state() === 'form') {
            <div class="text-center mb-8">
              <div class="w-12 h-12 bg-app-accent-soft rounded-xl flex items-center justify-center mx-auto mb-4">
                <i class="pi pi-user-plus text-app-accent-hover text-xl"></i>
              </div>
              <h2 class="text-2xl font-bold text-app-text">{{ 'auth.acceptInvitationFormTitle' | translate }}</h2>
              <p class="text-app-text-secondary text-sm mt-1.5">{{ 'auth.acceptInvitationFormSubtitle' | translate }}</p>
            </div>

            <form [formGroup]="form" (ngSubmit)="onSubmit()" class="space-y-4">
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-sm font-medium text-app-text mb-1">{{ 'auth.firstName' | translate }}</label>
                  <input pInputText formControlName="firstName" fluid
                         [class.p-invalid]="form.get('firstName')?.invalid && form.get('firstName')?.touched" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-app-text mb-1">{{ 'auth.lastName' | translate }}</label>
                  <input pInputText formControlName="lastName" fluid />
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-app-text mb-1">{{ 'auth.password' | translate }}</label>
                <p-password formControlName="password" [feedback]="true" [toggleMask]="true"
                            fluid inputStyleClass="w-full"
                            [placeholder]="'auth.password' | translate"
                            [class.p-invalid]="form.get('password')?.invalid && form.get('password')?.touched">
                </p-password>
                @if (form.get('password')?.errors?.['minlength'] && form.get('password')?.touched) {
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

              <p-button type="submit" [label]="'auth.acceptInvitationSubmit' | translate" fluid
                        [loading]="loading()" [disabled]="form.invalid"></p-button>
            </form>

            <p-divider align="center">
              <span class="text-xs text-app-text-tertiary">{{ 'common.or' | translate }}</span>
            </p-divider>

            <div class="grid grid-cols-2 gap-2">
              <p-button type="button" (click)="acceptViaGoogle()" [outlined]="true"
                        icon="pi pi-google" [label]="'auth.google' | translate"
                        fluid [loading]="googleLoading()"></p-button>
              <p-button type="button" (click)="acceptViaFacebook()" [outlined]="true"
                        icon="pi pi-facebook" [label]="'auth.facebook' | translate"
                        fluid [loading]="facebookLoading()"></p-button>
            </div>
          }

          <!-- INVALID -->
          @if (state() === 'invalid') {
            <div class="text-center py-4">
              <div class="w-16 h-16 bg-app-danger/10 rounded-full flex items-center justify-center mx-auto mb-5">
                <i class="pi pi-times-circle text-app-danger text-2xl"></i>
              </div>
              <p class="text-app-text font-semibold text-lg">{{ 'auth.invitationInvalidTitle' | translate }}</p>
              <p class="text-app-text-secondary text-sm mt-2 leading-relaxed max-w-xs mx-auto">{{ 'auth.invitationInvalidDesc' | translate }}</p>
            </div>
          }

          <!-- NOT USABLE (expired / cancelled / already accepted) -->
          @if (state() === 'notUsable') {
            <div class="text-center py-4">
              <div class="w-16 h-16 bg-app-warning/10 rounded-full flex items-center justify-center mx-auto mb-5">
                <i class="pi pi-clock text-app-warning text-2xl"></i>
              </div>
              <p class="text-app-text font-semibold text-lg">{{ 'auth.invitationNotUsableTitle' | translate }}</p>
              <p class="text-app-text-secondary text-sm mt-2 leading-relaxed max-w-xs mx-auto">{{ 'auth.invitationNotUsableDesc' | translate }}</p>
            </div>
          }

          <!-- EMAIL ALREADY REGISTERED -->
          @if (state() === 'emailTaken') {
            <div class="text-center py-4">
              <div class="w-16 h-16 bg-app-surface-hover rounded-full flex items-center justify-center mx-auto mb-5">
                <i class="pi pi-exclamation-circle text-app-text-tertiary text-2xl"></i>
              </div>
              <p class="text-app-text font-semibold text-lg">{{ 'auth.invitationEmailTakenTitle' | translate }}</p>
              <p class="text-app-text-secondary text-sm mt-2 leading-relaxed max-w-xs mx-auto">{{ 'auth.invitationEmailTakenDesc' | translate }}</p>
              <p-button [label]="'auth.backToLogin' | translate" styleClass="w-full mt-6"
                        routerLink="/auth/login"></p-button>
            </div>
          }

          <!-- EMAIL MISMATCH (social account email differs from the invited email) -->
          @if (state() === 'emailMismatch') {
            <div class="text-center py-4">
              <div class="w-16 h-16 bg-app-danger/10 rounded-full flex items-center justify-center mx-auto mb-5">
                <i class="pi pi-exclamation-triangle text-app-danger text-2xl"></i>
              </div>
              <p class="text-app-text font-semibold text-lg">{{ 'auth.invitationEmailMismatchTitle' | translate }}</p>
              <p class="text-app-text-secondary text-sm mt-2 leading-relaxed max-w-xs mx-auto">{{ 'auth.invitationEmailMismatchDesc' | translate }}</p>
              <p-button [label]="'common.back' | translate" styleClass="w-full mt-6"
                        (click)="state.set('form')"></p-button>
            </div>
          }

          <!-- PLAN LIMIT REACHED -->
          @if (state() === 'planLimit') {
            <div class="text-center py-4">
              <div class="w-16 h-16 bg-app-warning/10 rounded-full flex items-center justify-center mx-auto mb-5">
                <i class="pi pi-lock text-app-warning text-2xl"></i>
              </div>
              <p class="text-app-text font-semibold text-lg">{{ 'auth.invitationPlanLimitTitle' | translate }}</p>
              <p class="text-app-text-secondary text-sm mt-2 leading-relaxed max-w-xs mx-auto">{{ 'auth.invitationPlanLimitDesc' | translate }}</p>
            </div>
          }

          @if (state() === 'form') {
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
export class AcceptInvitationComponent {
  private fb = inject(FormBuilder);
  private tenantUserService = inject(TenantUserService);
  private socialAuth = inject(SocialAuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private messageService = inject(MessageService);
  private translate = inject(TranslateService);

  readonly homeUrl = inject(LandingLinksService).homeUrl;

  state = signal<ScreenState>('form');
  loading = signal(false);
  googleLoading = signal(false);
  facebookLoading = signal(false);

  private readonly token = this.route.snapshot.queryParamMap.get('token') ?? '';

  form = this.fb.group({
    firstName:       ['', Validators.required],
    lastName:        [''],
    password:        ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', Validators.required]
  }, { validators: passwordsMatch });

  constructor() {
    if (!this.token) {
      this.state.set('invalid');
    }
  }

  onSubmit(): void {
    if (this.form.invalid || !this.token) return;
    this.loading.set(true);
    this.tenantUserService.acceptInvitation(this.token, {
      firstName: this.form.value.firstName!,
      lastName: this.form.value.lastName || undefined,
      password: this.form.value.password!
    }).subscribe({
      next: () => this.onAccepted(this.loading),
      error: (err: HttpErrorResponse) => this.onAcceptError(err, this.loading)
    });
  }

  acceptViaGoogle(): void {
    if (!this.token) return;
    this.googleLoading.set(true);
    this.socialAuth.promptGoogle().subscribe({
      next: idToken => this.tenantUserService.acceptInvitationViaGoogle(this.token, idToken).subscribe({
        next: () => this.onAccepted(this.googleLoading),
        error: (err: HttpErrorResponse) => this.onAcceptError(err, this.googleLoading)
      }),
      error: () => {
        this.googleLoading.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('auth.googleSignInError') });
      }
    });
  }

  acceptViaFacebook(): void {
    if (!this.token) return;
    this.facebookLoading.set(true);
    this.socialAuth.signInWithFacebook().subscribe({
      next: result => this.tenantUserService.acceptInvitationViaFacebook(this.token, result.idToken).subscribe({
        next: () => this.onAccepted(this.facebookLoading),
        error: (err: HttpErrorResponse) => this.onAcceptError(err, this.facebookLoading)
      }),
      error: () => {
        this.facebookLoading.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('auth.facebookSignInError') });
      }
    });
  }

  private onAccepted(loadingSignal: typeof this.loading): void {
    loadingSignal.set(false);
    this.router.navigate(['/auth/login'], { state: { invitationAccepted: true } });
  }

  private onAcceptError(err: HttpErrorResponse, loadingSignal: typeof this.loading): void {
    loadingSignal.set(false);
    const code = err?.error?.errorCode;
    if (err.status === 404 || code === 'RESOURCE_NOT_FOUND') this.state.set('invalid');
    else if (code === 'INVITATION_NOT_USABLE') this.state.set('notUsable');
    else if (code === 'EMAIL_ALREADY_REGISTERED') this.state.set('emailTaken');
    else if (code === 'INVITATION_EMAIL_MISMATCH') this.state.set('emailMismatch');
    else if (code === 'PLAN_LIMIT_EXCEEDED') this.state.set('planLimit');
    else {
      this.messageService.add({
        severity: 'error',
        summary: this.translate.instant('errors.serverError'),
        life: 5000
      });
    }
  }
}
