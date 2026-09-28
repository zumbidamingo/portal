import { RouterLink } from '@angular/router';
import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ValidationErrors, Validators, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { PanelModule } from 'primeng/panel';
import { MessageService } from 'primeng/api';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, concatMap, tap } from 'rxjs';
import { Tenant, TenantService, TenantSystemParameters } from '../../../core/services/tenant.service';
import { QuotationService, QuotationNumbering } from '../../../core/services/quotation.service';
import { LaundryFeatureService } from '../../../core/services/laundry-feature.service';
import { LaundryFacilityService, LaundryFacility } from '../../../core/services/laundry-facility.service';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SystemParamsDiscoveryService } from '../../../core/services/system-params-discovery.service';
import { formatQuotationNumber, quotationErrorMessage } from '../../quotations/quotation-form.utils';

@Component({
  selector: 'app-system-parameters',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe,
    ButtonModule, InputNumberModule, SelectModule, ToggleSwitchModule, PanelModule, PageHeaderComponent],
  template: `
    <div class="max-w-2xl">
      <app-page-header [title]="'profile.tabSystemParams' | translate" [description]="'systemParameters.subtitle' | translate"
                       [breadcrumb]="[{ label: 'nav.administration' | translate, route: '/administration' }]"></app-page-header>

      <form [formGroup]="systemParamsForm" class="space-y-4">
        <!-- Orçamentos -->
        <p-panel [header]="'systemParameters.quotationSection' | translate">
          <div class="space-y-4">
            <div>
              <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">
                {{ 'systemParameters.defaultQuotationValidityDays' | translate }}
              </label>
              <p-inputNumber formControlName="defaultQuotationValidityDays" [min]="1" [max]="365"
                             suffix=" {{ 'systemParameters.days' | translate }}" fluid (onBlur)="persist()"></p-inputNumber>
              @if (systemParamsForm.get('defaultQuotationValidityDays')?.invalid && systemParamsForm.get('defaultQuotationValidityDays')?.touched) {
                <small class="text-app-danger">{{ 'systemParameters.defaultQuotationValidityDaysError' | translate }}</small>
              } @else {
                <small class="text-app-text-tertiary">{{ 'systemParameters.defaultQuotationValidityDaysHint' | translate }}</small>
              }
            </div>

            <div class="border-t border-app-border pt-4 space-y-3">
              <p class="text-[11px] font-medium text-app-text-secondary">
                {{ 'systemParameters.discountModalitySection' | translate }}
              </p>
              <div class="flex items-center justify-between gap-4">
                <div>
                  <p class="text-sm text-app-text">{{ 'systemParameters.totalDiscountEnabled' | translate }}</p>
                  <p class="text-xs text-app-text-tertiary">{{ 'systemParameters.totalDiscountEnabledHint' | translate }}</p>
                </div>
                <p-toggleswitch formControlName="totalDiscountEnabled" class="shrink-0" (onChange)="persist()"></p-toggleswitch>
              </div>
              <div class="flex items-center justify-between gap-4">
                <div>
                  <p class="text-sm text-app-text">{{ 'systemParameters.itemDiscountEnabled' | translate }}</p>
                  <p class="text-xs text-app-text-tertiary">{{ 'systemParameters.itemDiscountEnabledHint' | translate }}</p>
                </div>
                <p-toggleswitch formControlName="itemDiscountEnabled" class="shrink-0" (onChange)="persist()"></p-toggleswitch>
              </div>
              <div class="flex items-center justify-between gap-4">
                <div>
                  <p class="text-sm text-app-text">{{ 'systemParameters.discountCapEnabled' | translate }}</p>
                  <p class="text-xs text-app-text-tertiary">{{ 'systemParameters.discountCapEnabledHint' | translate }}</p>
                </div>
                <p-toggleswitch formControlName="discountCapEnabled" class="shrink-0" (onChange)="persist()"></p-toggleswitch>
              </div>
              @if (!systemParamsForm.value.totalDiscountEnabled && !systemParamsForm.value.itemDiscountEnabled) {
                <p class="text-xs text-app-warning">{{ 'systemParameters.noDiscountModalityWarning' | translate }}</p>
              }
            </div>

            <div class="border-t border-app-border pt-4 space-y-3">
              <p class="text-[11px] font-medium text-app-text-secondary">
                {{ 'systemParameters.approvalSection' | translate }}
              </p>
              <div class="flex items-center justify-between gap-4">
                <div>
                  <p class="text-sm text-app-text">{{ 'systemParameters.directQuotationApprovalEnabled' | translate }}</p>
                  <p class="text-xs text-app-text-tertiary">{{ 'systemParameters.directQuotationApprovalEnabledHint' | translate }}</p>
                </div>
                <p-toggleswitch formControlName="directQuotationApprovalEnabled" class="shrink-0" (onChange)="persist()"></p-toggleswitch>
              </div>
            </div>

            <!-- Numeração grava por conta própria (endpoint distinto), por isso tem botão próprio (o número inicial não volta atrás). -->
            <div class="border-t border-app-border pt-4 space-y-3">
              <p class="text-[11px] font-medium text-app-text-secondary">
                {{ 'systemParameters.numberingSection' | translate }}
              </p>
              @if (numbering(); as n) {
                <div [formGroup]="numberingForm" class="space-y-3">
                  <div>
                    <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">
                      {{ 'systemParameters.startingQuotationNumber' | translate }}
                    </label>
                    <p-inputNumber formControlName="startingNumber" [min]="n.nextNumber" [useGrouping]="false" fluid></p-inputNumber>
                    @if (numberingForm.get('startingNumber')?.invalid && numberingForm.get('startingNumber')?.touched) {
                      <small class="text-app-danger">{{ 'systemParameters.startingQuotationNumberMin' | translate: { next: formatQuotationNumber(n.nextNumber) } }}</small>
                    } @else {
                      <small class="text-app-text-tertiary">{{ 'systemParameters.startingQuotationNumberHint' | translate: { next: formatQuotationNumber(n.nextNumber) } }}</small>
                    }
                  </div>
                  <div class="flex justify-end">
                    <p-button type="button" severity="secondary" [outlined]="true" (onClick)="saveNumbering()"
                              [label]="'common.save' | translate" icon="pi pi-check"
                              [loading]="savingNumbering()" [disabled]="numberingForm.invalid || numberingForm.value.startingNumber === n.nextNumber"></p-button>
                  </div>
                </div>
              }
            </div>
          </div>
        </p-panel>

        <!-- Ordens de Serviço -->
        <p-panel [header]="'systemParameters.ordersSection' | translate">
          <div class="flex items-center justify-between gap-4">
            <div>
              <p class="text-sm text-app-text">{{ 'systemParameters.requiresSignature' | translate }}</p>
              <p class="text-xs text-app-text-tertiary">{{ 'systemParameters.requiresSignatureHint' | translate }}</p>
            </div>
            <p-toggleswitch formControlName="requiresSignature" class="shrink-0" (onChange)="persist()"></p-toggleswitch>
          </div>
        </p-panel>

        <!-- Envio ao cliente -->
        <p-panel [header]="'systemParameters.customerDeliverySection' | translate">
          <div class="space-y-4">
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="text-sm text-app-text">{{ 'systemParameters.autoSendInvoice' | translate }}</p>
                <p class="text-xs text-app-text-tertiary">{{ 'systemParameters.autoSendInvoiceHint' | translate }}</p>
              </div>
              <p-toggleswitch formControlName="autoSendInvoiceEnabled" class="shrink-0" (onChange)="persist()"></p-toggleswitch>
            </div>
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="text-sm text-app-text">{{ 'systemParameters.autoSendReport' | translate }}</p>
                <p class="text-xs text-app-text-tertiary">{{ 'systemParameters.autoSendReportHint' | translate }}</p>
              </div>
              <p-toggleswitch formControlName="autoSendReportEnabled" class="shrink-0" (onChange)="persist()"></p-toggleswitch>
            </div>
          </div>
        </p-panel>

        <!-- Rotas e agendamento -->
        <p-panel [header]="'systemParameters.routesSection' | translate">
          <div class="space-y-4">
            <div>
              <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">
                {{ 'systemParameters.serviceToleranceMinutes' | translate }}
              </label>
              <p-inputNumber formControlName="serviceToleranceMinutes" [min]="0" [max]="480"
                             suffix=" min" fluid (onBlur)="persist()"></p-inputNumber>
              <small class="text-app-text-tertiary">{{ 'systemParameters.serviceToleranceMinutesHint' | translate }}</small>
            </div>
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="text-sm text-app-text">{{ 'systemParameters.forceRouteStartFromCompany' | translate }}</p>
                <p class="text-xs text-app-text-tertiary">{{ 'systemParameters.forceRouteStartFromCompanyHint' | translate }}</p>
              </div>
              <p-toggleswitch formControlName="forceRouteStartFromCompany" class="shrink-0" (onChange)="persist()"></p-toggleswitch>
            </div>
          </div>
        </p-panel>

        <!-- Lavanderia -->
        <p-panel [header]="'systemParameters.laundrySection' | translate">
          <div class="space-y-4">
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="text-sm text-app-text">{{ 'systemParameters.laundryEnabled' | translate }}</p>
                <p class="text-xs text-app-text-tertiary">{{ 'systemParameters.laundryEnabledHint' | translate }}</p>
              </div>
              @if (laundryFeature.availableInPlan()) {
                <p-toggleswitch formControlName="laundryEnabled" class="shrink-0" (onChange)="persist()"></p-toggleswitch>
              } @else {
                <span class="shrink-0 text-[11px] bg-app-accent-soft text-app-accent-hover px-2 py-0.5 rounded-full font-medium">
                  {{ 'systemParameters.laundryNotInPlanBadge' | translate }}
                </span>
              }
            </div>

            @if (!laundryFeature.availableInPlan()) {
              <p class="text-xs text-app-text-secondary">
                {{ 'systemParameters.laundryNotInPlanHint' | translate }}
                <a routerLink="/subscription" class="underline underline-offset-2">{{ 'systemParameters.laundryNotInPlanCta' | translate }}</a>
              </p>
            } @else if (!systemParamsForm.value.laundryEnabled) {
              <p class="text-xs text-app-text-secondary">{{ 'systemParameters.laundryOffHint' | translate }}</p>
            } @else {
              <div>
                <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">
                  {{ 'systemParameters.preferredLaundryFacility' | translate }}
                </label>
                <p-select [options]="laundryFacilityOptions()" formControlName="preferredLaundryFacilityId"
                          optionLabel="label" optionValue="value" appendTo="body" fluid [showClear]="true"
                          (onChange)="persist()"
                          [placeholder]="'systemParameters.preferredLaundryFacilityPlaceholder' | translate"></p-select>
                <small class="text-app-text-tertiary">{{ 'systemParameters.preferredLaundryFacilityHint' | translate }}</small>
              </div>
            }
          </div>
        </p-panel>

        <!-- Notificações (issue #331) -->
        <p-panel [header]="'systemParameters.notificationsSection' | translate">
          <div class="space-y-4">
            <div>
              <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">
                {{ 'systemParameters.notificationLateStartMinutes' | translate }}
              </label>
              <p-inputNumber formControlName="notificationLateStartMinutes" [min]="5" [max]="120"
                             suffix=" {{ 'systemParameters.minutes' | translate }}" fluid (onBlur)="persist()"></p-inputNumber>
              @if (systemParamsForm.get('notificationLateStartMinutes')?.invalid && systemParamsForm.get('notificationLateStartMinutes')?.touched) {
                <small class="text-app-danger">{{ 'systemParameters.notificationLateStartMinutesError' | translate }}</small>
              } @else {
                <small class="text-app-text-tertiary">{{ 'systemParameters.notificationLateStartMinutesHint' | translate }}</small>
              }
            </div>

            <div class="border-t border-app-border pt-4 space-y-3">
              <div class="flex items-center justify-between gap-4">
                <div>
                  <p class="text-sm text-app-text">{{ 'systemParameters.notificationQuietHours' | translate }}</p>
                  <p class="text-xs text-app-text-tertiary">{{ 'systemParameters.notificationQuietHoursHint' | translate }}</p>
                </div>
                <p-toggleswitch formControlName="notificationQuietHoursEnabled" class="shrink-0" (onChange)="persist()"></p-toggleswitch>
              </div>
              @if (systemParamsForm.value.notificationQuietHoursEnabled) {
                <div class="flex items-center gap-3">
                  <label class="text-xs text-app-text-secondary" for="quiet-start">{{ 'systemParameters.notificationQuietFrom' | translate }}</label>
                  <input id="quiet-start" type="time" formControlName="notificationQuietStart" (change)="persist()"
                         class="rounded-md border border-app-border bg-app-bg px-2 py-1.5 text-sm text-app-text">
                  <label class="text-xs text-app-text-secondary" for="quiet-end">{{ 'systemParameters.notificationQuietTo' | translate }}</label>
                  <input id="quiet-end" type="time" formControlName="notificationQuietEnd" (change)="persist()"
                         class="rounded-md border border-app-border bg-app-bg px-2 py-1.5 text-sm text-app-text">
                </div>
                @if (systemParamsForm.errors?.['quietRange']) {
                  <small class="text-app-danger">{{ 'systemParameters.notificationQuietRangeError' | translate }}</small>
                }
              }
            </div>
          </div>
        </p-panel>

      </form>
    </div>
  `,
})
export class SystemParametersComponent implements OnInit {
  private fb = inject(FormBuilder);
  private messageService = inject(MessageService);
  private translate = inject(TranslateService);
  private tenantService = inject(TenantService);
  private quotationService = inject(QuotationService);
  private laundryFacilityService = inject(LaundryFacilityService);
  protected laundryFeature = inject(LaundryFeatureService);

