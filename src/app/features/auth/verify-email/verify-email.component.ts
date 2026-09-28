import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { interval, Subscription, switchMap } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { LandingLinksService } from '../../../core/services/landing-links.service';
import { BrandLogoComponent } from '../../../shared/components/brand-logo/brand-logo.component';

@Component({
  selector: 'app-verify-email',
  standalone: true,
  imports: [BrandLogoComponent, CommonModule, TranslatePipe, ButtonModule, ToastModule],
  providers: [MessageService],
  styles: [`
    @keyframes icon-pulse {
      0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--app-accent) 35%, transparent); }
      60%       { box-shadow: 0 0 0 10px color-mix(in srgb, var(--app-accent) 0%, transparent); }
    }
    @keyframes dot-blink {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.25; }
    }
    .icon-waiting {
      animation: icon-pulse 2.4s ease-out infinite;
    }
    .poll-dot {
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--app-text-tertiary);
      flex-shrink: 0;
      animation: dot-blink 1.4s ease-in-out infinite;
    }
    @media (prefers-reduced-motion: reduce) {
      .icon-waiting { animation: none; }
      .poll-dot { animation: none; opacity: 0.5; }
    }
  `],
  template: `
    <p-toast position="top-right"></p-toast>

    <div class="min-h-screen flex items-center justify-center bg-app-surface p-4 relative overflow-hidden">

      <!-- Background decoration — subtle mint blobs matching auth design locale -->
      <div class="absolute -top-40 -right-40 w-[480px] h-[480px] rounded-full bg-app-accent-soft/70 blur-3xl pointer-events-none"></div>
      <div class="absolute -bottom-48 -left-48 w-[380px] h-[380px] rounded-full bg-app-accent-soft/50 blur-3xl pointer-events-none"></div>

      <div class="bg-app-bg border border-app-border rounded-xl w-full max-w-md p-8 relative z-10 text-center">

        <!-- Logo lockup -->
        <a [href]="homeUrl" target="_self" [attr.aria-label]="'auth.backToHome' | translate"
           class="flex w-fit mx-auto items-center justify-center gap-2 mb-7 rounded-lg transition-opacity duration-150 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent focus-visible:ring-offset-2">
          <app-brand-logo variant="wordmark" [size]="28" />
        </a>

        <!-- State icon -->
        <div class="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
             [class.icon-waiting]="!verified() && !verifyError() && !verifying()"
             [ngClass]="verified() ? 'bg-app-success/10' : (verifyError() ? 'bg-app-danger/10' : 'bg-app-accent-soft')">
          @if (verified()) {
            <i class="pi pi-check-circle text-app-success text-3xl"></i>
          } @else if (verifyError()) {
            <i class="pi pi-times-circle text-app-danger text-3xl"></i>
          } @else if (verifying()) {
            <i class="pi pi-spin pi-spinner text-app-accent-hover text-3xl"></i>
          } @else {
            <i class="pi pi-envelope text-app-accent-hover text-3xl"></i>
          }
        </div>

        <!-- Title + subtitle -->
        @if (verified()) {
          <h1 class="text-2xl font-bold text-app-text mb-2">{{ 'verifyEmail.successTitle' | translate }}</h1>
          <p class="text-app-text-secondary text-sm mb-6">{{ 'verifyEmail.successSubtitle' | translate }}</p>
        } @else if (verifyError()) {
          <h1 class="text-2xl font-bold text-app-text mb-2">{{ 'verifyEmail.errorTitle' | translate }}</h1>
          <p class="text-app-text-secondary text-sm mb-6">{{ verifyErrorMessage() }}</p>
        } @else if (verifying()) {
          <h1 class="text-2xl font-bold text-app-text mb-2">{{ 'verifyEmail.title' | translate }}</h1>
          <p class="text-app-text-secondary text-sm mb-6">{{ 'verifyEmail.verifying' | translate }}</p>
        } @else {
          <h1 class="text-2xl font-bold text-app-text mb-2">{{ 'verifyEmail.title' | translate }}</h1>
          <p class="text-app-text-secondary text-sm" [class.mb-1]="userEmail()" [class.mb-6]="!userEmail()">
            {{ 'verifyEmail.subtitle' | translate }}
          </p>
          @if (userEmail()) {
            <p class="font-semibold text-app-text text-sm mb-6">{{ userEmail() }}</p>
          }
        }

        <!-- Success: go to dashboard -->
        @if (verified()) {
          <p-button
            severity="primary"
            [label]="'verifyEmail.goToDashboard' | translate"
            styleClass="w-full mb-3"
            (onClick)="redirectAfterVerification()">
          </p-button>
        }

        <!-- Error: resend -->
        @if (verifyError()) {
          <p-button
            severity="primary"
            [label]="'verifyEmail.resend' | translate"
            styleClass="w-full mb-3"
            [loading]="resending()"
            (onClick)="resend()">
          </p-button>
        }

        <!-- Waiting: spam tip + resend + polling indicator -->
        @if (!verified() && !verifyError() && !verifying()) {
          <div class="bg-app-accent-soft rounded-xl p-4 mb-5 text-left">
            <p class="text-xs text-app-text-secondary leading-relaxed">
              <i class="pi pi-info-circle mr-1.5 text-app-accent-hover"></i>{{ 'verifyEmail.checkSpam' | translate }}
            </p>
          </div>

          <p-button
            severity="primary"
            [label]="resendCooldown() > 0
              ? ('verifyEmail.resendCooldown' | translate) + ' ' + resendCooldown() + 's'
              : ('verifyEmail.resend' | translate)"
            styleClass="w-full mb-4"
            [loading]="resending()"
            [disabled]="resendCooldown() > 0"
            (onClick)="resend()">
          </p-button>

          <div class="flex items-center justify-center gap-2">
            <span class="poll-dot"></span>
            <span class="text-xs text-app-text-tertiary">{{ 'verifyEmail.autoCheck' | translate }}</span>
          </div>
        }

        <!-- Logout -->
        @if (!verified()) {
          <div class="mt-6 pt-5 border-t border-app-border-subtle">
            <button type="button"
                    class="text-sm text-app-text-tertiary hover:text-app-text-secondary transition-colors duration-150 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-border focus-visible:ring-offset-2"
                    (click)="auth.logout()">
              {{ 'auth.logout' | translate }}
            </button>
          </div>
        }
      </div>
    </div>
  `
})
export class VerifyEmailComponent implements OnInit, OnDestroy {
  protected auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private messageService = inject(MessageService);
  private translate = inject(TranslateService);

