import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { FileUploadModule } from 'primeng/fileupload';
import { SelectModule } from 'primeng/select';
import { PanelModule } from 'primeng/panel';
import { InputMaskModule } from 'primeng/inputmask';
import { MessageService } from 'primeng/api';
import { TenantService } from '../../../core/services/tenant.service';
import { mediaUrl } from '../../../shared/utils/media-url';
import { AddressAutocompleteComponent, AddressValue } from '../../../shared/components/address-autocomplete/address-autocomplete.component';
import { PhoneComponent } from '../../../shared/components/phone/phone.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { addressValueToFields } from '../../../shared/utils/address.util';
import { BrTaxIdMaskDirective } from '../../../shared/directives/br-tax-id-mask.directive';
import { formatTaxIdForDisplay, SupportedCountry, TAX_ID_META, taxIdValidator } from '../../../shared/utils/tax-id.validator';
import { TIMEZONE_OPTIONS } from '../../../shared/utils/tenant-locale-options';

/**
 * Só o OWNER chega aqui: UpdateTenantUseCase compara o utilizador autenticado com
 * tenant.userId, não o perfil — ADMIN carrega o mesmo cargo mas não é essa identidade, por isso
 * gravar aqui devolve 401 mesmo com a role certa (roleGuard em app.routes.ts já bloqueia ADMIN).
 */
@Component({
  selector: 'app-company-info',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe,
    ButtonModule, InputTextModule, TextareaModule, FileUploadModule, SelectModule, InputMaskModule, PanelModule,
    AddressAutocompleteComponent, PhoneComponent, PageHeaderComponent, BrTaxIdMaskDirective],
  template: `
    <div class="max-w-3xl">
      <app-page-header [title]="'tenant.editInfo' | translate" [description]="'tenant.subtitle' | translate"
                       [breadcrumb]="[{ label: 'nav.administration' | translate, route: '/administration' }]"></app-page-header>

      <div class="space-y-6">
        <p-panel [header]="'profile.logo' | translate">
          <div class="flex items-center gap-6">
            <div class="w-24 h-24 rounded-2xl bg-app-accent-soft flex items-center justify-center text-app-text text-3xl font-medium flex-shrink-0 overflow-hidden">
              @if (tenantLogoUrl()) {
                <img [src]="resolveUrl(tenantLogoUrl()!)" alt="logo" class="w-full h-full object-cover">
              } @else {
                <i class="pi pi-image text-2xl text-app-text-tertiary"></i>
              }
            </div>
            <div>
              <p-fileUpload mode="basic" name="logo" accept="image/*" [maxFileSize]="5000000"
                           [chooseLabel]="'tenant.changeLogo' | translate"
                           [disabled]="uploadingLogo()"
                           (onSelect)="onLogoUpload($event)"></p-fileUpload>
              <p class="text-xs text-app-text-tertiary mt-1">JPG, PNG até 5MB</p>
            </div>
          </div>
        </p-panel>

        <p-panel [header]="'nav.company' | translate">
          <form [formGroup]="tenantForm" (ngSubmit)="saveTenant()" class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-app-text mb-1">{{ 'profile.tenantName' | translate }} *</label>
                <input pInputText formControlName="name" fluid />
                @if (tenantForm.get('name')?.invalid && tenantForm.get('name')?.touched) {
                  <small class="text-app-danger">{{ 'errors.required' | translate }}</small>
                }
              </div>
              <div>
                <label class="block text-sm font-medium text-app-text mb-1">{{ taxIdMeta().labelKey | translate }}</label>
                @if (taxIdMeta().mask) {
                  <input pInputText formControlName="taxId" [pInputMask]="taxIdMeta().mask!" fluid [placeholder]="taxIdMeta().placeholder" />
                } @else {
                  <input pInputText appBrTaxIdMask formControlName="taxId" fluid [placeholder]="taxIdMeta().placeholder" />
                }
                @if (tenantForm.get('taxId')?.hasError('taxId')) {
                  <small class="text-app-danger text-xs block">{{ 'errors.taxIdInvalid' | translate }}</small>
                }
              </div>
              <div class="md:col-span-2">
                <app-address-autocomplete formControlName="address" [required]="true"></app-address-autocomplete>
                @if (tenantForm.get('address')?.invalid && tenantForm.get('address')?.touched) {
                  <small class="text-app-danger">{{ 'errors.required' | translate }}</small>
                }
              </div>
              <div>
                <app-phone formControlName="phone" [defaultCountry]="country()"></app-phone>
              </div>
              <div>
                <label class="block text-sm font-medium text-app-text mb-1">{{ 'tenant.website' | translate }}</label>
                <input pInputText formControlName="website" fluid inputmode="url" autocomplete="url" placeholder="https://www.suaempresa.com.br" />
              </div>
              <div>
                <label class="block text-sm font-medium text-app-text mb-1">{{ 'tenant.timezone' | translate }}</label>
                <p-select [options]="timezoneOptions" formControlName="timezone"
                          [filter]="true" fluid appendTo="body"></p-select>
                <small class="text-app-text-tertiary">{{ 'tenant.timezoneHint' | translate }}</small>
              </div>
              <!-- BRAZIL-ONLY: selects de país, moeda operacional e idioma/região removidos da UI.
                   Para reativar, ver CLAUDE.md §7A "Operação só Brasil (UI)". -->
              <div class="md:col-span-2">
                <label class="block text-sm font-medium text-app-text mb-1">{{ 'common.description' | translate }}</label>
                <textarea pTextarea formControlName="description" fluid rows="3"></textarea>
              </div>
            </div>
            <div class="flex justify-end">
              <p-button type="submit" [label]="'common.save' | translate" icon="pi pi-check"
                        [loading]="savingTenant()" [disabled]="tenantForm.invalid"></p-button>
            </div>
          </form>
        </p-panel>
      </div>
    </div>
  `,
})
export class CompanyInfoComponent implements OnInit {
  private fb = inject(FormBuilder);
  private messageService = inject(MessageService);
  private translate = inject(TranslateService);
  private tenantService = inject(TenantService);