  private discovery = inject(SystemParamsDiscoveryService);
  private tenantId = signal<string | null>(null);

  /** Fila serial: gravações rápidas chegam ao servidor na ordem, e o último estado do form vence. */
  private persistQueue = new Subject<{ id: string; params: TenantSystemParameters }>();

  constructor() {
    this.persistQueue.pipe(
      concatMap(({ id, params }) => this.tenantService.updateSystemParameters(id, params).pipe(
        tap(r => {
          this.messageService.add({ severity: 'success', summary: this.translate.instant('systemParameters.saved') });
          if (r.laundry?.active && this.laundryFacilities().length === 0) this.loadLaundryFacilities();
        }),
        catchError((err) => {
          this.messageService.add({ severity: 'error', summary: this.saveErrorMessage(err) });
          // Desfaz o estado otimista: o form volta ao que o servidor realmente tem.
          this.tenantService.getMe().subscribe(r => this.applyParameters(r));
          return EMPTY;
        }),
      )),
      takeUntilDestroyed(),
    ).subscribe();
  }

  private loadLaundryFacilities(): void {
    this.laundryFacilityService.list({ active: true, size: 100 }).subscribe({
      next: page => this.laundryFacilities.set(page.content),
      error: () => {},
    });
  }

  /** Recusas de negócio da lavanderia têm texto próprio — dizem o que fazer, não só que falhou. */
  private saveErrorMessage(err: { error?: { errorCode?: string; detail?: string } }): string {
    const code = err?.error?.errorCode;
    if (code === 'LAUNDRY_HAS_OPEN_ITEMS') {
      return this.translate.instant('systemParameters.laundryHasOpenItems');
    }
    if (code === 'LAUNDRY_NOT_IN_PLAN') {
      return this.translate.instant('systemParameters.laundryNotInPlanError');
    }
    return this.translate.instant('systemParameters.saveError');
  }

