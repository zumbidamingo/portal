import { Component, inject, signal, WritableSignal, OnInit, computed } from '@angular/core';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { HttpClient } from '@angular/common/http';
import { switchMap } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { DividerModule } from 'primeng/divider';
import { ToastModule } from 'primeng/toast';
import { InputMaskModule } from 'primeng/inputmask';
import { MessageService } from 'primeng/api';
import { AuthService, SocialProvider } from '../../../core/auth/auth.service';
import { SocialAuthService, decodeGoogleIdToken, SocialPrefill } from '../../../core/auth/social-auth.service';
import { TenantService } from '../../../core/services/tenant.service';
import { LandingLinksService } from '../../../core/services/landing-links.service';
import { LegalConsentNoticeComponent } from '../../../shared/components/legal-consent-notice/legal-consent-notice.component';
import { LoadingComponent } from '../../../shared/components/loading/loading.component';
import { AddressAutocompleteComponent, AddressValue } from '../../../shared/components/address-autocomplete/address-autocomplete.component';
import { addressValueToFields } from '../../../shared/utils/address.util';
import { BrTaxIdMaskDirective } from '../../../shared/directives/br-tax-id-mask.directive';
import { SupportedCountry, TAX_ID_META, taxIdValidator } from '../../../shared/utils/tax-id.validator';
import { BrandLogoComponent } from '../../../shared/components/brand-logo/brand-logo.component';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [BrandLogoComponent, CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe,
    ButtonModule, InputTextModule, PasswordModule, DividerModule, ToastModule, InputMaskModule,
    LegalConsentNoticeComponent, AddressAutocompleteComponent, LoadingComponent, BrTaxIdMaskDirective],
  template: `
    @if (checkingAuth()) {
      <app-loading />
    } @else {
    <p-toast position="top-right"></p-toast>

    <div class="min-h-screen relative overflow-hidden flex items-center justify-center p-4 lg:p-12 bg-app-surface">

      <div class="absolute -top-40 -right-40 w-[560px] h-[560px] rounded-full bg-app-accent-soft/70 blur-3xl pointer-events-none"></div>
      <div class="absolute -bottom-56 -left-56 w-[460px] h-[460px] rounded-full bg-app-accent-soft/50 blur-3xl pointer-events-none"></div>

      <div class="w-full max-w-6xl flex items-center gap-12 lg:gap-20 relative z-10">

        <!-- Left branding panel — desktop only -->
        <div class="hidden lg:flex flex-col gap-10 flex-1">
          <a [href]="homeUrl" target="_self" [attr.aria-label]="'auth.backToHome' | translate"
             class="flex w-fit items-center gap-2 rounded-xl transition-opacity duration-150 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent focus-visible:ring-offset-2">
            <app-brand-logo variant="wordmark" [size]="34" />
          </a>

          <div class="space-y-4 max-w-sm">
            <h1 class="text-5xl font-bold leading-[1.1] text-pretty text-app-text">
              {{ 'auth.registerHeroTitle' | translate }}
            </h1>
            <p class="text-app-text-secondary text-base font-medium leading-snug text-balance">
              {{ 'auth.registerHeroSubtitle' | translate }}
            </p>
          </div>
        </div>

        <!-- Form card -->
        <div class="bg-app-bg border border-app-border rounded-xl w-full lg:max-w-xl p-8 shrink-0">

          <!-- Mobile logo -->
          <a [href]="homeUrl" target="_self" [attr.aria-label]="'auth.backToHome' | translate"
             class="flex w-fit mx-auto items-center justify-center gap-2 mb-6 lg:hidden rounded-lg transition-opacity duration-150 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent focus-visible:ring-offset-2">
            <app-brand-logo variant="wordmark" [size]="28" />
          </a>

          <div class="text-center mb-6">
            <h2 class="text-2xl font-bold text-app-text">{{ 'auth.createAccount' | translate }}</h2>
          </div>

          <!-- Social sign-in banner — shown once a Google/Facebook session has started -->
          @if (socialProvider()) {
            <div class="flex items-center gap-2 bg-app-accent-soft border border-app-border rounded-xl p-3 mb-5 text-sm">
              <i [class]="socialProvider() === 'google' ? 'pi pi-google text-app-accent-hover' : 'pi pi-facebook text-app-accent-hover'"></i>
              <span class="font-medium text-app-text">
                {{ (socialProvider() === 'google' ? 'auth.continueWithGoogle' : 'auth.continueWithFacebook') | translate }}
              </span>
              @if (socialUserInfo?.email) {
                <span class="text-app-text-secondary truncate ml-auto text-xs">{{ socialUserInfo!.email }}</span>
              }
            </div>
          }

          <!-- ─── Company form: email/password ─── -->
          @if (!isNewSocialUser()) {
            <form [formGroup]="tenantForm" (ngSubmit)="registerTenant()" class="space-y-2">

              <div>
                <label class="block text-sm font-medium text-app-text mb-1">{{ 'profile.tenantName' | translate }} *</label>
                <div class="relative">
                  <i class="pi pi-building absolute left-3 top-1/2 -translate-y-1/2 text-app-text-tertiary text-sm pointer-events-none z-10"></i>
                  <input pInputText formControlName="name" fluid style="padding-left: 2.25rem"
                        [placeholder]="'profile.tenantName' | translate"
                        autocomplete="off"/>
                </div>
                @if (tenantForm.get('name')?.invalid && tenantForm.get('name')?.touched) {
                  <small class="text-app-danger text-xs mt-1 block">{{ 'errors.required' | translate }}</small>
                }
              </div>

              <div class="grid grid-cols-1 gap-2">
                <div>
                  <label class="block text-sm font-medium text-app-text mb-1">{{ taxIdMeta().labelKey | translate }} *</label>
                  @if (taxIdMeta().mask) {
                    <input pInputText formControlName="taxId" [pInputMask]="taxIdMeta().mask!" fluid [placeholder]="taxIdMeta().placeholder" />
                  } @else {
                    <input pInputText appBrTaxIdMask formControlName="taxId" fluid [placeholder]="taxIdMeta().placeholder" />
                  }
                  @if (tenantForm.get('taxId')?.touched && tenantForm.get('taxId')?.hasError('required')) {
                    <small class="text-app-danger text-xs block">{{ 'errors.required' | translate }}</small>
                  } @else if (tenantForm.get('taxId')?.hasError('taxId')) {
                    <small class="text-app-danger text-xs block">{{ 'errors.taxIdInvalid' | translate }}</small>
                  }
                </div>
              </div>

              <app-address-autocomplete formControlName="address" [required]="true"></app-address-autocomplete>
              @if (tenantForm.get('address')?.invalid && tenantForm.get('address')?.touched) {
                <small class="text-app-danger text-xs block">{{ 'errors.required' | translate }}</small>
              }

              <p-divider align="center">
                <span class="text-xs text-app-text-tertiary">{{ 'auth.accessCredentials' | translate }}</span>
              </p-divider>

              <div class="flex flex-col">
                <label class="block text-sm font-medium text-app-text mb-1">{{ 'common.email' | translate }} *</label>
                <div class="relative">
                  <i class="pi pi-envelope absolute left-3 top-1/2 -translate-y-1/2 text-app-text-tertiary text-sm pointer-events-none z-10"></i>
                  <input pInputText formControlName="email" type="email" fluid style="padding-left: 2.25rem"
                         placeholder="email@empresa.com"
                         autocomplete="off"/>
                </div>
                @if (tenantForm.get('email')?.invalid && tenantForm.get('email')?.touched) {
                  <small class="text-app-danger text-xs mt-1 block">{{ 'errors.invalidEmail' | translate }}</small>
                }
              </div>

              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="block text-sm font-medium text-app-text mb-1">{{ 'common.password' | translate }} *</label>
                  <p-password formControlName="password" [toggleMask]="true" autocomplete="off"
                              fluid inputStyleClass="w-full"></p-password>
                </div>
                <div>
                  <label class="block text-sm font-medium text-app-text mb-1">{{ 'auth.confirmPassword' | translate }} *</label>
                  <p-password formControlName="confirmPassword" [feedback]="false" [toggleMask]="true" autocomplete="off"
                              fluid inputStyleClass="w-full"></p-password>
                </div>

                @if (passwordMismatch(tenantForm)) {
                  <p class="text-app-danger text-xs flex items-center gap-1">
                    <i class="pi pi-times-circle"></i>{{ 'auth.passwordMismatch' | translate }}
                  </p>
                }
              </div>

              <p-divider align="center">
                <span class="text-app-text-tertiary text-xs">{{ 'common.or' | translate }}</span>
              </p-divider>

              <div class="grid grid-cols-2 gap-2">
                <p-button type="button" (click)="triggerGoogleSignIn()" [outlined]="true"
                          icon="pi pi-google" [label]="'auth.google' | translate"
                          fluid [loading]="googleTriggerLoading()"></p-button>
                <p-button type="button" (click)="triggerFacebookSignIn()" [outlined]="true"
                          icon="pi pi-facebook" [label]="'auth.facebook' | translate"
                          fluid [loading]="facebookTriggerLoading()"></p-button>
              </div>

              <div class="flex gap-2 pt-2">
                <p-button type="button" (click)="goToPreviousStep()" icon="pi pi-arrow-left"
                          [label]="'common.back' | translate" [text]="true"></p-button>
                <p-button type="submit" [label]="'auth.createAccount' | translate" styleClass="flex-1"
                          [loading]="loading()" fluid [disabled]="tenantForm.invalid || passwordMismatch(tenantForm)"></p-button>
              </div>
            </form>
          }

          <!-- ─── Company form: social mode (no email/password) ─── -->
          @if (isNewSocialUser()) {
            <form [formGroup]="socialTenantForm" (ngSubmit)="submitSocialTenant()" class="space-y-3">
              <div>
                <label class="block text-sm font-medium text-app-text mb-1">{{ 'profile.tenantName' | translate }} *</label>
                <div class="relative">
                  <i class="pi pi-building absolute left-3 top-1/2 -translate-y-1/2 text-app-text-tertiary text-sm pointer-events-none z-10"></i>
                  <input pInputText formControlName="name" fluid style="padding-left: 2.25rem"
                         [placeholder]="'profile.tenantName' | translate"
                         autocomplete="off"/>
                </div>
                @if (socialTenantForm.get('name')?.invalid && socialTenantForm.get('name')?.touched) {
                  <small class="text-app-danger text-xs mt-1 block">{{ 'errors.required' | translate }}</small>
                }
              </div>

              <div class="grid grid-cols-1 gap-2">
                <div>
                  <label class="block text-sm font-medium text-app-text mb-1">{{ taxIdMeta().labelKey | translate }} *</label>
                  @if (taxIdMeta().mask) {
                    <input pInputText formControlName="taxId" [pInputMask]="taxIdMeta().mask!" fluid [placeholder]="taxIdMeta().placeholder" />
                  } @else {
                    <input pInputText appBrTaxIdMask formControlName="taxId" fluid [placeholder]="taxIdMeta().placeholder" />
                  }
                  @if (socialTenantForm.get('taxId')?.touched && socialTenantForm.get('taxId')?.hasError('required')) {
                    <small class="text-app-danger text-xs mt-1 block">{{ 'errors.required' | translate }}</small>
                  } @else if (socialTenantForm.get('taxId')?.hasError('taxId')) {
                    <small class="text-app-danger text-xs mt-1 block">{{ 'errors.taxIdInvalid' | translate }}</small>
                  }
                </div>
              </div>

              <app-address-autocomplete formControlName="address" [required]="true"></app-address-autocomplete>
              @if (socialTenantForm.get('address')?.invalid && socialTenantForm.get('address')?.touched) {
                <small class="text-app-danger text-xs block">{{ 'errors.required' | translate }}</small>
              }

              <div class="flex gap-2 pt-2">
                <p-button type="button" (click)="goBack()" icon="pi pi-arrow-left"
                          [label]="'common.back' | translate" [text]="true"></p-button>
                <p-button type="submit" [label]="'auth.completeProfile' | translate" styleClass="flex-1"
                          [loading]="loading()" [disabled]="socialTenantForm.invalid"></p-button>
              </div>
            </form>
          }

          <app-legal-consent-notice class="block mt-5" />

          <p class="text-center text-sm text-app-text-secondary mt-6">
            {{ 'auth.hasAccount' | translate }}
            <a routerLink="/auth/login" class="text-app-accent-hover font-semibold hover:underline ml-1 transition-colors duration-150">{{ 'auth.login' | translate }}</a>
          </p>
        </div>
      </div>
    </div>
    }
  `
})
export class RegisterComponent implements OnInit {
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);
  auth = inject(AuthService);
  private socialAuth = inject(SocialAuthService);
  private tenantService = inject(TenantService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private messageService = inject(MessageService);
  private translate = inject(TranslateService);

  readonly homeUrl = inject(LandingLinksService).homeUrl;

  /** True while resuming an authenticated session (incomplete social profile) — hides the form so it never flashes before the redirect fires. */
  checkingAuth = signal(false);
  loading = signal(false);
  googleTriggerLoading = signal(false);
  facebookTriggerLoading = signal(false);
  socialProvider = signal<SocialProvider | null>(null);
  isNewSocialUser = signal(false);
  /**
   * Explicit flow-origin flag (from the `?origin=` query param), read once at ngOnInit. Only
   * 'landing' means the user arrived from an external page — goToPreviousStep() then returns via
   * browser history instead of the login screen.
   */
  registrationOrigin = signal<'landing' | 'default'>('default');
  private socialToken: string | null = null;
  socialUserInfo: SocialPrefill | null = null;
  /** Fields typed into tenantForm before the user clicked a social button — carried over so switching auth method mid-form doesn't drop them. */
  private capturedManualValues: { name?: string; countryCode?: SupportedCountry; taxId?: string; address?: AddressValue | null } | null = null;

  private readonly API = environment.apiUrl;

  /** Every company registers as Brazilian while the operation is Brazil-only — the country field was removed from the form. Drives the tax-id label, mask and validator. */
  country = signal<SupportedCountry>('BR');
  taxIdMeta = computed(() => TAX_ID_META[this.country()]);

  ngOnInit(): void {
    const state = history.state as { socialProvider?: SocialProvider; socialToken?: string; socialPrefill?: SocialPrefill };

    if (state?.socialProvider && state?.socialToken) {
      this.resolveSocialSignup(state.socialProvider, state.socialToken, state.socialPrefill ?? { email: '', firstName: '', lastName: '' });
      return;
    }

    // A social sign-in already created the User row + session on the backend (that happens the
    // instant socialLogin runs, before the Tenant entity exists). If the user reloads or browses
    // back after that point, `history.state` above is gone — but the session isn't. Resume
    // straight into the completion form from server-verified state.
    if (this.auth.isAuthenticated()) {
      this.checkingAuth.set(true);
      this.resumeIncompleteSocialRegistration();
      return;
    }

    const origin = this.route.snapshot.queryParamMap.get('origin');
    if (origin === 'landing') {
      this.registrationOrigin.set('landing');
    }
  }

  tenantForm = this.fb.group({
    name: ['', Validators.required],
    countryCode: [this.country() as SupportedCountry, Validators.required],
    // Documento fiscal obrigatório desde a Fase 2 do anti-reinício de trial: é a chave de
    // identidade mais cara de falsificar. Sem ela o ledger fica só com email e conta social,
    // ambos gratuitos de renovar.
    taxId: ['', [Validators.required, taxIdValidator(() => this.country())]],
    address: this.fb.control<AddressValue | null>(null, Validators.required),
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', Validators.required]
  });

  socialTenantForm = this.fb.group({
    name: ['', Validators.required],
    countryCode: [this.country() as SupportedCountry, Validators.required],
    taxId: ['', [Validators.required, taxIdValidator(() => this.country())]],
    address: this.fb.control<AddressValue | null>(null, Validators.required)
  });

  private readonly countrySync = (() => {
    const sync = (value: string | null) => {
      this.country.set((value as SupportedCountry) ?? 'BR');
      this.tenantForm.get('taxId')?.updateValueAndValidity({ emitEvent: false });
      this.socialTenantForm.get('taxId')?.updateValueAndValidity({ emitEvent: false });
    };
    this.tenantForm.get('countryCode')!.valueChanges.subscribe(sync);
    this.socialTenantForm.get('countryCode')!.valueChanges.subscribe(sync);
  })();

  passwordMismatch(form: typeof this.tenantForm): boolean {
    const { password, confirmPassword } = form.value;
    return !!password && !!confirmPassword && password !== confirmPassword;
  }

  /** Snapshots whatever the user already typed into the regular form so it survives the switch to a social-mode form. */
  private captureManualFormValues(): void {
    const v = this.tenantForm.getRawValue();
    this.capturedManualValues = {
      name: v.name ?? undefined,
      countryCode: (v.countryCode as SupportedCountry) ?? undefined,
      taxId: v.taxId ?? undefined,
      address: v.address
    };
  }

  triggerGoogleSignIn(): void {
    this.captureManualFormValues();
    this.googleTriggerLoading.set(true);
    this.socialAuth.promptGoogle().subscribe({
      next: credential => this.authenticateWithSocialProvider('google', credential, decodeGoogleIdToken(credential), this.googleTriggerLoading),
      error: () => {
        this.googleTriggerLoading.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('auth.googleSignInError') });
      }
    });
  }

  triggerFacebookSignIn(): void {
    this.captureManualFormValues();
    this.facebookTriggerLoading.set(true);
    this.socialAuth.signInWithFacebook().subscribe({
      next: result => this.authenticateWithSocialProvider('facebook', result.idToken, {
        email: result.email ?? '', firstName: result.firstName ?? '', lastName: result.lastName ?? ''
      }, this.facebookTriggerLoading),
      error: () => {
        this.facebookTriggerLoading.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('auth.facebookSignInError') });
      }
    });
  }

  /** Role is always OWNER here — this screen only creates companies — so the social exchange fires immediately, no role picker in between. */
  private authenticateWithSocialProvider(provider: SocialProvider, idToken: string, prefill: SocialPrefill, loadingSignal: WritableSignal<boolean>): void {
    this.socialToken = idToken;
    this.socialUserInfo = prefill;
    this.socialProvider.set(provider);
    loadingSignal.set(true);
    this.auth.socialLogin(provider, idToken, 'OWNER').subscribe({
      next: ({ isNewUser }) => {
        loadingSignal.set(false);
        if (!isNewUser) {
          this.redirectAfterLogin();
          return;
        }
        // User-typed values (if any) win over the provider's prefill — that's what they intended.
        const manual = this.capturedManualValues;
        this.socialTenantForm.patchValue({
          name: manual?.name || '',
          countryCode: manual?.countryCode || this.country(),
          taxId: manual?.taxId || '',
          address: manual?.address ?? null
        });
        this.isNewSocialUser.set(true);
      },
      error: () => {
        loadingSignal.set(false);
        const errorKey = provider === 'google' ? 'auth.googleSignInError' : 'auth.facebookSignInError';
        this.messageService.add({ severity: 'error', summary: this.translate.instant(errorKey) });
      }
    });
  }

  /** Entry point for a social sign-in redirected here from the login screen (new-user case) — resolves immediately, since there's no role to pick. */
  private resolveSocialSignup(provider: SocialProvider, token: string, prefill: SocialPrefill): void {
    this.socialToken = token;
    this.socialUserInfo = prefill;
    this.socialProvider.set(provider);
    this.checkingAuth.set(true);
    this.auth.socialLogin(provider, token, 'OWNER').subscribe({
      next: ({ isNewUser }) => {
        if (!isNewUser) {
          this.redirectAfterLogin();
          return;
        }
        this.isNewSocialUser.set(true);
        this.checkingAuth.set(false);
      },
      error: () => {
        this.checkingAuth.set(false);
        const errorKey = provider === 'google' ? 'auth.googleSignInError' : 'auth.facebookSignInError';
        this.messageService.add({ severity: 'error', summary: this.translate.instant(errorKey) });
      }
    });
  }

  /** Already authenticated on mount (see ngOnInit) — figure out whether the Tenant is actually
   * created, and either resume the completion form or move on. isNewSocialUser is set so the
   * social-mode form renders even though there's no live socialToken to send (none needed —
   * submitSocialTenant() relies on the existing session, not the token). */
  private resumeIncompleteSocialRegistration(): void {
    const user = this.auth.currentUser();
    if (user?.authProvider !== 'GOOGLE' && user?.authProvider !== 'FACEBOOK') {
      // Email/password account — nothing to resume here, this component's normal
      // (unauthenticated) flow doesn't apply. Send them where they belong.
      this.router.navigate(['/']);
      return;
    }
    if (this.auth.userRole() !== 'OWNER') {
      this.router.navigate(['/']);
      return;
    }
    this.socialProvider.set(user.authProvider === 'GOOGLE' ? 'google' : 'facebook');

    this.tenantService.getMe().subscribe({
      next: () => this.router.navigate(['/']),
      error: () => {
        this.isNewSocialUser.set(true);
        this.checkingAuth.set(false);
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

  goToPreviousStep(): void {
    if (this.registrationOrigin() === 'landing') {
      history.back();
    } else {
      this.router.navigate(['/auth/login']);
    }
  }

  /** Back button on the social completion form. The social session already exists — there's no
   * previous step to return to within this component, only away from the flow entirely. */
  goBack(): void {
    this.router.navigateByUrl('/auth/login');
  }

  registerTenant(): void {
    if (this.tenantForm.invalid || this.passwordMismatch(this.tenantForm)) return;
    this.loading.set(true);
    const v = this.tenantForm.getRawValue();

    this.auth.registerTenant(
      { email: v.email!, password: v.password! },
      { name: v.name!, countryCode: v.countryCode!, taxId: v.taxId || undefined, ...addressValueToFields(v.address), address: v.address!.street }
    ).subscribe({
      next: () => {
        this.tenantService.markProfileComplete(true);
        this.router.navigate(['/auth/verify-email']);
      },
      error: (err) => {
        this.messageService.add({ severity: 'error', summary: this.resolveRegisterError(err) });
        this.loading.set(false);
      }
    });
  }

  submitSocialTenant(): void {
    if (this.socialTenantForm.invalid) return;
    this.loading.set(true);
    const v = this.socialTenantForm.getRawValue();

    this.http.post(`${this.API}/tenants`, {
      name: v.name!, countryCode: v.countryCode, taxId: v.taxId || undefined, ...addressValueToFields(v.address)
    }).pipe(switchMap(() => this.auth.getCurrentUser())).subscribe({
      next: () => {
        this.tenantService.markProfileComplete(true);
        // Social accounts are emailVerified=true from creation, so the protected layout is
        // reachable straight away.
        this.router.navigate(['/']);
      },
      error: (err) => {
        this.messageService.add({ severity: 'error', summary: this.resolveRegisterError(err) });
        this.loading.set(false);
      }
    });
  }

  private resolveRegisterError(err: any): string {
    const errorCode = err?.error?.errorCode;
    switch (errorCode) {
      case 'EMAIL_ALREADY_EXISTS':
        return this.translate.instant('errors.emailAlreadyExists');
      case 'DISPOSABLE_EMAIL_NOT_ALLOWED':
        return this.translate.instant('errors.disposableEmail');
      case 'TAX_ID_REQUIRED':
        return this.translate.instant('errors.required');
      case 'TAX_ID_INVALID':
        return this.translate.instant('errors.taxIdInvalid');
      case 'TAX_ID_NOT_REGISTERED':
        return this.translate.instant('errors.taxIdNotRegistered');
      case 'COUNTRY_NOT_SUPPORTED':
        return this.translate.instant('errors.countryNotSupported');
      default:
        return err?.error?.detail ?? this.translate.instant('errors.serverError');
    }
  }
}