  readonly homeUrl = inject(LandingLinksService).homeUrl;

  verified = signal(false);
  verifying = signal(false);
  verifyError = signal(false);
  verifyErrorMessage = signal('');
  resending = signal(false);
  resendCooldown = signal(0);
  userEmail = signal('');

  private pollSub?: Subscription;
  private cooldownSub?: Subscription;

  ngOnInit(): void {
    const user = this.auth.currentUser();

    if (!this.auth.isAuthenticated()) {
      this.router.navigate(['/auth/login']);
      return;
    }

    if (user?.emailVerified) {
      this.redirectAfterVerification();
      return;
    }

    this.userEmail.set(user?.email ?? '');

    const token = this.route.snapshot.queryParamMap.get('token');
    if (token) {
      this.autoVerify(token);
    } else {
      this.startPolling();
    }
  }

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
    this.cooldownSub?.unsubscribe();
  }

  private autoVerify(token: string): void {
    this.verifying.set(true);
    this.auth.verifyEmail(token).subscribe({
      next: () => {
        this.verifying.set(false);
        this.verified.set(true);
        // Refresh currentUser so the signal updates
        this.auth.getCurrentUser().subscribe(() => {
          setTimeout(() => this.redirectAfterVerification(), 2000);
        });
      },
      error: (err) => {
        this.verifying.set(false);
        this.verifyError.set(true);
        const code = err?.error?.errorCode;
        if (code === 'TOKEN_EXPIRED') {
          this.verifyErrorMessage.set(this.translate.instant('verifyEmail.errorExpired'));
        } else if (code === 'TOKEN_ALREADY_USED') {
          this.verifyErrorMessage.set(this.translate.instant('verifyEmail.errorUsed'));
        } else {
          this.verifyErrorMessage.set(this.translate.instant('verifyEmail.errorInvalid'));
        }
      }
    });
  }

  private startPolling(): void {
    this.pollSub = interval(5000).pipe(
      switchMap(() => this.auth.getCurrentUser())
    ).subscribe(user => {
      if (user.emailVerified) {
        this.pollSub?.unsubscribe();
        this.verified.set(true);
        setTimeout(() => this.redirectAfterVerification(), 2000);
      }
    });
  }

  resend(): void {
    this.resending.set(true);
    this.auth.resendVerificationEmail().subscribe({
      next: () => {
        this.resending.set(false);
        this.verifyError.set(false);
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('verifyEmail.resendSuccess')
        });
        this.startCooldown(60);
        this.startPolling();
      },
      error: (err) => {
        this.resending.set(false);
        const code = err?.error?.errorCode;
        if (code === 'EMAIL_ALREADY_VERIFIED') {
          this.auth.getCurrentUser().subscribe(() => this.redirectAfterVerification());
        } else {
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('verifyEmail.resendError')
          });
        }
      }
    });
  }

  private startCooldown(seconds: number): void {
    this.resendCooldown.set(seconds);
    this.cooldownSub?.unsubscribe();
    this.cooldownSub = interval(1000).subscribe(() => {
      const remaining = this.resendCooldown() - 1;
      this.resendCooldown.set(remaining);
      if (remaining <= 0) this.cooldownSub?.unsubscribe();
    });
  }

  redirectAfterVerification(): void {
    this.router.navigate(['/']);
  }
}