  private laundryFacilities = signal<LaundryFacility[]>([]);
  laundryFacilityOptions = computed(() => this.laundryFacilities().map(f => ({ value: f.id, label: f.name })));

  systemParamsForm = this.fb.group({
    defaultQuotationValidityDays: [30, [Validators.required, Validators.min(1), Validators.max(365)]],
    totalDiscountEnabled: [true],
    itemDiscountEnabled: [false],
    discountCapEnabled: [true],
    directQuotationApprovalEnabled: [true],
    serviceToleranceMinutes: [15, [Validators.required, Validators.min(0), Validators.max(480)]],
    forceRouteStartFromCompany: [true],
    requiresSignature: [true],
    autoSendInvoiceEnabled: [true],
    autoSendReportEnabled: [true],
    laundryEnabled: [true],
    preferredLaundryFacilityId: this.fb.control<string | null>(null),
    notificationLateStartMinutes: [15, [Validators.required, Validators.min(5), Validators.max(120)]],
    notificationQuietHoursEnabled: [true],
    notificationQuietStart: ['20:00', [Validators.required]],
    notificationQuietEnd: ['07:00', [Validators.required]],
  }, {
    // O silêncio precisa de início e fim diferentes; um início depois do fim é o intervalo que cruza a meia-noite.
    validators: [(group: AbstractControl): ValidationErrors | null => {
      const on = group.get('notificationQuietHoursEnabled')?.value;
      return on && group.get('notificationQuietStart')?.value === group.get('notificationQuietEnd')?.value
        ? { quietRange: true } : null;
    }],
  });