  savingTenant = signal(false);
  private tenantId = signal<string | null>(null);
  tenantLogoUrl = signal<string | null>(null);
  uploadingLogo = signal(false);
  readonly timezoneOptions = TIMEZONE_OPTIONS;

  resolveUrl = mediaUrl;

  /** Country selected in the tenant form — drives the tax-id label, mask and validator. */
  country = signal<SupportedCountry>('BR');
  taxIdMeta = computed(() => TAX_ID_META[this.country()]);

  tenantForm = this.fb.group({
    name: ['', Validators.required],
    countryCode: [this.country() as SupportedCountry, Validators.required],
    taxId: ['', taxIdValidator(() => this.country())],
    address: this.fb.control<AddressValue | null>(null, Validators.required),
    phone: [''],
    website: [''],
    description: [''],
    timezone: ['America/Sao_Paulo' as string],
    currency: ['BRL' as string],
    locale: ['pt-BR' as string],
  });

  private readonly countrySync = this.tenantForm.get('countryCode')!.valueChanges.subscribe(value => {
    this.country.set((value as SupportedCountry) ?? 'BR');
    this.tenantForm.get('taxId')?.updateValueAndValidity({ emitEvent: false });
  });

  ngOnInit() {
    this.tenantService.getMe().subscribe({
      next: (r) => {
        this.tenantId.set(r.id);
        this.tenantLogoUrl.set(r.logoUrl ?? null);
        if (r.countryCode) this.country.set(r.countryCode as SupportedCountry);
        this.tenantForm.patchValue({
          name: r.name,
          countryCode: (r.countryCode as SupportedCountry) ?? 'BR',
          taxId: formatTaxIdForDisplay(r.taxId, (r.countryCode as SupportedCountry) ?? 'BR') ?? '',
          address: this.toAddressValue(r),
          phone: r.phone ?? '',
          website: r.website ?? '',
          description: r.description ?? '',
          timezone: r.timezone ?? 'America/Sao_Paulo',
          currency: r.currency ?? 'BRL',
          locale: r.locale ?? 'pt-BR',
        });
      },
      error: () => {
        this.messageService.add({
          severity: 'warn',
          summary: this.translate.instant('tenant.profileNotFound'),
        });
      }
    });
  }

  /** Builds the autocomplete's structured value from a stored tenant profile. */
  private toAddressValue(p: {
    address?: string; addressComplement?: string; postalCode?: string;
    city?: string; country?: string; latitude?: number; longitude?: number;
  }): AddressValue | null {
    if (!p.address) return null;
    return {
      street: p.address,
      complement: p.addressComplement,
      postalCode: p.postalCode,
      city: p.city,
      country: p.country,
      latitude: p.latitude,
      longitude: p.longitude,
    };
  }

  onLogoUpload(event: any): void {
    const file: File = event.files?.[0];
    if (!file) return;
    this.uploadingLogo.set(true);
    const id = this.tenantId();
    if (!id) return;
    this.tenantService.uploadLogo(id, file).subscribe({
      next: (tenant) => {
        this.tenantLogoUrl.set(tenant.logoUrl ?? null);
        this.uploadingLogo.set(false);
        this.messageService.add({ severity: 'info', summary: this.translate.instant('tenant.logoUploaded') });
      },
      error: () => {
        this.uploadingLogo.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('profile.photoError') });
      }
    });
  }

  saveTenant(): void {
    this.tenantForm.markAllAsTouched();
    if (this.tenantForm.invalid) return;
    const id = this.tenantId();
    if (!id) {
      this.messageService.add({ severity: 'error', summary: this.translate.instant('tenant.saveError') });
      return;
    }
    this.savingTenant.set(true);
    const v = this.tenantForm.value;
    const addr = addressValueToFields(v.address);

    this.tenantService.update(id, {
      name: v.name!,
      address: addr.address!,
      addressComplement: addr.addressComplement,
      city: addr.city,
      country: addr.country,
      postalCode: addr.postalCode,
      latitude: addr.latitude,
      longitude: addr.longitude,
      countryCode: v.countryCode || undefined,
      taxId: v.taxId || undefined,
      phone: v.phone || undefined,
      website: v.website || undefined,
      description: v.description || undefined,
      timezone: v.timezone || undefined,
      currency: v.currency || undefined,
      locale: v.locale || undefined,
    }).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: this.translate.instant('tenant.saved') });
        this.savingTenant.set(false);
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: this.translate.instant('tenant.saveError') });
        this.savingTenant.set(false);
      }
    });
  }
}
