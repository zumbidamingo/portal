import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { DialogModule } from 'primeng/dialog';
import { DrawerModule } from 'primeng/drawer';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { Panel } from 'primeng/panel';
import { ConfirmationService, MessageService } from 'primeng/api';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, Subject, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, switchMap, tap } from 'rxjs/operators';
import {
  LaundryFacilityService, LaundryFacility, LaundryFacilityPage, LaundryFacilityServicePrice, LaundryOperator,
  CreateLaundryOperatorResult,
} from '../../../core/services/laundry-facility.service';
import { ServiceService, CatalogService } from '../../../core/services/catalog.service';
import { TenantUserService } from '../../../core/services/tenant-user.service';
import { TenantService } from '../../../core/services/tenant.service';
import { AuthService } from '../../../core/auth/auth.service';
import { AddressAutocompleteComponent, AddressValue } from '../../../shared/components/address-autocomplete/address-autocomplete.component';
import { addressValueToFields } from '../../../shared/utils/address.util';
import { maskPersonalTaxIdInput, personalTaxIdValidator } from '../../../shared/utils/tax-id.validator';
import { TagBadgeComponent } from '../../../shared/components/tag-badge/tag-badge.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { TableStandardDirective } from '../../../shared/directives/table-standard.directive';

const PAGE_SIZE = 20;

/**
 * CRUD de lavanderias terceirizadas — domínio próprio (nome, morada, preço por tipo de serviço),
 * fora de Equipa e Prestadores. Cada facility pode ter zero ou mais operadores (login sintético +
 * senha padrão, mesmo mecanismo da criação de técnico em Prestadores). Listagem no mesmo padrão
 * das demais telas administrativas (Prestadores, Habilidades): p-panel com busca/filtro + p-table
 * paginado no servidor, não uma lista solta em divs.
 */