  readonly formatQuotationNumber = formatQuotationNumber;
  numbering = signal<QuotationNumbering | null>(null);
  savingNumbering = signal(false);
  numberingForm = this.fb.group({
    startingNumber: [1, [Validators.required, Validators.min(1)]],
  });

  ngOnInit() {
    this.tenantService.getMe().subscribe({
      next: (r) => {
        this.applyParameters(r);
        this.discovery.markVisited();
      },
      error: () => {
        this.messageService.add({
          severity: 'warn',
          summary: this.translate.instant('tenant.profileNotFound'),
        });
      }
    });
    // A API de lavanderia responde 422 com o fluxo desligado — só se pede quando está em uso.
    if (this.laundryFeature.active()) this.loadLaundryFacilities();
    this.quotationService.getNumbering().subscribe({
      next: n => {
        this.numbering.set(n);
        this.numberingForm.controls.startingNumber.setValidators([Validators.required, Validators.min(n.nextNumber)]);
        this.numberingForm.patchValue({ startingNumber: n.nextNumber });
      },
      error: () => {},
    });
  }

  saveNumbering(): void {
    this.numberingForm.markAllAsTouched();
    if (this.numberingForm.invalid) return;
    this.savingNumbering.set(true);
    this.quotationService.setStartingNumber(this.numberingForm.value.startingNumber!).subscribe({
      next: n => {
        this.savingNumbering.set(false);
        this.numbering.set(n);
        this.numberingForm.controls.startingNumber.setValidators([Validators.required, Validators.min(n.nextNumber)]);
        this.numberingForm.patchValue({ startingNumber: n.nextNumber });
        this.messageService.add({ severity: 'success', summary: this.translate.instant('systemParameters.startingQuotationNumberSaved') });
      },
      error: (err) => {
        this.savingNumbering.set(false);
        this.messageService.add({
          severity: 'error',
          summary: quotationErrorMessage(err, this.translate, 'systemParameters.startingQuotationNumberSaveError'),
        });
      },
    });
  }

