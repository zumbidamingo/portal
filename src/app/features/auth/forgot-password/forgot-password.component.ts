import { Component, inject, signal } from '@angular/core';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../../core/auth/auth.service';
import { LandingLinksService } from '../../../core/services/landing-links.service';
import { BrandLogoComponent } from '../../../shared/components/brand-logo/brand-logo.component';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  providers: [MessageService],
  imports: [BrandLogoComponent, ReactiveFormsModule, RouterLink, TranslatePipe, ButtonModule, InputTextModule, ToastModule],
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
              {{ 'auth.forgotHeroTitle' | translate }}
            </h1>
            <p class="text-app-text-secondary text-base font-medium leading-snug">
              {{ 'auth.forgotHeroSubtitle' | translate }}
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

          @if (!sent()) {
            <div class="text-center mb-8">
              <div class="w-12 h-12 bg-app-accent-soft rounded-xl flex items-center justify-center mx-auto mb-4">
                <i class="pi pi-lock text-app-accent-hover text-xl"></i>
              </div>
              <h2 class="text-2xl font-bold text-app-text">{{ 'auth.resetPasswordTitle' | translate }}</h2>
              <p class="text-app-text-secondary text-sm mt-1.5">{{ 'auth.resetPasswordSubtitle' | translate }}</p>
            </div>

            <form [formGroup]="form" (ngSubmit)="onSubmit()" class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-app-text mb-1">{{ 'auth.email' | translate }}</label>
                <div class="relative">
                  <i class="pi pi-envelope absolute left-3 top-1/2 -translate-y-1/2 text-app-text-tertiary text-sm pointer-events-none z-10"></i>
                  <input pInputText formControlName="email" type="email" fluid style="padding-left: 2.25rem"
                         placeholder="email@exemplo.com"
                         [class.p-invalid]="form.get('email')?.invalid && form.get('email')?.touched" />
                </div>
                @if (form.get('email')?.invalid && form.get('email')?.touched) {
                  <small class="text-app-danger text-xs mt-1 block">{{ 'errors.invalidEmail' | translate }}</small>
                }
              </div>
              <p-button type="submit" [label]="'auth.sendResetLink' | translate" fluid
                        [loading]="loading()" [disabled]="form.invalid"></p-button>
            </form>

          } @else {
            <div class="text-center py-4">
              <div class="w-16 h-16 bg-app-success/10 rounded-full flex items-center justify-center mx-auto mb-5">
                <i class="pi pi-envelope text-app-success text-2xl"></i>
              </div>
              <p class="text-app-text font-semibold text-lg">{{ 'auth.checkInboxTitle' | translate }}</p>
              <p class="text-app-text-secondary text-sm mt-2 leading-relaxed max-w-xs mx-auto">
                {{ 'auth.checkInboxDesc' | translate }}
              </p>
            </div>
          }

          <p class="text-center text-sm text-app-text-secondary mt-6">
            <a routerLink="/auth/login"
               class="text-app-accent-hover font-semibold hover:underline transition-colors duration-150 inline-flex items-center gap-1">
              <i class="pi pi-arrow-left text-xs"></i>{{ 'auth.backToLogin' | translate }}
            </a>
          </p>
        </div>
      </div>
    </div>
  `
})
export class ForgotPasswordComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private messageService = inject(MessageService);
  private translate = inject(TranslateService);

  readonly homeUrl = inject(LandingLinksService).homeUrl;

  loading = signal(false);
  sent = signal(false);

  form = this.fb.group({ email: ['', [Validators.required, Validators.email]] });

  onSubmit(): void {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.auth.forgotPassword(this.form.value.email!).subscribe({
      next: () => {
        this.sent.set(true);
        this.loading.set(false);
      },
      error: () => {
        // Always show success — never reveal whether the email exists
        this.sent.set(true);
        this.loading.set(false);
      }
    });
  }
}