@Component({
  selector: 'app-laundry-facilities',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TranslatePipe, TableModule, ButtonModule, InputTextModule,
    InputNumberModule, SelectModule, DialogModule, DrawerModule, TooltipModule, ToastModule, ConfirmDialogModule,
    Panel, AddressAutocompleteComponent, TagBadgeComponent, PageHeaderComponent, EmptyStateComponent, TableStandardDirective],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast position="top-right"></p-toast>
    <p-confirmDialog></p-confirmDialog>

    <app-page-header [title]="'laundryFacilities.title' | translate" [description]="'laundryFacilities.subtitle' | translate"
                     [breadcrumb]="[{ label: 'nav.administration' | translate, route: '/administration' }]">
      @if (!facilitiesEmpty()) {
        <p-button [label]="'laundryFacilities.add' | translate" icon="pi pi-plus" size="small" (onClick)="openCreate()"></p-button>
      }
    </app-page-header>

    @if (facilitiesEmpty()) {
      <app-empty-state icon="pi pi-building" [message]="'laundryFacilities.empty' | translate"
                        [subtitle]="'laundryFacilities.emptySubtitle' | translate">
      </app-empty-state>
      <div class="flex justify-center -mt-3">
        <p-button [label]="'laundryFacilities.add' | translate" icon="pi pi-plus" (onClick)="openCreate()"></p-button>
      </div>
    } @else {
    <p-panel>
      <div class="space-y-4 min-w-0">
        <div class="flex flex-wrap items-end gap-3">
          <div class="flex-1 min-w-56">
            <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'common.search' | translate }}</label>
            <input pInputText fluid [(ngModel)]="search" [placeholder]="'laundryFacilities.searchPlaceholder' | translate"
                  autocomplete="off"
                  (ngModelChange)="applyFilters()" />
          </div>
          <div class="w-44">
            <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'common.status' | translate }}</label>
            <p-select [options]="activeOptions" [(ngModel)]="activeFilter" optionLabel="label" optionValue="value"
                      appendTo="body" fluid [showClear]="true" (onChange)="applyFilters()"></p-select>
          </div>
          @if (hasActiveFilters()) {
            <p-button [label]="'common.clearFilters' | translate" icon="pi pi-filter-slash" [text]="true" size="small"
                      (onClick)="clearFilters()"></p-button>
          }
        </div>

        <p-table appTableStandard [value]="rows()" dataKey="id" styleClass="p-datatable-sm"
                [lazy]="true" [rows]="pageSize" [totalRecords]="total()"
                [loading]="loading()" [showLoader]="false" [first]="first()"
                (onLazyLoad)="onLazyLoad($event)">
          <ng-template pTemplate="header">
            <tr>
              <th>{{ 'laundryFacilities.name' | translate }}</th>
              <th>{{ 'laundryFacilities.addressColumn' | translate }}</th>
              <th>{{ 'common.status' | translate }}</th>
              <th class="text-right w-20">{{ 'common.actions' | translate }}</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-facility>
            <tr class="group cursor-pointer" (click)="openManage(facility)">
              <td class="font-medium text-app-text">
                <span class="inline-flex items-center gap-1.5">
                  {{ facility.name }}
                  @if (isPreferred(facility)) {
                    <app-tag-badge [value]="'laundryFacilities.preferred' | translate" severity="primary"></app-tag-badge>
                  }
                </span>
              </td>
              <td class="text-sm text-app-text-secondary">{{ facility.address }}</td>
              <td>
                <app-tag-badge [value]="(facility.active ? 'common.active' : 'common.inactive') | translate"
                              [severity]="facility.active ? 'success' : 'secondary'"></app-tag-badge>
              </td>
              <td class="text-right whitespace-nowrap" (click)="$event.stopPropagation()">
                @if (canWrite()) {
                  <span>
                    <p-button icon="pi pi-pencil" [text]="true" size="small" severity="secondary"
                              [pTooltip]="'laundryFacilities.manageTooltip' | translate" tooltipPosition="top"
                              (onClick)="openEdit(facility)"></p-button>
                    @if (facility.active) {
                      <p-button icon="pi pi-times-circle" [text]="true" size="small" severity="warn"
                                [pTooltip]="'laundryFacilities.deactivate' | translate" tooltipPosition="top"
                                [loading]="pendingId() === facility.id" (onClick)="confirmDeactivate(facility)"></p-button>
                    } @else {
                      <p-button icon="pi pi-check-circle" [text]="true" size="small" severity="info"
                                [pTooltip]="'laundryFacilities.activate' | translate" tooltipPosition="top"
                                [loading]="pendingId() === facility.id" (onClick)="toggleActive(facility, true)"></p-button>
                    }
                  </span>
                }
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="4" class="text-center text-app-text-tertiary py-10">
                <i class="pi pi-search text-2xl mb-2 block"></i>
                <p class="text-sm font-medium text-app-text">{{ 'common.noResults' | translate }}</p>
                <p-button [label]="'common.clearFilters' | translate" [text]="true" size="small" class="inline-block mt-2"
                          (onClick)="clearFilters()"></p-button>
              </td>
            </tr>
          </ng-template>
        </p-table>
      </div>
    </p-panel>
    }

    <!-- Dialog: criar/editar lavanderia -->
    <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '32rem' }"
              [header]="(editingId() ? 'laundryFacilities.editTitle' : 'laundryFacilities.addTitle') | translate">
      <form [formGroup]="form" (ngSubmit)="save()" class="space-y-4">
        <div>
          <label class="label">{{ 'laundryFacilities.name' | translate }} *</label>
          <input pInputText formControlName="name" fluid />
        </div>
        <div>
          <app-address-autocomplete formControlName="address" [required]="true"></app-address-autocomplete>
        </div>
        <div class="flex justify-end gap-2">
          <p-button type="button" [label]="'common.close' | translate" [outlined]="true" (onClick)="dialogVisible.set(false)"></p-button>
          <p-button type="submit" [label]="'common.save' | translate" icon="pi pi-check"
                    [loading]="saving()" [disabled]="form.invalid"></p-button>
        </div>
      </form>
    </p-dialog>

    <!-- Dialog: login/senha do operador — some ao fechar, hash é one-way, não há como recuperar depois -->
    <p-dialog [(visible)]="credentialsVisible" [modal]="true" [closable]="false" [style]="{ width: '26rem' }"
              [header]="'laundryFacilities.credentialsTitle' | translate">
      @if (credentialsResult(); as result) {
        <div class="space-y-4">
          <p class="text-sm text-app-warning flex items-start gap-1.5">
            <i class="pi pi-exclamation-triangle mt-0.5"></i>
            <span>{{ 'laundryFacilities.credentialsWarning' | translate }}</span>
          </p>
          <div>
            <label class="label">{{ 'common.email' | translate }}</label>
            <p class="text-sm font-mono text-app-text">{{ result.email }}</p>
          </div>
          <div>
            <label class="label">{{ 'laundryFacilities.credentialsPassword' | translate }}</label>
            <p class="text-sm font-mono text-app-text">{{ result.temporaryPassword }}</p>
          </div>
          <div class="flex justify-end">
            <p-button [label]="'laundryFacilities.credentialsClose' | translate" (onClick)="closeCredentials()"></p-button>
          </div>
        </div>
      }
    </p-dialog>

    <!-- Drawer: gerir lavanderia — operadores + ativar/desativar -->
    <p-drawer [(visible)]="manageVisible" position="right" [dismissible]="true" [closeOnEscape]="true" styleClass="w-full! sm:w-[28rem]!">
      <ng-template #header>
        @if (managing(); as f) {
          <div class="flex items-center gap-2 min-w-0">
            <span class="font-semibold text-app-text truncate">{{ f.name }}</span>
            @if (isPreferred(f)) {
              <app-tag-badge [value]="'laundryFacilities.preferred' | translate" severity="primary"></app-tag-badge>
            }
            <app-tag-badge [value]="(f.active ? 'common.active' : 'common.inactive') | translate"
                          [severity]="f.active ? 'success' : 'secondary'"></app-tag-badge>
          </div>
        }
      </ng-template>

      @if (managing(); as f) {
        <div class="space-y-5 pb-4">
          <section class="space-y-2">
            <h4 class="section-title">{{ 'laundryFacilities.detailSection' | translate }}</h4>
            <p class="text-sm text-app-text-secondary">{{ f.address }}</p>
          </section>

          <section class="space-y-3 border-t border-app-border pt-4">
            <div class="flex items-center justify-between">
              <h4 class="section-title">{{ 'laundryFacilities.servicePrices.section' | translate }}</h4>
              <p-button [label]="'laundryFacilities.servicePrices.add' | translate" icon="pi pi-plus" size="small" [text]="true"
                        [disabled]="availableServicesForNewPrice().length === 0"
                        (onClick)="openAddServicePrice()"></p-button>
            </div>
            @if (servicePricesLoading()) {
              <p class="text-sm text-app-text-tertiary"><i class="pi pi-spin pi-spinner mr-1"></i>{{ 'common.loading' | translate }}</p>
            } @else if (servicePrices().length === 0) {
              <p class="text-sm text-app-text-tertiary">{{ 'laundryFacilities.servicePrices.empty' | translate }}</p>
            } @else {
              <ul class="space-y-1">
                @for (sp of servicePrices(); track sp.id) {
                  <li class="flex items-center justify-between gap-2 text-sm text-app-text py-1.5 border-b border-app-border-subtle last:border-0">
                    <span class="truncate">{{ serviceName(sp.serviceId) }}</span>
                    <span class="flex items-center gap-2 shrink-0">
                      <span class="text-app-text-secondary">{{ sp.price.amount | currency:sp.price.currency }}</span>
                      <p-button icon="pi pi-trash" [text]="true" size="small" severity="danger"
                                (onClick)="confirmRemoveServicePrice(sp)"></p-button>
                    </span>
                  </li>
                }
              </ul>
            }
          </section>

          <section class="space-y-3 border-t border-app-border pt-4">
            <div class="flex items-center justify-between">
              <h4 class="section-title">{{ 'laundryFacilities.operatorsSection' | translate }}</h4>
              <p-button [label]="'laundryFacilities.newOperator' | translate" icon="pi pi-user-plus" size="small" [text]="true"
                        (onClick)="openCreateOperator()"></p-button>
            </div>
            @if (operatorsLoading()) {
              <p class="text-sm text-app-text-tertiary"><i class="pi pi-spin pi-spinner mr-1"></i>{{ 'common.loading' | translate }}</p>
            } @else if (operators().length === 0) {
              <p class="text-sm text-app-text-tertiary">{{ 'laundryFacilities.noOperators' | translate }}</p>
            } @else {
              <ul class="space-y-1">
                @for (op of operators(); track op.id) {
                  <li class="text-sm text-app-text py-1.5 border-b border-app-border-subtle last:border-0">
                    {{ operatorName(op) }}
                  </li>
                }
              </ul>
            }
          </section>

        </div>
        <ng-template #footer>
          @if (managing(); as f) {
            <div class="flex justify-end gap-2">
              
              @if (f.active) {
                <p-button [label]="'laundryFacilities.deactivate' | translate" icon="pi pi-times-circle" severity="warn"
                          [loading]="pendingId() === f.id" (onClick)="toggleActive(f, false)"></p-button>
              } @else {
                <p-button [label]="'laundryFacilities.activate' | translate" icon="pi pi-check-circle" severity="success"
                          [loading]="pendingId() === f.id" (onClick)="toggleActive(f, true)"></p-button>
              }

              <p-button icon="pi pi-pencil" [label]="'common.edit' | translate" (onClick)="openEdit(f)"></p-button>
            </div>
          }
        </ng-template>
      }
    </p-drawer>

    <!-- Dialog: novo operador -->
    <p-dialog [(visible)]="createOperatorVisible" [modal]="true" [style]="{ width: '26rem' }"
              [header]="'laundryFacilities.newOperatorTitle' | translate">
      <div class="space-y-4" [formGroup]="operatorForm">
        <p class="text-xs text-app-text-secondary">{{ 'laundryFacilities.operatorHint' | translate }}</p>
        <div>
          <label class="label">{{ 'providers.fullName' | translate }} *</label>
          <input pInputText formControlName="fullName" fluid />
        </div>
        <div>
          <label class="label">{{ 'providers.document' | translate }} *</label>
          <input pInputText formControlName="document" fluid autocomplete="off" inputmode="numeric"
                placeholder="000.000.000-00" (input)="maskOperatorDocument()" />
          @if (operatorForm.controls.document.invalid && operatorForm.controls.document.dirty) {
            <p class="text-xs text-app-danger mt-1">{{ 'providers.documentInvalid' | translate }}</p>
          } @else {
            <p class="text-xs text-app-text-tertiary mt-1">{{ 'providers.documentHint' | translate }}</p>
          }
        </div>
        <div class="flex justify-end gap-2">
          <p-button type="button" [label]="'common.close' | translate" [outlined]="true" (onClick)="createOperatorVisible.set(false)"></p-button>
          <p-button [label]="'common.save' | translate" icon="pi pi-check" [loading]="creatingOperator()"
                    [disabled]="operatorForm.invalid" (onClick)="saveOperator()"></p-button>
        </div>
      </div>
    </p-dialog>

    <!-- Dialog: preço por serviço -->
    <p-dialog [(visible)]="addPriceVisible" [modal]="true" [style]="{ width: '26rem' }"
              [header]="'laundryFacilities.servicePrices.add' | translate">
      <div class="space-y-4" [formGroup]="priceForm">
        <div>
          <label class="label">{{ 'laundryFacilities.servicePrices.selectService' | translate }} *</label>
          <p-select [options]="availableServicesForNewPrice()" formControlName="serviceId" optionLabel="name" optionValue="id"
                    appendTo="body" fluid [filter]="true"></p-select>
        </div>
        <div>
          <label class="label">{{ 'laundryFacilities.servicePrices.priceLabel' | translate }} ({{ tenantCurrency() }}) *</label>
          <p-inputnumber formControlName="priceAmount" mode="decimal" [minFractionDigits]="2" fluid></p-inputnumber>
        </div>
        <div class="flex justify-end gap-2">
          <p-button type="button" [label]="'common.close' | translate" [outlined]="true" (onClick)="addPriceVisible.set(false)"></p-button>
          <p-button [label]="'common.save' | translate" icon="pi pi-check" [loading]="savingPrice()"
                    [disabled]="priceForm.invalid" (onClick)="saveServicePrice()"></p-button>
        </div>
      </div>
    </p-dialog>
  `,
  styles: [`
    @reference "../../../../styles.css";
    .label { @apply block text-[11px] font-medium text-app-text-secondary mb-1.5; }
    .section-title { @apply text-[11px] font-semibold uppercase tracking-wide text-app-text-tertiary; }
  `],
})
export class LaundryFacilitiesComponent implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private facilityService = inject(LaundryFacilityService);
  private serviceService = inject(ServiceService);
  private tenantUserService = inject(TenantUserService);
  private tenantService = inject(TenantService);
  private auth = inject(AuthService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);
  private translate = inject(TranslateService);
  private destroyRef = inject(DestroyRef);

  readonly canWrite = () => ['OWNER', 'ADMIN', 'OPERATOR'].includes(this.auth.userRole() ?? '');
  readonly pageSize = PAGE_SIZE;

  readonly activeOptions = [
    { label: this.translate.instant('common.active'), value: true },
    { label: this.translate.instant('common.inactive'), value: false },
  ];

  rows = signal<LaundryFacility[]>([]);
  total = signal(0);
  first = signal(0);
  loading = signal(false);
  /** Primeira carga sem filtros e sem resultados — onboarding, distinto de "sem resultados para o filtro". */
  facilitiesEmpty = computed(() => !this.loading() && this.total() === 0 && !this.hasActiveFilters());
  search = '';
  activeFilter: boolean | null = null;
  private page = 0;
  private filterChange$ = new Subject<void>();
  tenantCurrency = signal('BRL');
  /** Destino usado automaticamente quando um técnico conclui uma coleta — definida em
   *  Parâmetros do Sistema, só exibida aqui pra quem gerencia as lavanderias saber qual é. */
  preferredFacilityId = signal<string | null>(null);

  dialogVisible = signal(false);
  saving = signal(false);
  editingId = signal<string | null>(null);

  manageVisible = signal(false);
  managing = signal<LaundryFacility | null>(null);
  pendingId = signal<string | null>(null);

  operators = signal<LaundryOperator[]>([]);
  operatorsLoading = signal(false);
  private userNames = new Map<string, string>();

  createOperatorVisible = signal(false);
  creatingOperator = signal(false);
  credentialsVisible = signal(false);
  credentialsResult = signal<CreateLaundryOperatorResult | null>(null);

  catalogServices = signal<CatalogService[]>([]);
  servicePrices = signal<LaundryFacilityServicePrice[]>([]);
  servicePricesLoading = signal(false);
  availableServicesForNewPrice = computed(() => {
    const priced = new Set(this.servicePrices().map(sp => sp.serviceId));
    return this.catalogServices().filter(s => !priced.has(s.id));
  });

  addPriceVisible = signal(false);
  savingPrice = signal(false);

  form = this.fb.group({
    name: ['', Validators.required],
    address: this.fb.control<AddressValue | null>(null, Validators.required),
  });

  readonly operatorForm = this.fb.group({
    fullName: this.fb.control('', { nonNullable: true, validators: [Validators.required] }),
    document: this.fb.control('', { nonNullable: true, validators: [Validators.required, personalTaxIdValidator()] }),
  });

  readonly priceForm = this.fb.group({
    serviceId: this.fb.control<string | null>(null, Validators.required),
    priceAmount: this.fb.control<number | null>(null, Validators.required),
  });

  ngOnInit(): void {
    this.tenantService.getMe().subscribe({
      next: t => {
        if (t.currency) this.tenantCurrency.set(t.currency);
        this.preferredFacilityId.set(t.systemParameters?.preferredLaundryFacilityId ?? null);
      },
      error: () => {},
    });
    this.serviceService.list({ active: true, size: 200 }).subscribe({
      next: page => this.catalogServices.set(page.content),
      error: () => {},
    });
    this.tenantUserService.directory().subscribe({
      next: users => users.forEach(u => this.userNames.set(u.id, u.name)),
      error: () => {},
    });
    this.wireFilters();
    this.load();
  }

  /** Busca/estado disparam aqui; debounce+distinctUntilChanged evitam requests supérfluos,
   *  switchMap cancela a busca anterior quando uma nova é iniciada. */
  private wireFilters(): void {
    const sub = this.filterChange$.pipe(
      debounceTime(300),
      map(() => this.filterKey()),
      distinctUntilChanged(),
      tap(() => { this.page = 0; this.first.set(0); this.loading.set(true); }),
      switchMap(() => this.fetchFacilities$().pipe(
        catchError(() => {
          this.messageService.add({ severity: 'error', summary: this.translate.instant('laundryFacilities.saveError') });
          return of(null);
        }),
      )),
    ).subscribe(result => {
      this.loading.set(false);
      if (result) {
        this.rows.set(result.content);
        this.total.set(result.page.totalElements);
      }
    });
    this.destroyRef.onDestroy(() => sub.unsubscribe());
  }

  private filterKey(): string {
    return [this.search.trim(), this.activeFilter ?? ''].join('|');
  }

  private fetchFacilities$(): Observable<LaundryFacilityPage> {
    return this.facilityService.list({ active: this.activeFilter, name: this.search, page: this.page, size: PAGE_SIZE });
  }

  applyFilters(): void {
    this.filterChange$.next();
  }

  hasActiveFilters(): boolean {
    return !!this.search.trim() || this.activeFilter !== null;
  }

  clearFilters(): void {
    this.search = '';
    this.activeFilter = null;
    this.applyFilters();
  }

  isPreferred(facility: LaundryFacility): boolean {
    return this.preferredFacilityId() === facility.id;
  }

  onLazyLoad(event: TableLazyLoadEvent): void {
    this.page = Math.floor((event.first ?? 0) / (event.rows ?? PAGE_SIZE));
    this.first.set(event.first ?? 0);
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.fetchFacilities$().subscribe({
      next: result => {
        this.rows.set(result.content);
        this.total.set(result.page.totalElements);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  openCreate(): void {
    this.editingId.set(null);
    this.form.reset({ name: '', address: null });
    this.dialogVisible.set(true);
  }

  openEdit(facility: LaundryFacility): void {
    this.editingId.set(facility.id);
    this.form.reset({
      name: facility.name,
      address: {
        street: facility.address,
        complement: facility.addressComplement ?? undefined,
        postalCode: facility.postalCode ?? undefined,
        city: facility.city ?? undefined,
        country: facility.country ?? undefined,
        latitude: facility.latitude ?? undefined,
        longitude: facility.longitude ?? undefined,
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
    const payload = {
      name: v.name!,
      address: addr.address!,
      addressComplement: addr.addressComplement,
      city: addr.city,
      country: addr.country,
      postalCode: addr.postalCode,
      latitude: addr.latitude,
      longitude: addr.longitude,
    };

    const obs$ = this.editingId()
      ? this.facilityService.update(this.editingId()!, payload)
      : this.facilityService.create(payload);

    obs$.subscribe({
      next: saved => {
        this.saving.set(false);
        this.dialogVisible.set(false);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('laundryFacilities.saved') });
        this.load();
        if (this.managing()?.id === saved.id) this.managing.set(saved);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('laundryFacilities.saveError') });
      },
    });
  }

  openManage(facility: LaundryFacility): void {
    this.managing.set(facility);
    this.manageVisible.set(true);
    this.loadOperators(facility.id);
    this.loadServicePrices(facility.id);
  }

  private loadServicePrices(facilityId: string): void {
    this.servicePricesLoading.set(true);
    this.facilityService.listServicePrices(facilityId).subscribe({
      next: prices => {
        this.servicePrices.set(prices);
        this.servicePricesLoading.set(false);
      },
      error: () => this.servicePricesLoading.set(false),
    });
  }

  serviceName(serviceId: string): string {
    return this.catalogServices().find(s => s.id === serviceId)?.name ?? serviceId;
  }

  openAddServicePrice(): void {
    this.priceForm.reset({ serviceId: null, priceAmount: null });
    this.addPriceVisible.set(true);
  }

  saveServicePrice(): void {
    this.priceForm.markAllAsTouched();
    const facility = this.managing();
    if (!facility || this.priceForm.invalid) return;
    const { serviceId, priceAmount } = this.priceForm.getRawValue();
    if (!serviceId || priceAmount == null) return;

    this.savingPrice.set(true);
    this.facilityService.setServicePrice(facility.id, serviceId, priceAmount, this.tenantCurrency()).subscribe({
      next: () => {
        this.savingPrice.set(false);
        this.addPriceVisible.set(false);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('laundryFacilities.servicePrices.saved') });
        this.loadServicePrices(facility.id);
      },
      error: () => {
        this.savingPrice.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('laundryFacilities.servicePrices.saveError') });
      },
    });
  }

  confirmRemoveServicePrice(price: LaundryFacilityServicePrice): void {
    this.confirmationService.confirm({
      message: this.translate.instant('laundryFacilities.servicePrices.removeConfirmMessage'),
      header: this.translate.instant('laundryFacilities.servicePrices.removeConfirmTitle'),
      icon: 'pi pi-exclamation-triangle',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => this.removeServicePrice(price),
    });
  }

  private removeServicePrice(price: LaundryFacilityServicePrice): void {
    const facility = this.managing();
    if (!facility) return;
    this.facilityService.removeServicePrice(facility.id, price.serviceId).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: this.translate.instant('laundryFacilities.servicePrices.removed') });
        this.loadServicePrices(facility.id);
      },
      error: () => this.messageService.add({ severity: 'error', summary: this.translate.instant('laundryFacilities.servicePrices.removeError') }),
    });
  }

  private loadOperators(facilityId: string): void {
    this.operatorsLoading.set(true);
    this.facilityService.listOperators(facilityId).subscribe({
      next: operators => {
        this.operators.set(operators);
        this.operatorsLoading.set(false);
      },
      error: () => this.operatorsLoading.set(false),
    });
  }

  operatorName(op: LaundryOperator): string {
    return this.userNames.get(op.userId) ?? this.translate.instant('laundryFacilities.operator');
  }

  confirmDeactivate(facility: LaundryFacility): void {
    this.confirmationService.confirm({
      message: 'Tem a certeza de que deseja desativar esta lavanderia?',
      header: 'Desativar lavanderia',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Desativar',
      rejectLabel: 'Cancelar',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => this.toggleActive(facility, false),
    });
  }

  toggleActive(facility: LaundryFacility, activate: boolean): void {
    if (this.pendingId()) return;
    this.pendingId.set(facility.id);
    const obs$ = activate ? this.facilityService.activate(facility.id) : this.facilityService.deactivate(facility.id);
    obs$.subscribe({
      next: updated => {
        this.pendingId.set(null);
        this.managing.set(updated);
        this.load();
      },
      error: () => {
        this.pendingId.set(null);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('laundryFacilities.saveError') });
      },
    });
  }

  openCreateOperator(): void {
    this.operatorForm.reset({ fullName: '', document: '' });
    this.createOperatorVisible.set(true);
  }

  /** Formata o CPF enquanto se digita; o servidor normaliza de qualquer forma. */
  maskOperatorDocument(): void {
    const control = this.operatorForm.controls.document;
    const masked = maskPersonalTaxIdInput(control.value);
    if (masked !== control.value) control.setValue(masked, { emitEvent: false });
  }

  saveOperator(): void {
    const facility = this.managing();
    if (!facility || this.operatorForm.invalid) return;
    const { fullName: rawName, document: personalDocument } = this.operatorForm.getRawValue();
    const fullName = rawName.trim();
    this.creatingOperator.set(true);
    this.facilityService.createOperator(facility.id, fullName, personalDocument.trim()).subscribe({
      next: result => {
        this.creatingOperator.set(false);
        this.createOperatorVisible.set(false);
        this.userNames.set(result.operator.userId, fullName);
        this.credentialsResult.set(result);
        this.credentialsVisible.set(true);
        this.loadOperators(facility.id);
      },
      error: (err: HttpErrorResponse) => {
        this.creatingOperator.set(false);
        this.messageService.add({ severity: 'error', summary: this.operatorSaveErrorMessage(err) });
      },
    });
  }

  /** Erros de regra do documento têm texto próprio; o resto cai na mensagem genérica. */
  private operatorSaveErrorMessage(err: HttpErrorResponse): string {
    const code = (err.error as { errorCode?: string } | null)?.errorCode;
    if (err.status === 422 && code) {
      const key = `providers.errors.${code}`;
      const translated = this.translate.instant(key);
      if (translated !== key) return translated;
    }
    return this.translate.instant('laundryFacilities.operatorSaveError');
  }

  closeCredentials(): void {
    this.credentialsVisible.set(false);
    this.credentialsResult.set(null);
  }
}