  /** Grava a cada toggle/seleção e ao sair de um campo numérico. Campo inválido não é enviado —
   *  o utilizador ainda está a editar (o erro aparece no próprio campo). */
  persist(): void {
    this.systemParamsForm.markAllAsTouched();
    if (this.systemParamsForm.invalid) return;
    const id = this.tenantId();
    if (!id) {
      this.messageService.add({ severity: 'error', summary: this.translate.instant('tenant.saveError') });
      return;
    }
    this.persistQueue.next({ id, params: this.currentParams() });
  }

  private currentParams(): TenantSystemParameters {
    return {
      defaultQuotationValidityDays: this.systemParamsForm.value.defaultQuotationValidityDays!,
      totalDiscountEnabled: this.systemParamsForm.value.totalDiscountEnabled!,
      itemDiscountEnabled: this.systemParamsForm.value.itemDiscountEnabled!,
      discountCapEnabled: this.systemParamsForm.value.discountCapEnabled!,
      directQuotationApprovalEnabled: this.systemParamsForm.value.directQuotationApprovalEnabled!,
      serviceToleranceMinutes: this.systemParamsForm.value.serviceToleranceMinutes!,
      forceRouteStartFromCompany: this.systemParamsForm.value.forceRouteStartFromCompany!,
      requiresSignature: this.systemParamsForm.value.requiresSignature!,
      autoSendInvoiceEnabled: this.systemParamsForm.value.autoSendInvoiceEnabled!,
      autoSendReportEnabled: this.systemParamsForm.value.autoSendReportEnabled!,
      laundryEnabled: this.systemParamsForm.value.laundryEnabled!,
      preferredLaundryFacilityId: this.systemParamsForm.value.preferredLaundryFacilityId ?? null,
      notificationLateStartMinutes: this.systemParamsForm.value.notificationLateStartMinutes!,
      notificationQuietHoursEnabled: this.systemParamsForm.value.notificationQuietHoursEnabled!,
      notificationQuietStart: this.systemParamsForm.value.notificationQuietStart!,
      notificationQuietEnd: this.systemParamsForm.value.notificationQuietEnd!,
    };
  }

