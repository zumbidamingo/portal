import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { FileUploadModule } from 'primeng/fileupload';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { MessageService } from 'primeng/api';
import { Tenant, TenantService } from '../../../core/services/tenant.service';
import { PhoneComponent } from '../../../shared/components/phone/phone.component';
import { mediaUrl } from '../../../shared/utils/media-url';
import { TIMEZONE_OPTIONS } from '../../../shared/utils/tenant-locale-options';
import { OnboardingFooterComponent } from '../onboarding-footer.component';

/**
 * Passo 1 — identidade da empresa. Nome, país e documento fiscal já vieram do registo e só se
 * mostram (editam-se em Administração > Empresa); aqui o dono acrescenta o que dá cara à empresa
 * nos orçamentos e emails (logotipo, telefone, site) e confirma o fuso horário, que decide a hora
 * de agendamentos e rotas. Moeda e idioma seguem o país do registo e não se perguntam.
 */
@Component({
  selector: 'app-onboarding-company-step',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe, FileUploadModule, InputTextModule, SelectModule, PhoneComponent, OnboardingFooterComponent],
  template: `
    <div class="flex flex-col flex-1">
      <div class="flex items-center gap-4 rounded-lg border border-app-border bg-app-surface p-4 mb-6">
        <div class="w-14 h-14 rounded-lg bg-app-accent-soft flex items-center justify-center overflow-hidden shrink-0">
          @if (logoUrl()) {
            <img [src]="resolveUrl(logoUrl()!)" alt="" class="w-full h-full object-cover">
          } @else {
            <span class="text-lg font-semibold text-app-accent">{{ initial() }}</span>
          }
        </div>
        <div class="min-w-0">
          <p class="text-sm font-semibold text-app-text truncate">{{ tenant().name }}</p>
          <p class="text-xs text-app-text-tertiary truncate">
            {{ tenant().taxId }}<span class="mx-1.5">·</span>{{ tenant().address }}
          </p>
        </div>
      </div>

      <div class="mb-6">
        <h3 class="text-sm font-semibold text-app-text mb-1">{{ 'onboarding.company.logoTitle' | translate }}</h3>
        <p class="text-xs text-app-text-tertiary mb-3">{{ 'onboarding.company.logoHint' | translate }}</p>
        <p-fileUpload mode="basic" name="logo" accept="image/*" [maxFileSize]="5000000"
                      [chooseLabel]="'tenant.changeLogo' | translate"
                      [disabled]="uploadingLogo()" (onSelect)="onLogoSelect($event)"></p-fileUpload>
      </div>

      <form [formGroup]="form" class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <app-phone formControlName="phone" [defaultCountry]="phoneCountry()"></app-phone>
        </div>
        <div>
          <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'tenant.website' | translate }}</label>
          <input pInputText formControlName="website" fluid placeholder="https://" />
        </div>
        <div class="md:col-span-2">
          <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'tenant.timezone' | translate }}</label>
          <p-select [options]="timezoneOptions" formControlName="timezone" [filter]="true" fluid appendTo="body"></p-select>
          <small class="text-app-text-tertiary">{{ 'onboarding.company.timezoneHint' | translate }}</small>
        </div>
      </form>
      <p class="text-xs text-app-text-tertiary mt-3">{{ 'onboarding.company.optionalHint' | translate }}</p>

      <div class="flex-1"></div>
      <app-onboarding-footer [showBack]="false" [loading]="saving()" [disabled]="form.invalid || uploadingLogo()"
                             (primary)="save()"></app-onboarding-footer>
    </div>
  `,
})
export class OnboardingCompanyStepComponent implements OnInit {
  private fb = inject(FormBuilder);
  private tenantService = inject(TenantService);
  private messageService = inject(MessageService);
  private translate = inject(TranslateService);

  tenant = input.required<Tenant>();
  saved = output<Tenant>();

  readonly timezoneOptions = TIMEZONE_OPTIONS;
  form = this.fb.group({ phone: [''], website: [''], timezone: ['', Validators.required] });
  saving = signal(false);
  uploadingLogo = signal(false);
  logoUrl = signal<string | null>(null);
  resolveUrl = mediaUrl;

  ngOnInit(): void {
    const t = this.tenant();
    this.logoUrl.set(t.logoUrl ?? null);
    this.form.patchValue({ phone: t.phone ?? '', website: t.website ?? '', timezone: t.timezone ?? 'America/Sao_Paulo' });
  }

  /** Primeiro mercado é o Brasil; Portugal só quando o país da empresa o pede. */
  phoneCountry(): 'BR' | 'PT' {
    return this.tenant().countryCode === 'PT' ? 'PT' : 'BR';
  }

  initial(): string {
    return (this.tenant().name?.trim().charAt(0) || '?').toUpperCase();
  }

  onLogoSelect(event: { files?: File[] }): void {
    const file = event.files?.[0];
    if (!file) return;
    this.uploadingLogo.set(true);
    this.tenantService.uploadLogo(this.tenant().id, file).subscribe({
      next: t => {
        this.logoUrl.set(t.logoUrl ?? null);
        this.uploadingLogo.set(false);
      },
      error: () => {
        this.uploadingLogo.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('profile.photoError') });
      },
    });
  }

  save(): void {
    if (this.form.invalid) return;
    const t = this.tenant();
    const { phone, website, timezone } = this.form.getRawValue();
    const changed = (phone || '') !== (t.phone ?? '') || (website || '') !== (t.website ?? '')
      || (timezone || '') !== (t.timezone ?? '');
    if (!changed) {
      this.saved.emit(t);
      return;
    }
    this.saving.set(true);
    // PUT exige nome e morada; o resto só se grava quando vem preenchido (UpdateTenantUseCase).
    this.tenantService.update(t.id, {
      name: t.name,
      address: t.address ?? '',
      phone: phone || undefined,
      website: website || undefined,
      timezone: timezone || undefined,
    }).subscribe({
      next: updated => {
        this.saving.set(false);
        this.saved.emit(updated);
      },
      error: () => {
        this.saving.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('tenant.saveError') });
      },
    });
  }
}
