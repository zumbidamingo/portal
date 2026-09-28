import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputMaskModule } from 'primeng/inputmask';
import { DialogModule } from 'primeng/dialog';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { SubscriptionService } from '../../core/services/subscription.service';
import { TenantService } from '../../core/services/tenant.service';
import { TenantUnitService, TenantUnit, TenantUnitPayload } from '../../core/services/tenant-unit.service';
import { AddressAutocompleteComponent, AddressValue } from '../../shared/components/address-autocomplete/address-autocomplete.component';
import { PhoneComponent } from '../../shared/components/phone/phone.component';
import { TagBadgeComponent } from '../../shared/components/tag-badge/tag-badge.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { addressValueToFields } from '../../shared/utils/address.util';
import { SupportedCountry, TAX_ID_META, taxIdValidator, formatTaxIdForDisplay } from '../../shared/utils/tax-id.validator';

@Component({
  selector: 'app-tenant-units',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe, ButtonModule, InputTextModule, InputMaskModule,
    DialogModule, TooltipModule, AddressAutocompleteComponent, PhoneComponent, TagBadgeComponent, EmptyStateComponent],
  template: `
    @if (!hasMultiUnit()) {
      <div class="text-center py-12 px-4 border border-dashed border-app-border rounded-lg">
        <i class="pi pi-building text-3xl text-app-text-tertiary"></i>
        <p class="font-medium text-app-text mt-3">{{ 'tenantUnits.upsellTitle' | translate }}</p>
        <p class="text-sm text-app-text-secondary mt-1 max-w-md mx-auto">{{ 'tenantUnits.upsellBody' | translate }}</p>
        <p-button [label]="'dashboard.upgradeNow' | translate" icon="pi pi-star" class="mt-4 inline-block"
                  (onClick)="goToSubscription()"></p-button>
      </div>
    } @else {
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <p class="text-sm text-app-text-secondary">{{ 'tenantUnits.quota' | translate: { used: activeCount(), limit: maxUnits() } }}</p>
          <span [pTooltip]="atLimit() ? ('tenantUnits.limitReached' | translate) : ''" tooltipPosition="left" class="inline-flex">
            <p-button [label]="'tenantUnits.add' | translate" icon="pi pi-plus" size="small"
                      [disabled]="atLimit()" (onClick)="openCreate()"></p-button>
          </span>
        </div>

        <div class="border-t border-app-border-subtle">
          @for (unit of units(); track unit.id) {
            <div class="group flex items-center justify-between gap-3 py-3 border-b border-app-border-subtle hover:bg-app-surface-hover transition-colors -mx-2 px-2">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <p class="font-medium text-app-text truncate">{{ unit.name }}</p>
                  @if (!unit.isActive) {
                    <app-tag-badge [value]="'tenantUnits.inactive' | translate" severity="secondary"></app-tag-badge>
                  }
                </div>
                <p class="text-xs text-app-text-tertiary truncate">{{ unit.address }}</p>
                @if (unit.taxId) {
                  <p class="text-xs text-app-text-tertiary truncate">{{ taxIdMeta().labelKey | translate }}: {{ formatTaxId(unit.taxId) }}</p>
                }
              </div>
              <div class="flex items-center gap-1 shrink-0 transition-opacity">
                <p-button icon="pi pi-pencil" [text]="true" size="small" severity="secondary"
                          [pTooltip]="'tenantUnits.edit' | translate" tooltipPosition="top"
                          [disabled]="pendingId() === unit.id" (onClick)="openEdit(unit)"></p-button>
                @if (unit.isActive) {
                  <p-button icon="pi pi-times-circle" [text]="true" size="small" severity="warn"
                            [pTooltip]="'tenantUnits.deactivate' | translate" tooltipPosition="top"
                            [loading]="pendingId() === unit.id" (onClick)="deactivate(unit)"></p-button>
                } @else {
                  <span [pTooltip]="(atLimit() ? 'tenantUnits.limitReached' : 'tenantUnits.activate') | translate"
                        tooltipPosition="top" class="inline-flex">
                    <p-button icon="pi pi-check-circle" [text]="true" size="small" severity="info"
                              [loading]="pendingId() === unit.id" [disabled]="atLimit()"
                              (onClick)="activate(unit)"></p-button>
                  </span>
                }
              </div>
            </div>
          }
          @if (!units().length) {
            <app-empty-state icon="pi pi-building" [message]="'tenantUnits.empty' | translate">
            </app-empty-state>
            <div class="flex justify-center pb-6 -mt-3">
              <p-button [label]="'tenantUnits.add' | translate" icon="pi pi-plus" (onClick)="openCreate()"></p-button>
            </div>
          }
        </div>
      </div>

      <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '32rem' }"
                [header]="(editingId() ? 'tenantUnits.editTitle' : 'tenantUnits.addTitle') | translate">
        <form [formGroup]="form" (ngSubmit)="save()" class="space-y-4">
          <div>
            <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'tenantUnits.name' | translate }} *</label>
            <input pInputText formControlName="name" fluid />
          </div>
          <div>
            <app-address-autocomplete formControlName="address" [required]="true"></app-address-autocomplete>
          </div>
          <div>
            <app-phone formControlName="phone"></app-phone>
          </div>
          <div>
            <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ taxIdMeta().labelKey | translate }}</label>
            @if (taxIdMeta().mask) {
              <input pInputText formControlName="taxId" [pInputMask]="taxIdMeta().mask!" fluid [placeholder]="taxIdMeta().placeholder" />
            } @else {
              <input pInputText formControlName="taxId" fluid [placeholder]="taxIdMeta().placeholder" />
            }
            <small class="text-app-text-tertiary text-xs block mt-1">{{ 'tenantUnits.taxIdHint' | translate }}</small>
            @if (form.get('taxId')?.hasError('taxId')) {
              <small class="text-app-danger text-xs block">{{ 'errors.taxIdInvalid' | translate }}</small>
            }
          </div>
          <div class="flex justify-end gap-2">
            <p-button type="button" [label]="'common.close' | translate" [outlined]="true" (onClick)="dialogVisible.set(false)"></p-button>
            <p-button type="submit" [label]="'common.save' | translate" icon="pi pi-check"
                      [loading]="saving()" [disabled]="form.invalid"></p-button>
          </div>
        </form>
      </p-dialog>
    }
  `,
})
export class TenantUnitsComponent implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private subService = inject(SubscriptionService);
  private tenantService = inject(TenantService);
  private unitService = inject(TenantUnitService);
  private messageService = inject(MessageService);
  private translate = inject(TranslateService);

  units = signal<TenantUnit[]>([]);
  dialogVisible = signal(false);
  saving = signal(false);
  editingId = signal<string | null>(null);
  /** Unit whose activate/deactivate call is in flight — drives the per-row spinner. */
  pendingId = signal<string | null>(null);

  maxUnits = () => this.subService.me()?.usage.units.limit ?? 1;
  hasMultiUnit = () => this.maxUnits() === -1 || this.maxUnits() > 1;
  activeCount = () => this.units().filter(u => u.isActive).length;
  atLimit = () => this.activeCount() >= this.maxUnits();

  /** País fiscal do tenant — cada unidade é filial do mesmo tenant, por isso não muda por
   *  unidade (§7A do CLAUDE.md). Só decide máscara/validação do documento; a unidade pode
   *  ficar sem documento próprio e operar sob o do tenant. */
  private country = signal<SupportedCountry>('BR');
  taxIdMeta = computed(() => TAX_ID_META[this.country()]);
  formatTaxId = (taxId: string | null | undefined) => formatTaxIdForDisplay(taxId, this.country());

  form = this.fb.group({
    name: ['', Validators.required],
    address: this.fb.control<AddressValue | null>(null, Validators.required),
    phone: [''],
    taxId: ['', taxIdValidator(() => this.country())],
  });

  ngOnInit(): void {
    this.tenantService.getMe().subscribe(t => {
      if (t.countryCode) this.country.set(t.countryCode as SupportedCountry);
    });
    if (!this.subService.me()) {
      this.subService.getMe().subscribe(() => this.loadIfEligible());
      return;
    }
    this.loadIfEligible();
  }

  private loadIfEligible(): void {
    if (this.hasMultiUnit()) this.load();
  }

  private load(): void {
    this.unitService.list().subscribe(units => this.units.set(units));
  }

  goToSubscription(): void {
    this.router.navigate(['/subscription']);
  }

  openCreate(): void {
    this.editingId.set(null);
    this.form.reset({ name: '', address: null, phone: '', taxId: '' });
    this.dialogVisible.set(true);
  }

  openEdit(unit: TenantUnit): void {
    this.editingId.set(unit.id);
    this.form.reset({
      name: unit.name,
      phone: unit.phone ?? '',
      taxId: unit.taxId ?? '',
      address: {
        street: unit.address,
        complement: unit.addressComplement,
        postalCode: unit.postalCode,
        city: unit.city,
        country: unit.country,
        latitude: unit.latitude,
        longitude: unit.longitude,
      },
    });
    this.dialogVisible.set(true);
  }

  save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.saving.set(true);
    const v = this.form.value;
    const addr = addressValueToFields(v.address);
    const payload: TenantUnitPayload = {
      name: v.name!,
      phone: v.phone || undefined,
      taxId: v.taxId || undefined,
      address: addr.address!,
      addressComplement: addr.addressComplement,
      city: addr.city,
      country: addr.country,
      postalCode: addr.postalCode,
      latitude: addr.latitude,
      longitude: addr.longitude,
    };

    const obs$ = this.editingId()
      ? this.unitService.update(this.editingId()!, payload)
      : this.unitService.create(payload);

    obs$.subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogVisible.set(false);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('tenantUnits.saved') });
        this.load();
      },
      error: () => {
        this.saving.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('tenantUnits.saveError') });
      }
    });
  }

  deactivate(unit: TenantUnit): void {
    this.toggle(unit, false);
  }

  activate(unit: TenantUnit): void {
    this.toggle(unit, true);
  }

  private toggle(unit: TenantUnit, activate: boolean): void {
    if (this.pendingId()) return;
    this.pendingId.set(unit.id);
    const obs$ = activate ? this.unitService.activate(unit.id) : this.unitService.deactivate(unit.id);
    obs$.subscribe({
      next: () => {
        this.pendingId.set(null);
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant(activate ? 'tenantUnits.activated' : 'tenantUnits.deactivated', { name: unit.name })
        });
        this.load();
      },
      error: () => {
        this.pendingId.set(null);
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant(activate ? 'tenantUnits.activateError' : 'tenantUnits.deactivateError')
        });
      }
    });
  }
}
