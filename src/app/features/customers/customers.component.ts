import { CommonModule, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnDestroy, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AbstractControl, FormBuilder, FormsModule, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { DrawerModule } from 'primeng/drawer';
import { FileUpload, FileUploadModule } from 'primeng/fileupload';
import { InputMaskModule } from 'primeng/inputmask';
import { PhoneComponent } from '../../shared/components/phone/phone.component';
import { InputTextModule } from 'primeng/inputtext';
import { Panel } from "primeng/panel";
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';
import { Observable, Subject, Subscription, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, switchMap, tap } from 'rxjs/operators';
import { AuthService } from '../../core/auth/auth.service';
import {
  Customer,
  CustomerAddress,
  CustomerAddressPayload,
  CustomerAddressType,
  CustomerContact,
  CustomerContactPayload,
  CustomerImportPreviewResult,
  CustomerLeadSource,
  CustomerPage,
  CustomerPayload,
  CustomerService,
  CustomerServiceHistoryItem,
  CustomerSummary,
  CustomerType,
} from '../../core/services/customer.service';
import { CustomerImportService } from '../../core/services/customer-import.service';
import { TenantService } from '../../core/services/tenant.service';
import { TenantUser, TenantUserService } from '../../core/services/tenant-user.service';
import { AddressAutocompleteComponent, AddressValue } from '../../shared/components/address-autocomplete/address-autocomplete.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { TagBadgeComponent } from '../../shared/components/tag-badge/tag-badge.component';
import { addressValueToFields } from '../../shared/utils/address.util';
import { customerImportErrorKey } from '../../shared/utils/customer-import-error.util';
import { SupportedCountry, TAX_ID_META, taxIdValidator } from '../../shared/utils/tax-id.validator';
import { BrTaxIdMaskDirective } from '../../shared/directives/br-tax-id-mask.directive';
import { TableStandardDirective } from '../../shared/directives/table-standard.directive';

const PAGE_SIZE = 20;

/** Espelha `CONTACT_CHANNEL_REQUIRED` do backend: contato precisa de telefone ou email. */
function contactChannelValidator(control: AbstractControl): ValidationErrors | null {
  const email = (control.get('email')?.value ?? '').trim();
  const phone = (control.get('phone')?.value ?? '').trim();
  return email || phone ? null : { channelRequired: true };
}

@Component({
  selector: 'app-customers',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BrTaxIdMaskDirective, PhoneComponent,CommonModule, DatePipe, FormsModule, ReactiveFormsModule, TranslatePipe, TableModule, ButtonModule,
    InputTextModule, SelectModule, SelectButtonModule, InputMaskModule, DialogModule, DrawerModule, TooltipModule, FileUploadModule,
    ToggleSwitchModule, AddressAutocompleteComponent, TagBadgeComponent, PageHeaderComponent, EmptyStateComponent, Panel, RouterLink,
    TableStandardDirective],
  template: `
    <app-page-header [title]="'customers.title' | translate" [description]="'customers.subtitle' | translate">
      @if (canWrite() && !customersEmpty()) {
        <p-button [label]="'customers.import.history.title' | translate" icon="pi pi-history" [text]="true" size="small"
                  routerLink="/customers/imports"></p-button>
        <p-button [label]="'customers.import.button' | translate" icon="pi pi-upload" [outlined]="true" size="small"
                  (onClick)="openImport()"></p-button>
        <p-button [label]="'customers.add' | translate" icon="pi pi-plus" (onClick)="openCreate()" size="small"></p-button>
      }
    </app-page-header>

    @if (customersEmpty()) {
      <app-empty-state icon="pi pi-address-book" [message]="'customers.emptyTitle' | translate"
                        [subtitle]="'customers.emptySubtitle' | translate">
      </app-empty-state>
      @if (canWrite()) {
        <div class="flex flex-wrap justify-center gap-2 -mt-3">
          <p-button icon="pi pi-plus" [label]="'customers.add' | translate" (onClick)="openCreate()"></p-button>
          <p-button icon="pi pi-upload" [label]="'customers.import.button' | translate" [outlined]="true" (onClick)="openImport()"></p-button>
        </div>
      }
    } @else {
    <p-panel>
      <div class="space-y-4 min-w-0">
        <div class="flex flex-wrap items-end gap-3">
          <div class="flex-1 min-w-56">
            <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5" for="customerSearch">{{ 'common.search' | translate }}</label>
            <input pInputText id="customerSearch" fluid [(ngModel)]="search"
                  [placeholder]="'customers.searchPlaceholder' | translate"
                  autocomplete="off"
                  (ngModelChange)="applyFilters()" />
          </div>
          <div class="w-44">
            <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'customers.type' | translate }}</label>
            <p-select [options]="typeOptions" [(ngModel)]="type" optionLabel="label" optionValue="value"
                      appendTo="body" fluid [showClear]="true"
                      [placeholder]="'customers.allTypes' | translate" (onChange)="applyFilters()"></p-select>
          </div>
          <div class="w-44">
            <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'common.status' | translate }}</label>
            <p-select [options]="activeOptions" [(ngModel)]="active" optionLabel="label" optionValue="value"
                      appendTo="body" fluid [showClear]="true"
                      [placeholder]="'customers.allStatuses' | translate" (onChange)="applyFilters()"></p-select>
          </div>
          @if (hasActiveFilters()) {
            <p-button [label]="'customers.clearFilters' | translate" icon="pi pi-filter-slash" [text]="true" size="small"
                      (onClick)="clearFilters()"></p-button>
          }
        </div>

        <div class="overflow-x-auto min-w-0">
          <p-table appTableStandard [value]="rows()"
                    dataKey="id"
                  [lazy]="true"
                  [rows]="pageSize"
                  [totalRecords]="total()"
                  [loading]="loading()"
                  [showLoader]="false"
                  [first]="first()"
                  [sortField]="sortField"
                  [sortOrder]="sortOrder"
                  (onLazyLoad)="onLazyLoad($event)">
            <ng-template pTemplate="header">
              <tr>
                <th pSortableColumn="name">{{ 'common.name' | translate }} <p-sortIcon field="name"></p-sortIcon></th>
                <th class="hidden sm:table-cell">{{ 'customers.type' | translate }}</th>
                <th class="hidden md:table-cell">{{ 'customers.taxId' | translate }}</th>
                <th class="hidden md:table-cell" pSortableColumn="city">{{ 'common.city' | translate }} <p-sortIcon field="city"></p-sortIcon></th>
                <th pSortableColumn="active">{{ 'common.status' | translate }} <p-sortIcon field="active"></p-sortIcon></th>
                <th class="text-right w-20">{{ 'common.actions' | translate }}</th>
              </tr>
            </ng-template>

            <ng-template pTemplate="body" let-row>
              <tr class="group cursor-pointer" (click)="openDetail(row)">
                <td class="font-medium text-app-text">{{ row.name }}</td>
                <td class="hidden sm:table-cell">
                  <app-tag-badge [value]="('customers.type' + row.type) | translate" severity="secondary"></app-tag-badge>
                </td>
                <td class="hidden md:table-cell">{{ row.taxId ?? '—' }}</td>
                <td class="hidden md:table-cell">{{ row.city ?? '—' }}</td>
                <td>
                  <app-tag-badge [value]="(row.active ? 'common.active' : 'common.inactive') | translate"
                                [severity]="row.active ? 'success' : 'secondary'"></app-tag-badge>
                </td>
                <td class="text-right whitespace-nowrap" (click)="$event.stopPropagation()">
                  @if (canWrite()) {
                    <span>
                      <p-button icon="pi pi-pencil" [text]="true" size="small" severity="secondary"
                                [pTooltip]="'common.edit' | translate" tooltipPosition="top"
                                [attr.aria-label]="'common.edit' | translate"
                                [disabled]="pendingId() === row.id" (onClick)="openEdit(row)"></p-button>
                      @if (row.active) {
                        <p-button icon="pi pi-times-circle" [text]="true" size="small" severity="warn"
                                  [pTooltip]="'customers.deactivate' | translate" tooltipPosition="top"
                                  [attr.aria-label]="'customers.deactivate' | translate"
                                  [loading]="pendingId() === row.id" (onClick)="confirmDeactivate(row)"></p-button>
                      } @else {
                        <p-button icon="pi pi-check-circle" [text]="true" size="small" severity="info"
                                  [pTooltip]="'customers.activate' | translate" tooltipPosition="top"
                                  [attr.aria-label]="'customers.activate' | translate"
                                  [loading]="pendingId() === row.id" (onClick)="toggleActive(row, true)"></p-button>
                      }
                    </span>
                  }
                </td>
              </tr>
            </ng-template>

            <ng-template pTemplate="emptymessage">
              <tr>
                <td colspan="6" class="py-6">
                  <app-empty-state icon="pi pi-search" [message]="'customers.noMatchTitle' | translate"
                                    [subtitle]="'customers.noMatchSubtitle' | translate"
                                    [actionLabel]="'customers.clearFilters' | translate"
                                    (actionClick)="clearFilters()">
                  </app-empty-state>
                </td>
              </tr>
            </ng-template>
          </p-table>
        </div>
      </div>
    </p-panel>
    }

    <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '34rem', maxWidth: '95vw' }"
              [header]="(editingCustomerId() ? 'customers.editTitle' : 'customers.addTitle') | translate">
      <form [formGroup]="form" (ngSubmit)="save()" class="space-y-4">
        @if (!editingCustomerId()) {
          <p class="text-xs text-app-text-tertiary">{{ 'customers.addHint' | translate }}</p>
        }

        <div>
          <label class="label">{{ 'customers.type' | translate }} *</label>
          <p-selectbutton [options]="typeOptions" formControlName="type" optionLabel="label" optionValue="value"
                           [allowEmpty]="false"></p-selectbutton>
        </div>
        <div>
          <label class="label">{{ 'common.name' | translate }} *</label>
          <input pInputText formControlName="name" fluid
                 [placeholder]="(form.get('type')?.value === 'COMPANY' ? 'customers.namePlaceholderCompany' : 'customers.namePlaceholderIndividual') | translate" />
          @if (form.get('name')?.invalid && form.get('name')?.touched) {
            <small class="text-app-danger text-xs block mt-1">{{ 'errors.required' | translate }}</small>
          }
        </div>
        <div>
          <label class="label">{{ taxIdMeta().labelKey | translate }}
            @if (form.get('type')?.value === 'COMPANY') {*}
          </label>
          @if (taxIdMeta().mask) {
            <input pInputText formControlName="taxId" [pInputMask]="taxIdMeta().mask!" fluid [placeholder]="taxIdMeta().placeholder" />
          } @else if (country() === 'BR') {
            <input pInputText appBrTaxIdMask formControlName="taxId" fluid [placeholder]="taxIdMeta().placeholder" />
          } @else {
            <input pInputText formControlName="taxId" fluid [placeholder]="taxIdMeta().placeholder" />
          }
          @if (form.get('taxId')?.hasError('taxId')) {
            <small class="text-app-danger text-xs block mt-1">{{ 'errors.taxIdInvalid' | translate }}</small>
          } @else {
            <p class="text-xs text-app-text-tertiary mt-1">
              {{ (form.get('type')?.value === 'COMPANY' ? 'customers.taxIdHelpCompany' : 'customers.taxIdHelpIndividual') | translate }}
            </p>
          }
        </div>
        <div>
          <app-address-autocomplete formControlName="address"></app-address-autocomplete>
          <p class="text-xs text-app-text-tertiary mt-1">{{ 'customers.addressHelp' | translate }}</p>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="label">{{ 'customers.leadSource.label' | translate }}</label>
            <p-select [options]="leadSourceOptions" formControlName="leadSource" optionLabel="label" optionValue="value"
                      appendTo="body" fluid [showClear]="true"
                      [placeholder]="'customers.leadSource.placeholder' | translate"></p-select>
          </div>
          @if (canPickAccountOwner()) {
            <div>
              <label class="label">{{ 'customers.accountOwner.label' | translate }}</label>
              <p-select [options]="accountOwnerOptions()" formControlName="accountOwnerId" optionLabel="label" optionValue="value"
                        appendTo="body" fluid [showClear]="true"
                        [placeholder]="'customers.accountOwner.placeholder' | translate"></p-select>
            </div>
          }
        </div>
        @if (!editingCustomerId()) {
          <p class="text-xs text-app-text-tertiary border-t border-app-border pt-3">
            <i class="pi pi-info-circle" aria-hidden="true"></i> {{ 'customers.createFooterNote' | translate }}
          </p>
        }
        <div class="flex justify-end gap-2 pt-1">
          <p-button type="button" [label]="'common.close' | translate" [outlined]="true" (onClick)="dialogVisible.set(false)"></p-button>
          <p-button type="submit" [label]="'common.save' | translate" icon="pi pi-check"
                    [loading]="saving()" [disabled]="form.invalid"></p-button>
        </div>
      </form>
    </p-dialog>

    <p-drawer [(visible)]="drawerVisible" position="right" [dismissible]="true" [closeOnEscape]="true"
              styleClass="w-full! sm:w-[18rem]! lg:w-[36rem]!">
      <ng-template #header>
        @if (drawerCustomer(); as c) {
          <div class="flex items-center gap-2 min-w-0">
            <span class="font-semibold text-app-text truncate">{{ c.name }}</span>
            <app-tag-badge [value]="(c.active ? 'common.active' : 'common.inactive') | translate"
                           [severity]="c.active ? 'success' : 'secondary'"></app-tag-badge>
          </div>
        } @else {
          <span class="font-semibold text-app-text">{{ 'customers.detail.title' | translate }}</span>
        }
      </ng-template>

      @if (drawerLoading()) {
          <div class="flex flex-col items-center justify-center py-16 text-center text-app-text-tertiary">
            <i class="pi pi-spin pi-spinner text-2xl mb-3" aria-hidden="true"></i>
            <p class="text-sm">{{ 'common.loading' | translate }}</p>
          </div>
        } @else if (drawerError()) {
          <div class="flex flex-col items-center justify-center py-16 text-center">
            <i class="pi pi-exclamation-triangle text-3xl text-app-danger mb-3" aria-hidden="true"></i>
            <p class="text-sm font-medium text-app-text">{{ 'customers.detail.loadError' | translate }}</p>
            <p-button [label]="'customers.detail.retry' | translate" [text]="true" size="small" class="mt-3"
                      (onClick)="retryLoadDetail()"></p-button>
          </div>
        } @else if (drawerCustomer(); as c) {
            <div class="space-y-5 pb-4">
              <section class="space-y-2">
                <h4 class="text-[11px] font-semibold uppercase tracking-wide text-app-text-tertiary">{{ 'customers.detail.generalSection' | translate }}</h4>
                <dl class="grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
                  <div>
                    <dt class="text-app-text-tertiary text-xs">{{ 'customers.type' | translate }}</dt>
                    <dd class="text-app-text">{{ ('customers.type' + c.type) | translate }}</dd>
                  </div>
                  <div>
                    <dt class="text-app-text-tertiary text-xs">{{ 'customers.taxId' | translate }}</dt>
                    <dd class="text-app-text">{{ c.taxId ?? '—' }}</dd>
                  </div>
                  <div>
                    <dt class="text-app-text-tertiary text-xs">{{ 'customers.createdAtLabel' | translate }}</dt>
                    <dd class="text-app-text">{{ c.createdAt | date:'mediumDate' }}</dd>
                  </div>
                  <div>
                    <dt class="text-app-text-tertiary text-xs">{{ 'customers.detail.updatedAt' | translate }}</dt>
                    <dd class="text-app-text">{{ c.updatedAt | date:'mediumDate' }}</dd>
                  </div>
                  @if (c.leadSource) {
                    <div>
                      <dt class="text-app-text-tertiary text-xs">{{ 'customers.leadSource.label' | translate }}</dt>
                      <dd class="text-app-text">{{ ('customers.leadSource.' + c.leadSource) | translate }}</dd>
                    </div>
                  }
                  @if (accountOwnerName(c.accountOwnerId); as ownerName) {
                    <div>
                      <dt class="text-app-text-tertiary text-xs">{{ 'customers.accountOwner.label' | translate }}</dt>
                      <dd class="text-app-text">{{ ownerName }}</dd>
                    </div>
                  }
                </dl>
              </section>

              <section class="space-y-2 border-t border-app-border pt-4">
                <div class="flex items-center justify-between">
                  <h4 class="text-[11px] font-semibold uppercase tracking-wide text-app-text-tertiary">{{ 'customers.detail.addressesSection' | translate }}</h4>
                  @if (canWrite() && !addressFormVisible()) {
                    <p-button icon="pi pi-plus" [label]="'customers.detail.addAddress' | translate" [text]="true" size="small"
                              (onClick)="openAddAddress()"></p-button>
                  }
                </div>

                @if (c.addresses.length) {
                  <ul class="space-y-0.5">
                    @for (addr of c.addresses; track addr.id) {
                      <li class="flex items-start justify-between gap-2 text-sm rounded-md px-2 py-1.5 -mx-2 hover:bg-app-surface">
                        <div class="min-w-0">
                          <div class="flex items-center gap-1.5">
                            <app-tag-badge [value]="('customers.addressType' + addr.type) | translate" severity="secondary"></app-tag-badge>
                            @if (addr.primary) {
                              <app-tag-badge [value]="'customers.detail.primary' | translate" severity="secondary"></app-tag-badge>
                            }
                          </div>
                          <p class="text-app-text truncate">
                            {{ addr.address }}@if (addr.addressComplement) {, {{ addr.addressComplement }}}
                          </p>
                          <p class="text-app-text-tertiary text-xs truncate">
                            {{ addr.city ?? '—' }}@if (addr.postalCode) { · {{ addr.postalCode }}}@if (addr.country) { · {{ addr.country }}}
                          </p>
                        </div>
                        @if (canWrite() && !addressFormVisible()) {
                          <span class="flex shrink-0">
                            <p-button icon="pi pi-pencil" [text]="true" size="small" severity="secondary"
                                      [pTooltip]="'common.edit' | translate" tooltipPosition="top"
                                      [attr.aria-label]="'common.edit' | translate"
                                      [disabled]="addressPendingId() === addr.id" (onClick)="openEditAddress(addr)"></p-button>
                            <p-button icon="pi pi-trash" [text]="true" size="small" severity="danger"
                                      [pTooltip]="'common.delete' | translate" tooltipPosition="top"
                                      [attr.aria-label]="'common.delete' | translate"
                                      [loading]="addressPendingId() === addr.id" (onClick)="removeAddress(addr)"></p-button>
                          </span>
                        }
                      </li>
                    }
                  </ul>
                } @else if (!addressFormVisible()) {
                  <p class="text-sm text-app-text-tertiary">{{ 'customers.detail.noAddresses' | translate }}</p>
                }

                @if (addressFormVisible()) {
                  <form [formGroup]="addressForm" (ngSubmit)="saveAddress()"
                        class="space-y-3 rounded-md border border-app-border bg-app-surface p-3 mt-1">
                    <div>
                      <label class="label">{{ 'customers.detail.addressTypeLabel' | translate }} *</label>
                      <p-selectbutton [options]="addressTypeOptions" formControlName="type" optionLabel="label" optionValue="value"
                                       [allowEmpty]="false"></p-selectbutton>
                    </div>
                    <div>
                      <app-address-autocomplete formControlName="address"></app-address-autocomplete>
                      @if (addressForm.get('address')?.invalid && addressForm.get('address')?.touched) {
                        <small class="text-app-danger text-xs block mt-1">{{ 'errors.required' | translate }}</small>
                      }
                    </div>
                    <div class="flex items-center gap-2">
                      <p-toggleswitch formControlName="primary" inputId="addressPrimary"></p-toggleswitch>
                      <label for="addressPrimary" class="text-sm text-app-text cursor-pointer">{{ 'customers.detail.addressPrimaryLabel' | translate }}</label>
                    </div>
                    <div class="flex justify-end gap-2 pt-1">
                      <p-button type="button" [label]="'common.cancel' | translate" [outlined]="true" size="small"
                                (onClick)="cancelAddressForm()"></p-button>
                      <p-button type="submit" [label]="'common.save' | translate" icon="pi pi-check" size="small"
                                [loading]="addressSaving()" [disabled]="addressForm.invalid"></p-button>
                    </div>
                  </form>
                }
              </section>

              <section class="space-y-2 border-t border-app-border pt-4">
                <h4 class="text-[11px] font-semibold uppercase tracking-wide text-app-text-tertiary">{{ 'customers.detail.businessSection' | translate }}</h4>
                @if (summaryLoading()) {
                  <p class="text-sm text-app-text-tertiary">{{ 'common.loading' | translate }}</p>
                } @else if (summary(); as s) {
                  <div class="grid grid-cols-3 gap-2 text-center">
                    <div class="rounded-md border border-app-border p-2">
                      <p class="text-lg font-semibold text-app-text">{{ s.quotationCount }}</p>
                      <p class="text-[11px] text-app-text-tertiary">{{ 'customers.detail.quotations' | translate }}</p>
                    </div>
                    <div class="rounded-md border border-app-border p-2">
                      <p class="text-lg font-semibold text-app-text">{{ s.orderCount }}</p>
                      <p class="text-[11px] text-app-text-tertiary">{{ 'customers.detail.orders' | translate }}</p>
                    </div>
                    <div class="rounded-md border border-app-border p-2">
                      <p class="text-lg font-semibold text-app-text">{{ s.invoiceCount }}</p>
                      <p class="text-[11px] text-app-text-tertiary">{{ 'customers.detail.invoices' | translate }}</p>
                    </div>
                  </div>
                  @if (s.recentOrders.length || s.recentQuotations.length || s.recentInvoices.length) {
                    <ul class="space-y-1 mt-2">
                      @for (o of s.recentOrders; track o.id) {
                        <li class="flex items-center justify-between text-xs text-app-text-secondary">
                          <span>{{ 'customers.detail.orderLabel' | translate }} #{{ o.orderNumber }}</span>
                          <span class="flex items-center gap-1.5">
                            <app-tag-badge [value]="('orders.status.' + o.status) | translate" severity="secondary"></app-tag-badge>
                            {{ o.createdAt | date:'shortDate' }}
                          </span>
                        </li>
                      }
                      @for (q of s.recentQuotations; track q.id) {
                        <li class="flex items-center justify-between text-xs text-app-text-secondary">
                          <span>{{ 'customers.detail.quotationLabel' | translate }} #{{ q.quotationNumber }}</span>
                          <span class="flex items-center gap-1.5">
                            <app-tag-badge [value]="('quotations.status' + q.status) | translate" severity="secondary"></app-tag-badge>
                            {{ q.createdAt | date:'shortDate' }}
                          </span>
                        </li>
                      }
                      @for (i of s.recentInvoices; track i.id) {
                        <li class="flex items-center justify-between text-xs text-app-text-secondary">
                          <span>{{ 'customers.detail.invoiceLabel' | translate }} #{{ i.invoiceNumber }}</span>
                          <span class="flex items-center gap-1.5">
                            <app-tag-badge [value]="('financial.invoices.status' + i.status) | translate" severity="secondary"></app-tag-badge>
                            {{ i.issuedAt | date:'shortDate' }}
                          </span>
                        </li>
                      }
                    </ul>
                  } @else {
                    <p class="text-sm text-app-text-tertiary">{{ 'customers.detail.noBusiness' | translate }}</p>
                  }
                } @else {
                  <p class="text-sm text-app-text-tertiary">{{ 'customers.detail.businessLoadError' | translate }}</p>
                }
              </section>

              <section class="space-y-2 border-t border-app-border pt-4">
                <h4 class="text-[11px] font-semibold uppercase tracking-wide text-app-text-tertiary">{{ 'customers.detail.serviceHistory.title' | translate }}</h4>
                @if (serviceHistoryLoading()) {
                  <p class="text-sm text-app-text-tertiary">{{ 'common.loading' | translate }}</p>
                } @else if (serviceHistory(); as history) {
                  @if (history.length) {
                    <ul class="space-y-2">
                      @for (h of history; track h.serviceId) {
                        <li class="rounded-md border border-app-border p-2.5">
                          <div class="flex items-center justify-between gap-2">
                            <span class="text-sm font-medium text-app-text truncate">{{ h.serviceName ?? '—' }}</span>
                            <app-tag-badge [value]="'customers.detail.serviceHistory.times' | translate:{ count: h.timesServiced }" severity="secondary"></app-tag-badge>
                          </div>
                          <div class="mt-1 flex flex-wrap justify-between gap-x-3 text-[11px] text-app-text-tertiary">
                            <span>{{ 'customers.detail.serviceHistory.last' | translate:{ date: (h.lastFinishedAt | date:'mediumDate') } }}</span>
                            @if (h.nextExpectedAt) {
                              <span [class.text-app-danger]="isPast(h.nextExpectedAt)">
                                {{ 'customers.detail.serviceHistory.next' | translate:{ date: (h.nextExpectedAt | date:'mediumDate') } }}
                              </span>
                            }
                          </div>
                        </li>
                      }
                    </ul>
                  } @else {
                    <p class="text-sm text-app-text-tertiary">{{ 'customers.detail.serviceHistory.empty' | translate }}</p>
                  }
                } @else {
                  <p class="text-sm text-app-text-tertiary">{{ 'customers.detail.serviceHistory.loadError' | translate }}</p>
                }
              </section>

              <section class="space-y-2 border-t border-app-border pt-4">
                <h4 class="text-[11px] font-semibold uppercase tracking-wide text-app-text-tertiary">{{ 'customers.detail.addressSection' | translate }}</h4>
                @if (c.address) {
                  <p class="text-sm text-app-text">
                    {{ c.address }}@if (c.addressComplement) {, {{ c.addressComplement }}}
                    <br>
                    <span class="text-app-text-secondary">
                      {{ c.city ?? '—' }}@if (c.postalCode) { · {{ c.postalCode }}}@if (c.country) { · {{ c.country }}}
                    </span>
                  </p>
                } @else {
                  <p class="text-sm text-app-text-tertiary">{{ 'customers.detail.noAddress' | translate }}</p>
                }
              </section>

              <section class="space-y-2 border-t border-app-border pt-4">
                <div class="flex items-center justify-between">
                  <h4 class="text-[11px] font-semibold uppercase tracking-wide text-app-text-tertiary">{{ 'customers.detail.contactsSection' | translate }}</h4>
                  @if (canWrite() && !contactFormVisible()) {
                    <p-button icon="pi pi-plus" [label]="'customers.detail.addContact' | translate" [text]="true" size="small"
                              (onClick)="openAddContact()"></p-button>
                  }
                </div>

                @if (c.contacts.length) {
                  <ul class="space-y-0.5">
                    @for (contact of c.contacts; track contact.id) {
                      <li class="flex items-start justify-between gap-2 text-sm rounded-md px-2 py-1.5 -mx-2 hover:bg-app-surface">
                        <div class="min-w-0">
                          <div class="flex items-center gap-1.5">
                            <p class="text-app-text font-medium truncate">{{ contact.name }}</p>
                            @if (contact.primary) {
                              <app-tag-badge [value]="'customers.detail.primary' | translate" severity="secondary"></app-tag-badge>
                            }
                          </div>
                          <p class="text-app-text-tertiary text-xs truncate">
                            {{ contact.email ?? '—' }}@if (contact.phone) { · {{ contact.phone }}}
                          </p>
                          @if (canWrite()) {
                            <div class="flex items-center gap-1.5 mt-1">
                              <p-toggleswitch [ngModel]="contact.whatsAppOptIn" [ngModelOptions]="{standalone: true}"
                                               (onChange)="toggleContactWhatsApp(contact, $event.checked)"
                                               [disabled]="!contact.phone || contactWhatsAppPendingId() === contact.id"
                                               [pTooltip]="(contact.phone ? 'customers.detail.whatsAppOptInHint' : 'customers.detail.whatsAppRequiresPhone') | translate"
                                               tooltipPosition="top" class="scale-75 origin-left"></p-toggleswitch>
                              <span class="text-xs text-app-text-tertiary">{{ 'customers.detail.whatsAppOptInLabel' | translate }}</span>
                            </div>
                          }
                        </div>
                        @if (canWrite() && !contactFormVisible()) {
                          <span class="flex shrink-0">
                            <p-button icon="pi pi-pencil" [text]="true" size="small" severity="secondary"
                                      [pTooltip]="'common.edit' | translate" tooltipPosition="top"
                                      [attr.aria-label]="'common.edit' | translate"
                                      [disabled]="contactPendingId() === contact.id" (onClick)="openEditContact(contact)"></p-button>
                            <p-button icon="pi pi-trash" [text]="true" size="small" severity="danger"
                                      [pTooltip]="'common.delete' | translate" tooltipPosition="top"
                                      [attr.aria-label]="'common.delete' | translate"
                                      [loading]="contactPendingId() === contact.id" (onClick)="confirmRemoveContact(contact)"></p-button>
                          </span>
                        }
                      </li>
                    }
                  </ul>
                } @else if (!contactFormVisible()) {
                  <p class="text-sm text-app-text-tertiary">{{ 'customers.detail.noContacts' | translate }}</p>
                }

                @if (contactFormVisible()) {
                  <form [formGroup]="contactForm" (ngSubmit)="saveContact()"
                        class="space-y-3 rounded-md border border-app-border bg-app-surface p-3 mt-1">
                    <div>
                      <label class="label">{{ 'common.name' | translate }} *</label>
                      <input pInputText formControlName="name" fluid [placeholder]="'customers.detail.contactNamePlaceholder' | translate" />
                      @if (contactForm.get('name')?.invalid && contactForm.get('name')?.touched) {
                        <small class="text-app-danger text-xs block mt-1">{{ 'errors.required' | translate }}</small>
                      }
                    </div>
                    <div class="grid grid-cols-1 gap-3">
                      <div>
                        <label class="label">{{ 'customers.detail.contactEmail' | translate }}</label>
                        <input pInputText type="email" formControlName="email" fluid placeholder="email@exemplo.com" />
                        @if (contactForm.get('email')?.hasError('email') && contactForm.get('email')?.touched) {
                          <small class="text-app-danger text-xs block mt-1">{{ 'errors.invalidEmail' | translate }}</small>
                        }
                      </div>
                      <app-phone formControlName="phone" label="customers.detail.contactPhone" defaultCountry="BR"></app-phone>
                    </div>
                    @if (contactForm.hasError('channelRequired')) {
                      <small class="text-xs block"
                             [class.text-app-danger]="contactForm.get('email')?.touched || contactForm.get('phone')?.touched"
                             [class.text-app-text-tertiary]="!(contactForm.get('email')?.touched || contactForm.get('phone')?.touched)">
                        {{ 'customers.detail.contactChannelRequired' | translate }}
                      </small>
                    }
                    <div class="flex items-center gap-2">
                      <p-toggleswitch formControlName="primary" inputId="contactPrimary"></p-toggleswitch>
                      <label for="contactPrimary" class="text-sm text-app-text cursor-pointer">{{ 'customers.detail.contactPrimaryLabel' | translate }}</label>
                    </div>
                    <div class="flex justify-end gap-2 pt-1">
                      <p-button type="button" [label]="'common.cancel' | translate" [outlined]="true" size="small"
                                (onClick)="cancelContactForm()"></p-button>
                      <p-button type="submit" [label]="'common.save' | translate" icon="pi pi-check" size="small"
                                [loading]="contactSaving()" [disabled]="contactForm.invalid"></p-button>
                    </div>
                  </form>
                }
              </section>
            </div>
        }

      <ng-template #footer>
        @if (!drawerLoading() && !drawerError() && drawerCustomer(); as c) {
          @if (canWrite()) {
            <div class="flex justify-end gap-2">
              @if (c.active) {
                <p-button [label]="'customers.deactivate' | translate" icon="pi pi-times-circle" severity="warn" [outlined]="true"
                          [loading]="pendingId() === c.id" (onClick)="confirmDeactivate(c)"></p-button>
              } @else {
                <p-button [label]="'customers.activate' | translate" icon="pi pi-check-circle" severity="info" [outlined]="true"
                          [loading]="pendingId() === c.id" (onClick)="toggleActive(c, true)"></p-button>
              }
              <p-button [label]="'common.edit' | translate" icon="pi pi-pencil" (onClick)="editFromDrawer(c)"></p-button>
            </div>
          }
        }
      </ng-template>
    </p-drawer>

    <p-dialog [(visible)]="importDialogVisible" [modal]="true" appendTo="body"
              [style]="importDialogMaximized() ? { width: '100vw', height: '100vh', maxWidth: '100vw', maxHeight: '100vh' } : { width: '48rem', maxWidth: '95vw' }"
              [contentStyle]="{ display: 'flex', flexDirection: 'column', height: '100%' }"
              [header]="'customers.import.title' | translate" (onHide)="closeImport()" [maximizable]="true"
              (onMaximize)="importDialogMaximized.set($event.maximized)">
      <div class="flex flex-col gap-4 h-full min-h-0">
        @if (!importPreview()) {
          <div class="rounded-md border border-app-border bg-app-surface px-4 py-3 space-y-2 template-download-box">
            <p class="text-sm text-app-text-secondary">{{ 'customers.import.instructions' | translate }}</p>
            <p-button [label]="'customers.import.downloadTemplate' | translate" icon="pi pi-download"
                      [text]="true" size="small" class="inline-block -ml-2" (onClick)="downloadImportTemplate()"></p-button>
          </div>

          <p-fileUpload #fu mode="advanced" name="file" accept=".csv,text/csv" [maxFileSize]="5000000"
                        [disabled]="previewLoading()"
                        [pt]="{ root: { class: 'border-0! bg-transparent! p-0!' },
                                header: { class: 'hidden!' },
                                content: { class: 'border-2! border-dashed! border-app-border! rounded-md! p-0!' } }"
                        (onSelect)="onFileSelected($event)">
            <ng-template #empty>
              <div class="flex flex-col items-center justify-center gap-1.5 py-8 px-4 text-center cursor-pointer"
                   (click)="fu.choose()">
                <i class="pi pi-cloud-upload text-2xl text-app-text-tertiary" aria-hidden="true"></i>
                <p class="text-sm text-app-text">{{ 'customers.import.dragHint' | translate }}</p>
                <p class="text-xs text-app-text-tertiary">
                  {{ 'common.or' | translate }} <span class="text-app-accent-hover underline">{{ 'customers.import.choose' | translate }}</span>
                </p>
              </div>
            </ng-template>
            <ng-template #content></ng-template>
          </p-fileUpload>
          @if (previewLoading()) {
            <p class="text-sm text-app-text-secondary">{{ 'customers.import.previewing' | translate }}</p>
          }
        }

        @if (importPreview(); as preview) {
          <p class="text-sm font-medium text-app-text">
            {{ 'customers.import.summary' | translate:{ valid: preview.validCount, errors: preview.errorCount } }}
          </p>
          <p-table appTableStandard [value]="preview.rows" class="p-datatable-sm" [rows]="10"
                   [sortField]="'line'" [sortOrder]="1">
            <ng-template pTemplate="header">
              <tr>
                <th pSortableColumn="line">{{ 'customers.import.line' | translate }} <p-sortIcon field="line"></p-sortIcon></th>
                <th>{{ 'customers.import.status' | translate }}</th>
                <th>{{ 'common.name' | translate }}</th>
                <th>{{ 'customers.taxId' | translate }}</th>
                <th>{{ 'customers.import.errorColumn' | translate }}</th>
              </tr>
            </ng-template>
            <ng-template pTemplate="body" let-row>
              <tr>
                <td>{{ row.line }}</td>
                <td>
                  <app-tag-badge [value]="('customers.import.status' + row.status) | translate"
                                 [severity]="row.status === 'VALID' ? 'success' : 'danger'"></app-tag-badge>
                </td>
                <td>{{ row.name ?? '—' }}</td>
                <td>{{ row.taxId ?? '—' }}</td>
                <td class="text-app-danger text-xs">{{ rowErrorMessage(row) ?? '—' }}</td>
              </tr>
            </ng-template>
          </p-table>
          <div class="flex justify-end gap-2">
            <p-button [label]="'common.cancel' | translate" [outlined]="true" (onClick)="closeImport()"></p-button>
            <p-button [label]="'customers.import.confirm' | translate" icon="pi pi-check"
                      [loading]="importing()" [disabled]="preview.validCount === 0"
                      (onClick)="confirmImport()"></p-button>
          </div>
        }
      </div>
    </p-dialog>
  `,
  styles: [`
    @reference "../../../styles.css";
    .label { @apply block text-[11px] font-medium text-app-text-secondary mb-1.5; }
    ::ng-deep .p-fileupload-content[data-p-highlight="true"] {
      border-color: var(--app-accent-hover) !important;
      background-color: var(--app-accent-soft) !important;
    }
  `],
})
export class CustomersComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private customerService = inject(CustomerService);
  private customerImportService = inject(CustomerImportService);
  private tenantService = inject(TenantService);
  private tenantUserService = inject(TenantUserService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);
  private translate = inject(TranslateService);
  private auth = inject(AuthService);
  private destroyRef = inject(DestroyRef);
  private route = inject(ActivatedRoute);

  /** Espelha {@code CustomerController.WRITE_ROLES} (issue #236/G6) — botões de escrita não
   *  aparecem para quem não pode usá-los. */
  readonly canWrite = computed(() => ['OWNER', 'ADMIN', 'OPERATOR', 'COMMERCIAL'].includes(this.auth.userRole() ?? ''));

  readonly pageSize = PAGE_SIZE;

  rows = signal<Customer[]>([]);
  total = signal(0);
  first = signal(0);
  loading = signal(false);
  dialogVisible = signal(false);
  saving = signal(false);
  pendingId = signal<string | null>(null);
  editingCustomerId = signal<string | null>(null);

  /** Primeira carga sem filtros e sem resultados — onboarding, distinto de "sem resultados para o filtro". */
  customersEmpty = computed(() => !this.loading() && this.total() === 0 && !this.hasActiveFilters());

  drawerVisible = signal(false);
  drawerCustomer = signal<Customer | null>(null);
  drawerLoading = signal(false);
  drawerError = signal(false);

  contactFormVisible = signal(false);
  editingContactId = signal<string | null>(null);
  contactSaving = signal(false);
  contactPendingId = signal<string | null>(null);
  contactWhatsAppPendingId = signal<string | null>(null);

  // `locale` do contacto (issue #141) fica no form sem campo na UI: segue o da empresa por omissão
  // e um valor já gravado é preservado ao editar.
  contactForm = this.fb.group({
    name: ['', Validators.required],
    email: ['', Validators.email],
    phone: [''],
    primary: [false],
    locale: this.fb.control<string | null>(null),
  }, { validators: contactChannelValidator });

  addressFormVisible = signal(false);
  editingAddressId = signal<string | null>(null);
  addressSaving = signal(false);
  addressPendingId = signal<string | null>(null);

  readonly addressTypeOptions: { label: string; value: CustomerAddressType }[] = [
    { label: this.translate.instant('customers.addressTypeBILLING'), value: 'BILLING' },
    { label: this.translate.instant('customers.addressTypeEXECUTION'), value: 'EXECUTION' },
  ];

  addressForm = this.fb.group({
    type: ['EXECUTION' as CustomerAddressType, Validators.required],
    address: this.fb.control<AddressValue | null>(null, Validators.required),
    primary: [false],
  });

  summary = signal<CustomerSummary | null>(null);
  summaryLoading = signal(false);
  serviceHistory = signal<CustomerServiceHistoryItem[] | null>(null);
  serviceHistoryLoading = signal(false);

  importDialogVisible = signal(false);
  importDialogMaximized = signal(false);
  previewLoading = signal(false);
  /** Só cobre o POST que arranca o job — o processamento em si aparece na área persistente do layout. */
  importing = signal(false);
  importPreview = signal<CustomerImportPreviewResult | null>(null);
  private importFile: File | null = null;
  @ViewChild('fu') private fileUpload?: FileUpload;

  /** País operacional do tenant — decide máscara/validador do documento fiscal (CLAUDE.md §7A). */
  country = signal<SupportedCountry>('BR');
  taxIdMeta = () => TAX_ID_META[this.country()];

  search = '';
  type: CustomerType | null = null;
  active: boolean | null = null;
  sortField = 'name';
  sortOrder = 1;

  readonly typeOptions = [
    { label: this.translate.instant('customers.typeINDIVIDUAL'), value: 'INDIVIDUAL' },
    { label: this.translate.instant('customers.typeCOMPANY'), value: 'COMPANY' },
  ];

  readonly activeOptions = [
    { label: this.translate.instant('common.active'), value: true },
    { label: this.translate.instant('common.inactive'), value: false },
  ];

  readonly leadSourceOptions = (['WEBSITE', 'REFERRAL', 'PHONE', 'WHATSAPP', 'SOCIAL_MEDIA', 'WALK_IN', 'OTHER'] as CustomerLeadSource[])
    .map(value => ({ label: this.translate.instant('customers.leadSource.' + value), value }));

  /** `GET /tenant-users` é restrito a OWNER/ADMIN (CLAUDE.md §6) — quem não pode listar não vê o
   *  seletor de responsável, em vez de uma chamada que devolveria 403. */
  readonly canPickAccountOwner = computed(() => ['OWNER', 'ADMIN'].includes(this.auth.userRole() ?? ''));
  tenantUsers = signal<TenantUser[]>([]);
  readonly accountOwnerOptions = computed(() => this.tenantUsers()
    .filter(u => u.active && u.quotaGroup === 'ADMINISTRATIVE')
    .map(u => ({ label: u.name, value: u.id })));

  accountOwnerName(id: string | null): string | null {
    if (!id) return null;
    return this.tenantUsers().find(u => u.id === id)?.name ?? null;
  }

  form = this.fb.group({
    type: ['INDIVIDUAL' as CustomerType, Validators.required],
    name: ['', Validators.required],
    taxId: ['', taxIdValidator(() => this.country())],
    address: this.fb.control<AddressValue | null>(null),
    leadSource: this.fb.control<CustomerLeadSource | null>(null),
    accountOwnerId: this.fb.control<string | null>(null),
  });

  private page = 0;
  private typeSync: Subscription;
  private filterChange$ = new Subject<void>();

  constructor() {
    this.typeSync = this.form.get('type')!.valueChanges.subscribe(type => this.syncTaxIdValidators(type));
  }

  ngOnInit(): void {
    this.tenantService.getMe().subscribe({
      next: t => { if (t.countryCode) this.country.set(t.countryCode as SupportedCountry); },
      error: () => { },
    });
    if (this.canPickAccountOwner()) {
      this.tenantUserService.list().subscribe({
        next: users => this.tenantUsers.set(users ?? []),
        error: () => { },
      });
    }
    this.wireFilters();
    this.loadCustomers();
    // Link direto de outra tela (ex.: orçamento) para o cliente já com o drawer aberto.
    const customerId = this.route.snapshot.queryParamMap.get('customerId');
    if (customerId) this.openDetailById(customerId);
  }

  /** Reativo: cada mudança de busca/tipo/estado dispara aqui; debounce evita 1 request por tecla,
   *  distinctUntilChanged ignora disparos sem mudança real, switchMap cancela a busca anterior. */
  private wireFilters(): void {
    const sub = this.filterChange$.pipe(
      debounceTime(300),
      map(() => this.filterKey()),
      distinctUntilChanged(),
      tap(() => { this.page = 0; this.first.set(0); this.loading.set(true); }),
      switchMap(() => this.fetchCustomers$().pipe(
        catchError(() => {
          this.messageService.add({ severity: 'error', summary: this.translate.instant('customers.loadError') });
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
    return [this.search.trim(), this.type ?? '', this.active ?? ''].join('|');
  }

  private fetchCustomers$(): Observable<CustomerPage> {
    return this.customerService.list({
      search: this.search, type: this.type, active: this.active, page: this.page, size: PAGE_SIZE,
      sort: `${this.sortField},${this.sortOrder === -1 ? 'desc' : 'asc'}`,
    });
  }

  ngOnDestroy(): void {
    this.typeSync.unsubscribe();
  }

  private syncTaxIdValidators(type: CustomerType | null): void {
    const control = this.form.get('taxId')!;
    const validators = type === 'COMPANY'
      ? [Validators.required, taxIdValidator(() => this.country())]
      : [taxIdValidator(() => this.country())];
    control.setValidators(validators);
    control.updateValueAndValidity({ emitEvent: false });
  }

  hasActiveFilters(): boolean {
    return !!this.search.trim() || this.type !== null || this.active !== null;
  }

  resultsLabel(): string {
    if (this.loading()) return this.translate.instant('common.loading');
    const count = this.total();
    return count === 1
      ? this.translate.instant('customers.resultsSingular')
      : this.translate.instant('customers.resultsPlural', { count });
  }

  clearFilters(): void {
    this.search = '';
    this.type = null;
    this.active = null;
    this.applyFilters();
  }

  onLazyLoad(event: TableLazyLoadEvent): void {
    this.page = Math.floor((event.first ?? 0) / (event.rows ?? PAGE_SIZE));
    this.first.set(event.first ?? 0);
    if (typeof event.sortField === 'string') {
      this.sortField = event.sortField;
      this.sortOrder = event.sortOrder === -1 ? -1 : 1;
    }
    this.loadCustomers();
  }

  /** Disparado a cada tecla/seleção — alimenta o pipeline reativo em {@link wireFilters}. */
  applyFilters(): void {
    this.filterChange$.next();
  }

  private loadCustomers(): void {
    this.loading.set(true);
    this.fetchCustomers$().subscribe({
      next: result => {
        this.rows.set(result.content);
        this.total.set(result.page.totalElements);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('customers.loadError') });
      },
    });
  }

  openCreate(): void {
    this.editingCustomerId.set(null);
    this.form.reset({ type: 'INDIVIDUAL', name: '', taxId: '', address: null, leadSource: null, accountOwnerId: null });
    this.syncTaxIdValidators('INDIVIDUAL');
    this.dialogVisible.set(true);
  }

  save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.saving.set(true);
    const editingId = this.editingCustomerId();
    if (editingId) {
      this.customerService.update(editingId, this.buildPayload()).subscribe({
        next: updated => this.onSaved(updated, editingId),
        error: (err) => this.onSaveError(err),
      });
      return;
    }
    this.customerService.create(this.buildPayload()).subscribe({
      next: result => {
        this.onSaved(result.customer, null);
        // Issue #232/G2: aviso soft, nunca bloqueia — o cliente já foi criado.
        if (result.duplicateWarnings.length) {
          const names = result.duplicateWarnings.map(w => w.name).join(', ');
          this.messageService.add({
            severity: 'warn',
            summary: this.translate.instant('customers.duplicateWarningTitle'),
            detail: this.translate.instant('customers.duplicateWarningDetail', { names }),
            life: 8000,
          });
        }
      },
      error: (err) => this.onSaveError(err),
    });
  }

  private onSaved(updated: Customer, editingId: string | null): void {
    this.saving.set(false);
    this.dialogVisible.set(false);
    this.messageService.add({ severity: 'success', summary: this.translate.instant('customers.saved') });
    if (editingId && this.drawerCustomer()?.id === editingId) this.drawerCustomer.set(updated);
    this.loadCustomers();
  }

  private onSaveError(err: unknown): void {
    this.saving.set(false);
    this.messageService.add({ severity: 'error', summary: this.errorMessage(err, 'customers.saveError') });
  }

  private buildPayload(): CustomerPayload {
    const v = this.form.value;
    const addr = addressValueToFields(v.address);
    return {
      type: v.type!,
      name: v.name!,
      taxId: v.taxId || undefined,
      address: addr.address,
      addressComplement: addr.addressComplement,
      city: addr.city,
      country: addr.country,
      postalCode: addr.postalCode,
      latitude: addr.latitude,
      longitude: addr.longitude,
      leadSource: v.leadSource ?? null,
      accountOwnerId: v.accountOwnerId ?? null,
    };
  }

  private populateForm(row: Customer): void {
    this.form.reset({
      type: row.type,
      name: row.name,
      taxId: row.taxId ?? '',
      address: row.address ? {
        street: row.address,
        complement: row.addressComplement ?? undefined,
        postalCode: row.postalCode ?? undefined,
        city: row.city ?? undefined,
        country: row.country ?? undefined,
        latitude: row.latitude ?? undefined,
        longitude: row.longitude ?? undefined,
      } : null,
      leadSource: row.leadSource,
      accountOwnerId: row.accountOwnerId,
    });
    this.syncTaxIdValidators(row.type);
  }

  /** Ação de edição rápida a partir da tabela — usa os dados já carregados na linha, sem nova busca. */
  openEdit(row: Customer): void {
    this.editingCustomerId.set(row.id);
    this.populateForm(row);
    this.dialogVisible.set(true);
  }

  /** Clique na linha — abre o Drawer em modo de visualização, buscando os dados completos do cliente. */
  openDetail(row: Customer): void {
    this.drawerCustomer.set(row);
    this.drawerError.set(false);
    this.drawerLoading.set(true);
    this.drawerVisible.set(true);
    this.cancelContactForm();
    this.cancelAddressForm();
    this.fetchDrawerDetail(row.id);
  }

  /** Mesmo fluxo de {@link openDetail}, mas sem uma linha da tabela em mãos — o chamador só tem
   *  o id (link vindo de outra tela via query param `customerId`). */
  private openDetailById(id: string): void {
    this.drawerCustomer.set(null);
    this.drawerError.set(false);
    this.drawerLoading.set(true);
    this.drawerVisible.set(true);
    this.cancelContactForm();
    this.cancelAddressForm();
    this.fetchDrawerDetail(id);
  }

  private fetchDrawerDetail(id: string): void {
    this.customerService.get(id).subscribe({
      next: customer => {
        this.drawerCustomer.set(customer);
        this.drawerLoading.set(false);
      },
      error: () => {
        this.drawerLoading.set(false);
        this.drawerError.set(true);
      },
    });
    this.fetchSummary(id);
    this.fetchServiceHistory(id);
  }

  /** Histórico de negócio ligado ao cliente (issue #235/G5) — carregado à parte do próprio
   *  cliente: uma falha aqui não deve impedir o resto do drawer de aparecer. */
  private fetchSummary(id: string): void {
    this.summary.set(null);
    this.summaryLoading.set(true);
    this.customerService.getSummary(id).subscribe({
      next: result => {
        this.summaryLoading.set(false);
        this.summary.set(result);
      },
      error: () => {
        this.summaryLoading.set(false);
        this.summary.set(null);
      },
    });
  }

  /** Histórico de serviços (#269) — também à parte: sem dado mockado, o erro só esconde a secção. */
  private fetchServiceHistory(id: string): void {
    this.serviceHistory.set(null);
    this.serviceHistoryLoading.set(true);
    this.customerService.getServiceHistory(id).subscribe({
      next: result => {
        this.serviceHistoryLoading.set(false);
        this.serviceHistory.set(result);
      },
      error: () => {
        this.serviceHistoryLoading.set(false);
        this.serviceHistory.set(null);
      },
    });
  }

  isPast(iso: string): boolean {
    return new Date(iso).getTime() < Date.now();
  }

  retryLoadDetail(): void {
    const id = this.drawerCustomer()?.id;
    if (!id) return;
    this.drawerLoading.set(true);
    this.drawerError.set(false);
    this.fetchDrawerDetail(id);
  }

  /** Botão "editar" do drawer — fecha o drawer e abre o mesmo dialog usado na criação. */
  editFromDrawer(row: Customer): void {
    this.drawerVisible.set(false);
    this.openEdit(row);
  }

  openAddContact(): void {
    const customer = this.drawerCustomer();
    const noContactsYet = !customer?.contacts.length;
    const defaultName = customer?.type === 'INDIVIDUAL' ? customer.name : '';
    // locale nulo = seguir o da empresa (decide o emissor do orçamento quando o contacto não fala).
    this.contactForm.reset({ name: defaultName, email: '', phone: '', primary: noContactsYet, locale: null });
    this.editingContactId.set(null);
    this.contactFormVisible.set(true);
  }

  openEditContact(contact: CustomerContact): void {
    this.contactForm.reset({
      name: contact.name, email: contact.email ?? '', phone: contact.phone ?? '', primary: contact.primary,
      locale: contact.locale ?? null,
    });
    this.editingContactId.set(contact.id);
    this.contactFormVisible.set(true);
  }

  cancelContactForm(): void {
    this.contactFormVisible.set(false);
    this.editingContactId.set(null);
  }

  /** Morada adicional do cliente (issue #238/G8) — cobrança ≠ execução, ou filial extra. */
  openAddAddress(): void {
    this.addressForm.reset({ type: 'EXECUTION', address: null, primary: false });
    this.editingAddressId.set(null);
    this.addressFormVisible.set(true);
  }

  openEditAddress(addr: CustomerAddress): void {
    this.addressForm.reset({
      type: addr.type,
      primary: addr.primary,
      address: {
        street: addr.address,
        complement: addr.addressComplement ?? undefined,
        postalCode: addr.postalCode ?? undefined,
        city: addr.city ?? undefined,
        country: addr.country ?? undefined,
        latitude: addr.latitude ?? undefined,
        longitude: addr.longitude ?? undefined,
      },
    });
    this.editingAddressId.set(addr.id);
    this.addressFormVisible.set(true);
  }

  cancelAddressForm(): void {
    this.addressFormVisible.set(false);
    this.editingAddressId.set(null);
  }

  saveAddress(): void {
    this.addressForm.markAllAsTouched();
    if (this.addressForm.invalid) return;
    const customer = this.drawerCustomer();
    if (!customer) return;
    const v = this.addressForm.value;
    const addr = addressValueToFields(v.address);
    if (!addr.address) return;
    const payload: CustomerAddressPayload = {
      type: v.type!,
      primary: !!v.primary,
      address: addr.address,
      addressComplement: addr.addressComplement,
      city: addr.city,
      country: addr.country,
      postalCode: addr.postalCode,
      latitude: addr.latitude,
      longitude: addr.longitude,
    };
    const editingId = this.editingAddressId();
    this.addressSaving.set(true);
    const request$ = editingId
      ? this.customerService.updateAddress(customer.id, editingId, payload)
      : this.customerService.addAddress(customer.id, payload);
    request$.subscribe({
      next: updated => {
        this.addressSaving.set(false);
        this.drawerCustomer.set(updated);
        this.cancelAddressForm();
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant(editingId ? 'customers.detail.addressSaved' : 'customers.detail.addressAdded'),
        });
      },
      error: (err) => {
        this.addressSaving.set(false);
        this.messageService.add({ severity: 'error', summary: this.errorMessage(err, 'customers.detail.addressSaveError') });
      },
    });
  }

  removeAddress(addr: CustomerAddress): void {
    const customer = this.drawerCustomer();
    if (!customer || this.addressPendingId()) return;
    this.addressPendingId.set(addr.id);
    this.customerService.removeAddress(customer.id, addr.id).subscribe({
      next: updated => {
        this.addressPendingId.set(null);
        this.drawerCustomer.set(updated);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('customers.detail.addressDeleted') });
      },
      error: () => {
        this.addressPendingId.set(null);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('customers.detail.addressDeleteError') });
      },
    });
  }

  saveContact(): void {
    this.contactForm.markAllAsTouched();
    if (this.contactForm.invalid) return;
    const customer = this.drawerCustomer();
    if (!customer) return;
    const v = this.contactForm.value;
    const payload: CustomerContactPayload = {
      name: v.name!, email: v.email || undefined, phone: v.phone || undefined, primary: !!v.primary,
      locale: v.locale || null,
    };
    const editingId = this.editingContactId();
    this.contactSaving.set(true);
    const request$ = editingId
      ? this.customerService.updateContact(customer.id, editingId, payload)
      : this.customerService.addContact(customer.id, payload);
    request$.subscribe({
      next: updated => {
        this.contactSaving.set(false);
        this.drawerCustomer.set(updated);
        this.cancelContactForm();
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant(editingId ? 'customers.detail.contactSaved' : 'customers.detail.contactAdded'),
        });
      },
      error: (err) => {
        this.contactSaving.set(false);
        this.messageService.add({ severity: 'error', summary: this.errorMessage(err, 'customers.detail.contactSaveError') });
      },
    });
  }

  confirmRemoveContact(contact: CustomerContact): void {
    this.confirmationService.confirm({
      message: this.translate.instant('customers.detail.contactDeleteConfirm', { name: contact.name }),
      header: this.translate.instant('customers.detail.contactDeleteConfirmTitle'),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.translate.instant('common.delete'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => this.removeContact(contact),
    });
  }

  toggleContactWhatsApp(contact: CustomerContact, optIn: boolean): void {
    const customer = this.drawerCustomer();
    if (!customer || this.contactWhatsAppPendingId()) return;
    this.contactWhatsAppPendingId.set(contact.id);
    this.customerService.setContactWhatsAppOptIn(customer.id, contact.id, optIn).subscribe({
      next: updated => {
        this.contactWhatsAppPendingId.set(null);
        this.drawerCustomer.set(updated);
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant(optIn ? 'customers.detail.whatsAppOptInEnabled' : 'customers.detail.whatsAppOptInDisabled'),
        });
      },
      error: (err) => {
        this.contactWhatsAppPendingId.set(null);
        this.messageService.add({ severity: 'error', summary: this.errorMessage(err, 'customers.detail.whatsAppOptInError') });
      },
    });
  }

  private removeContact(contact: CustomerContact): void {
    const customer = this.drawerCustomer();
    if (!customer || this.contactPendingId()) return;
    this.contactPendingId.set(contact.id);
    this.customerService.removeContact(customer.id, contact.id).subscribe({
      next: updated => {
        this.contactPendingId.set(null);
        this.drawerCustomer.set(updated);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('customers.detail.contactDeleted') });
      },
      error: () => {
        this.contactPendingId.set(null);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('customers.detail.contactDeleteError') });
      },
    });
  }

  private errorMessage(err: unknown, fallbackKey: string): string {
    const code = (err as { error?: { errorCode?: string } })?.error?.errorCode;
    const key = customerImportErrorKey(code);
    return this.translate.instant(key ?? fallbackKey);
  }

  /** Mesma tabela de tradução (util partilhado), para as mensagens por linha do preview. */
  rowErrorMessage(row: { errorCode: string | null; message: string | null }): string | null {
    const key = customerImportErrorKey(row.errorCode);
    return key ? this.translate.instant(key) : row.message;
  }

  confirmDeactivate(row: Customer): void {
    this.confirmationService.confirm({
      message: this.translate.instant('customers.deactivateConfirm', { name: row.name }),
      header: this.translate.instant('customers.deactivateConfirmTitle'),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.translate.instant('customers.deactivate'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'warn' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => this.toggleActive(row, false),
    });
  }

  toggleActive(row: Customer, activate: boolean): void {
    if (this.pendingId()) return;
    this.pendingId.set(row.id);
    this.customerService.setActive(row.id, activate).subscribe({
      next: updated => {
        this.pendingId.set(null);
        if (this.drawerCustomer()?.id === row.id) this.drawerCustomer.set(updated);
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant(activate ? 'customers.activated' : 'customers.deactivated', { name: row.name }),
        });
        this.loadCustomers();
      },
      error: (err) => {
        this.pendingId.set(null);
        this.messageService.add({
          severity: 'error',
          // Issue #234/G4: CUSTOMER_HAS_OPEN_QUOTATION/ORDER/INVOICE vêm com `detail` explicando
          // o motivo — mostrar só "erro ao desativar" deixaria quem tentou sem saber porquê.
          summary: this.errorMessage(err, activate ? 'customers.activateError' : 'customers.deactivateError'),
        });
      },
    });
  }

  openImport(): void {
    this.resetImportState();
    this.importDialogVisible.set(true);
  }

  /** Modelo CSV gerado no cliente — cabeçalho e exemplos seguem os aliases aceitos por {@code CustomerCsvImportService}. */
  downloadImportTemplate(): void {
    const isEn = (this.translate.currentLang() || '').startsWith('en');
    const isPt = this.country() === 'PT';

    const header = isEn
      ? ['type', 'name', 'taxId', 'address', 'addressComplement', 'city', 'country', 'postalCode']
      : ['tipo', 'nome', 'documento', 'endereco', 'complemento', 'cidade', 'pais', 'cep'];
    const city = isPt ? 'Lisboa' : 'São Paulo';
    const countryName = isPt ? 'Portugal' : 'Brasil';
    const postalCode = isPt ? '1000-001' : '01310-000';

    const rows = [
      header,
      ['INDIVIDUAL', 'Maria Souza', '', 'Rua Exemplo 123', '', city, countryName, postalCode],
      ['COMPANY', 'Empresa Exemplo Ltda', '', 'Avenida Central 456', 'Sala 12', city, countryName, postalCode],
    ];
    const csv = rows.map(r => r.join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = isEn ? 'customers-template.csv' : 'modelo-clientes.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  closeImport(): void {
    this.importDialogVisible.set(false);
    this.importDialogMaximized.set(false);
    this.resetImportState();
    this.loadCustomers();
  }

  private resetImportState(): void {
    this.importFile = null;
    this.importPreview.set(null);
    this.previewLoading.set(false);
    this.importing.set(false);
  }

  onFileSelected(event: { files?: File[] }): void {
    const file = event.files?.[0];
    if (!file) return;
    this.importFile = file;
    this.previewLoading.set(true);
    this.customerService.previewImport(file).subscribe({
      next: preview => {
        this.previewLoading.set(false);
        this.importPreview.set(preview);
      },
      error: (err) => {
        this.previewLoading.set(false);
        this.importFile = null;
        this.fileUpload?.clear();
        this.messageService.add({ severity: 'error', summary: this.errorMessage(err, 'customers.import.fileError') });
      },
    });
  }

  /**
   * Arranca o job e fecha o modal de imediato (rework issue #35) — o utilizador não fica à
   * espera do processamento aqui, acompanha-o na área persistente do layout, que sobrevive a
   * navegação e a um refresh da página.
   */
  confirmImport(): void {
    if (!this.importFile || this.importing()) return;
    this.importing.set(true);
    this.customerImportService.startImport(this.importFile).subscribe({
      next: job => {
        this.importing.set(false);
        this.customerImportService.track(job);
        this.messageService.add({
          severity: 'info',
          summary: this.translate.instant('customers.import.started', { total: job.totalRows }),
        });
        this.closeImport();
      },
      error: (err) => {
        this.importing.set(false);
        this.messageService.add({ severity: 'error', summary: this.errorMessage(err, 'customers.import.fileError') });
      },
    });
  }
}