  private applyParameters(r: Tenant): void {
    this.tenantId.set(r.id);
    this.systemParamsForm.patchValue({
      defaultQuotationValidityDays: r.systemParameters?.defaultQuotationValidityDays ?? 30,
      totalDiscountEnabled: r.systemParameters?.totalDiscountEnabled ?? true,
      itemDiscountEnabled: r.systemParameters?.itemDiscountEnabled ?? false,
      discountCapEnabled: r.systemParameters?.discountCapEnabled ?? true,
      directQuotationApprovalEnabled: r.systemParameters?.directQuotationApprovalEnabled ?? true,
      serviceToleranceMinutes: r.systemParameters?.serviceToleranceMinutes ?? 15,
      forceRouteStartFromCompany: r.systemParameters?.forceRouteStartFromCompany ?? true,
      requiresSignature: r.systemParameters?.requiresSignature ?? true,
      autoSendInvoiceEnabled: r.systemParameters?.autoSendInvoiceEnabled ?? true,
      autoSendReportEnabled: r.systemParameters?.autoSendReportEnabled ?? true,
      laundryEnabled: r.systemParameters?.laundryEnabled ?? true,
      preferredLaundryFacilityId: r.systemParameters?.preferredLaundryFacilityId ?? null,
      notificationLateStartMinutes: r.systemParameters?.notificationLateStartMinutes ?? 15,
      notificationQuietHoursEnabled: r.systemParameters?.notificationQuietHoursEnabled ?? true,
      notificationQuietStart: r.systemParameters?.notificationQuietStart ?? '20:00',
      notificationQuietEnd: r.systemParameters?.notificationQuietEnd ?? '07:00',
    });
  }
}
