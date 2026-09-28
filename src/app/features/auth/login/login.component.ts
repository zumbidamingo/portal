import { Component, inject, signal, WritableSignal, OnInit } from '@angular/core';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { DividerModule } from 'primeng/divider';
import { ToastModule } from 'primeng/toast';
import { AuthService, SocialProvider } from '../../../core/auth/auth.service';
import { SocialAuthService, decodeGoogleIdToken, SocialPrefill } from '../../../core/auth/social-auth.service';
import { LandingLinksService } from '../../../core/services/landing-links.service';
import { MessageService } from 'primeng/api';
import { BrandLogoComponent } from '../../../shared/components/brand-logo/brand-logo.component';

@Component({
  selector: 'app-login',
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
              {{ 'auth.loginHeroTitle' | translate }}
            </h1>
            <p class="text-app-text-secondary text-base font-medium leading-snug">
              {{ 'auth.loginHeroSubtitle' | translate }}
            </p>
            <p class="text-app-text-tertiary text-sm leading-relaxed">
              {{ 'auth.loginHeroDesc' | translate }}
            </p>
          </div>
        </div>

        <!-- Login card -->
        <div class="bg-app-bg border border-app-border rounded-xl w-full lg:max-w-md p-8 lg:p-10 flex-shrink-0">

          <a [href]="homeUrl" target="_self" [attr.aria-label]="'auth.backToHome' | translate"
             class="flex w-fit mx-auto items-center justify-center gap-2 mb-6 lg:hidden rounded-lg transition-opacity duration-150 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent focus-visible:ring-offset-2">
            <app-brand-logo variant="wordmark" [size]="28" />
          </a>

          <div class="text-center mb-8">
            <h2 class="text-2xl font-bold text-app-text">{{ 'auth.welcomeBack' | translate }}</h2>
            <p class="text-app-text-secondary text-sm mt-1.5">{{ 'auth.loginSubtitle' | translate }}</p>
          </div>

          <form [formGroup]="form" (ngSubmit)="onSubmit()" class="space-y-4">
            <div>
              <input pInputText formControlName="email" type="email" fluid
                     [placeholder]="'auth.email' | translate"
                     [attr.aria-label]="'auth.email' | translate"
                     [class.p-invalid]="form.get('email')?.invalid && form.get('email')?.touched" />
              @if (form.get('email')?.invalid && form.get('email')?.touched) {
                <small class="text-app-danger text-xs mt-1 block">{{ 'errors.invalidEmail' | translate }}</small>
              }
            </div>

            <div>
              <p-password formControlName="password" [feedback]="false" [toggleMask]="true"
                          fluid inputStyleClass="w-full"
                          [placeholder]="'auth.password' | translate"></p-password>
              @if (form.get('password')?.invalid && form.get('password')?.touched) {
                <small class="text-app-danger text-xs mt-1 block">{{ 'errors.required' | translate }}</small>
              }
            </div>

            <div class="flex justify-end">
              <a routerLink="/auth/forgot-password"
                 class="text-sm text-app-accent-hover hover:underline transition-colors duration-150">
                {{ 'auth.forgotPassword' | translate }}
              </a>
            </div>

            <p-button type="submit" [label]="'auth.login' | translate" fluid
                      [loading]="loading()" [disabled]="form.invalid"></p-button>
          </form>

          <p-divider align="center">
            <span class="text-app-text-tertiary text-xs">{{ 'common.or' | translate }}</span>
          </p-divider>

          <div class="flex flex-row items-center gap-2">
            <p-button (click)="triggerGoogleSignIn()" [outlined]="true"
                      icon="pi pi-google" [label]="'auth.google' | translate"
                      class="w-full"
                      fluid
                      [loading]="googleLoading()"></p-button>
            <p-button (click)="triggerFacebookSignIn()" [outlined]="true"
                      icon="pi pi-facebook"
                      class="w-full"
                      fluid
                      [label]="'auth.facebook' | translate"
                      [loading]="facebookLoading()"></p-button>
          </div>

          <p class="text-center text-sm text-app-text-secondary mt-6">
            {{ 'auth.noAccount' | translate }}
            <a routerLink="/auth/register"
               class="text-app-accent-hover font-semibold hover:underline ml-1 transition-colors duration-150">
              {{ 'auth.register' | translate }}
            </a>
          </p>
        </div>
      </div>
    </div>
  `
})
export class LoginComponent implements OnInit {
  private fb = inject(FormBuilder);
  auth = inject(AuthService);
  private socialAuth = inject(SocialAuthService);
  private router = inject(Router);
  private messageService = inject(MessageService);
  private translate = inject(TranslateService);

  readonly homeUrl = inject(LandingLinksService).homeUrl;

  ngOnInit(): void {
    if (history.state?.passwordResetSuccess) {
      this.messageService.add({
        severity: 'success',
        summary: this.translate.instant('auth.passwordResetSuccess'),
        life: 5000
      });
    }
    if (history.state?.invitationAccepted) {
      this.messageService.add({
        severity: 'success',
        summary: this.translate.instant('auth.acceptInvitationSuccess'),
        detail: this.translate.instant('auth.acceptInvitationSuccessDesc'),
        life: 6000
      });
    }
  }

  loading = signal(false);
  googleLoading = signal(false);
  facebookLoading = signal(false);

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required]
  });

  onSubmit(): void {
    if (this.form.invalid) return;
    this.loading.set(true);
    const { email, password } = this.form.value;
    this.auth.login({ email: email!, password: password! }).subscribe({
      next: () => this.redirectAfterLogin(),
      error: (err) => {
        // Só chega aqui com a senha certa: dizer 'credenciais inválidas' a quem tem a exclusão agendada
        // deixaria a pessoa sem saber que o caminho é o link de cancelamento do email.
        const key = err?.error?.errorCode === 'ACCOUNT_PENDING_DELETION' ? 'auth.accountPendingDeletion' : 'auth.invalidCredentials';
        this.messageService.add({ severity: 'error', summary: this.translate.instant(key), life: 8000 });
        this.loading.set(false);
      }
    });
  }

  private redirectAfterLogin(): void {
    if (!this.auth.isEmailVerified()) {
      this.router.navigate(['/auth/verify-email']);
      return;
    }
    this.router.navigate(['/']);
  }

  triggerGoogleSignIn(): void {
    this.googleLoading.set(true);
    this.socialAuth.promptGoogle().subscribe({
      next: credential => this.handleSocialCredential('google', credential, this.googleLoading, decodeGoogleIdToken(credential)),
      error: () => {
        this.googleLoading.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('auth.googleSignInError') });
      }
    });
  }

  triggerFacebookSignIn(): void {
    this.facebookLoading.set(true);
    this.socialAuth.signInWithFacebook().subscribe({
      next: result => this.handleSocialCredential('facebook', result.idToken, this.facebookLoading, {
        email: result.email ?? '', firstName: result.firstName ?? '', lastName: result.lastName ?? ''
      }),
      error: () => {
        this.facebookLoading.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('auth.facebookSignInError') });
      }
    });
  }

  private handleSocialCredential(provider: SocialProvider, idToken: string, loadingSignal: WritableSignal<boolean>, prefill: SocialPrefill): void {
    this.auth.socialLoginNoRole(provider, idToken).subscribe({
      next: (result) => {
        loadingSignal.set(false);
        if (result === null) {
          // New user: send to register page with token to pick role + complete profile
          this.router.navigate(['/auth/register'], { state: { socialProvider: provider, socialToken: idToken, socialPrefill: prefill } });
        } else {
          // Existing user: check profile completeness
          this.redirectAfterLogin();
        }
      },
      error: () => {
        loadingSignal.set(false);
        const errorKey = provider === 'google' ? 'auth.googleSignInError' : 'auth.facebookSignInError';
        this.messageService.add({ severity: 'error', summary: this.translate.instant(errorKey) });
      }
    });
  }
}
