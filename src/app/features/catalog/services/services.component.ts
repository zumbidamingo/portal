import { LaundryFeatureService } from '../../../core/services/laundry-feature.service';
import { ChangeDetectionStrategy, Component, OnInit, OnDestroy, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { DialogModule } from 'primeng/dialog';
import { DrawerModule } from 'primeng/drawer';
import { TooltipModule } from 'primeng/tooltip';
import { Panel } from 'primeng/panel';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { HttpErrorResponse } from '@angular/common/http';
import { debounceTime, distinctUntilChanged, switchMap, takeUntil } from 'rxjs/operators';
import { Observable, Subject, forkJoin, of } from 'rxjs';
import {
  ServiceCategoryService, ServiceService, SkillService,
  ServiceCategory, CatalogService, Skill, PriceType, ExecutionMode,
} from '../../../core/services/catalog.service';
import { TenantService } from '../../../core/services/tenant.service';
import { AuthService } from '../../../core/auth/auth.service';
import { TagBadgeComponent } from '../../../shared/components/tag-badge/tag-badge.component';
import type { BadgeSeverity } from '../../../shared/components/tag-badge/tag-badge.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { SkillQuickCreateComponent } from '../../../shared/components/skill-quick-create/skill-quick-create.component';
import { TableStandardDirective } from '../../../shared/directives/table-standard.directive';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-services',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule, TranslatePipe, TableModule, ButtonModule,
    InputTextModule, InputNumberModule, SelectModule, MultiSelectModule, DialogModule, DrawerModule, TooltipModule,
    ConfirmDialogModule, ToastModule, TagBadgeComponent, PageHeaderComponent, EmptyStateComponent, Panel,
    SkillQuickCreateComponent, TableStandardDirective,
  ],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast position="top-right"></p-toast>
    <p-confirmDialog></p-confirmDialog>

    <app-page-header [title]="'catalog.tabServices' | translate" [description]="'catalog.services.subtitle' | translate">
      @if (canWrite() && !servicesEmpty()) {
        <p-button [label]="'catalog.services.add' | translate" icon="pi pi-plus" size="small" (onClick)="openCreateService()"></p-button>
      }
    </app-page-header>

    @if (servicesEmpty()) {
      <app-empty-state icon="pi pi-th-large"
                       [message]="'catalog.services.emptyTitle' | translate"
                       [subtitle]="'catalog.services.emptySubtitle' | translate"></app-empty-state>
      @if (canWrite()) {
        <div class="flex justify-center -mt-3">
          <p-button icon="pi pi-plus" [label]="'catalog.services.add' | translate" (onClick)="openCreateService()"></p-button>
        </div>
      }
    } @else {
    <div class="mt-3">
    <p-panel>
    <div class="space-y-4">
      <div class="flex flex-wrap items-end gap-3">
        <div class="flex-1 min-w-56">
          <label class="label">{{ 'common.search' | translate }}</label>
          <input pInputText fluid [(ngModel)]="serviceSearch"
                 [placeholder]="'catalog.services.searchPlaceholder' | translate"
                 autocomplete="off"
                 (ngModelChange)="onSearchChange()" />
        </div>
        <div class="w-56">
          <label class="label">{{ 'catalog.services.category' | translate }}</label>
          <p-select [options]="allCategories()" [(ngModel)]="serviceCategoryId" optionLabel="name" optionValue="id"
                    appendTo="body" fluid [showClear]="true"
                    [placeholder]="'catalog.services.allCategories' | translate" (onChange)="applyServiceFilters()"></p-select>
        </div>
        <div class="w-44">
          <label class="label">{{ 'common.status' | translate }}</label>
          <p-select [options]="activeOptions" [(ngModel)]="serviceActive" optionLabel="label" optionValue="value"
                    appendTo="body" fluid [showClear]="true"
                    [placeholder]="'catalog.services.allStatuses' | translate" (onChange)="applyServiceFilters()"></p-select>
        </div>
        @if (hasActiveFilters()) {
          <p-button [label]="'common.clearFilters' | translate" icon="pi pi-filter-slash" [text]="true" size="small"
                    (onClick)="clearFilters()"></p-button>
        }
      </div>

      <p-table appTableStandard [value]="serviceRows()" dataKey="id" styleClass="p-datatable-sm"
               [lazy]="true" [rows]="pageSize" [totalRecords]="serviceTotal()"
               [loading]="serviceLoading()" [showLoader]="false" [first]="serviceFirst()"
               [sortField]="serviceSortField" [sortOrder]="serviceSortOrder"
               (onLazyLoad)="onServiceLazyLoad($event)">
        <ng-template pTemplate="header">
          <tr>
            <th pSortableColumn="name">{{ 'catalog.services.name' | translate }} <p-sortIcon field="name"></p-sortIcon></th>
            <th>{{ 'catalog.services.priceType' | translate }}</th>
            @if (laundryFeature.active()) {
              <th>{{ 'catalog.services.executionMode' | translate }}</th>
            }
            <th>{{ 'catalog.services.durationPerUnit' | translate }}</th>
            <th>{{ 'catalog.services.price' | translate }}</th>
            <th>{{ 'catalog.services.skills' | translate }}</th>
            <th pSortableColumn="active">{{ 'common.status' | translate }} <p-sortIcon field="active"></p-sortIcon></th>
            <th class="text-right w-20">{{ 'common.actions' | translate }}</th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr class="group cursor-pointer hover:bg-app-surface/50" (click)="openViewService(row)">
            <td>
              <div class="flex flex-col">
                <span class="font-medium text-app-text">{{ row.name }}</span>
                <span class="text-xs text-app-text-tertiary">{{ categoryName(row.categoryId) }}</span>
              </div>
            </td>
            <td>{{ ('catalog.services.priceType' + row.priceType) | translate }}</td>
            @if (laundryFeature.active()) {
              <td>
                <app-tag-badge [value]="('catalog.services.executionMode' + row.executionMode) | translate"
                               [severity]="row.executionMode === 'EXTERNAL' ? 'primary' : 'info'"></app-tag-badge>
              </td>
            }
            <td class="text-app-text-secondary whitespace-nowrap">
              {{ effectiveDuration(row) }} min
              @if (row.durationMinutesPerUnit == null) {
                <span class="text-app-text-tertiary text-[10px]">({{ 'catalog.services.inherited' | translate }})</span>
              }
            </td>
            <td>
              @if (row.price != null) {
                {{ row.price | currency:(row.currency ?? undefined):'symbol':'1.2-2' }}
              } @else {
                <span class="text-app-text-tertiary">{{ 'catalog.services.noPrice' | translate }}</span>
              }
            </td>
            <td>
              @if (row.requiredSkillIds.length === 0) {
                <span class="text-app-text-tertiary">{{ 'catalog.services.noSkills' | translate }}</span>
              } @else {
                <span class="text-sm">{{ skillNames(row.requiredSkillIds) }}</span>
              }
            </td>
            <td>
              <span [pTooltip]="isIncomplete(row) ? ('catalog.services.incompleteTooltip' | translate) : undefined" tooltipPosition="top">
                <app-tag-badge [value]="serviceStatusLabel(row)" [severity]="serviceStatusSeverity(row)"></app-tag-badge>
              </span>
            </td>
            <td class="text-right whitespace-nowrap" (click)="$event.stopPropagation()">
              @if (canWrite()) {
                <div class="flex justify-end gap-1">
                  <p-button icon="pi pi-pencil" [text]="true" size="small" severity="secondary"
                            [pTooltip]="'common.edit' | translate" tooltipPosition="top"
                            [disabled]="servicePendingId() === row.id" (onClick)="openEditService(row)"></p-button>
                  <p-button icon="pi pi-copy" [text]="true" size="small" severity="secondary"
                            [pTooltip]="'catalog.services.copy' | translate" tooltipPosition="top"
                            [disabled]="servicePendingId() === row.id" (onClick)="copyService(row)"></p-button>
                  @if (row.active) {
                    <p-button icon="pi pi-times-circle" [text]="true" size="small" severity="warn"
                              [pTooltip]="'catalog.services.deactivate' | translate" tooltipPosition="top"
                              [loading]="servicePendingId() === row.id" (onClick)="confirmToggleServiceActive(row, false)"></p-button>
                  } @else {
                    <p-button icon="pi pi-check-circle" [text]="true" size="small" severity="info"
                              [pTooltip]="'catalog.services.activate' | translate" tooltipPosition="top"
                              [loading]="servicePendingId() === row.id" (onClick)="toggleServiceActive(row, true)"></p-button>
                  }
                  <p-button icon="pi pi-trash" [text]="true" size="small" severity="danger"
                            [pTooltip]="'common.delete' | translate" tooltipPosition="top"
                            [loading]="deletePendingId() === row.id" (onClick)="confirmDeleteService(row)"></p-button>
                </div>
              }
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr>
            <td colspan="8" class="text-center text-app-text-tertiary py-16">
              <i class="pi pi-search text-3xl mb-3 block opacity-50"></i>
              <p class="text-sm font-medium text-app-text">{{ 'catalog.services.noMatchTitle' | translate }}</p>
              <p class="text-xs text-app-text-secondary mb-4">{{ 'catalog.services.noMatchSubtitle' | translate }}</p>
              <p-button [label]="'common.clearFilters' | translate" [text]="true" size="small"
                        (onClick)="clearFilters()"></p-button>
            </td>
          </tr>
        </ng-template>
      </p-table>
    </div>
    </p-panel>
    </div>
    }

    <!-- Dialog: criar/editar serviço -->
    <p-dialog [(visible)]="serviceDialogVisible" [modal]="true" [style]="{ width: '34rem', maxWidth: '95vw' }"
              [header]="(editingServiceId() ? 'catalog.services.editTitle' : 'catalog.services.addTitle') | translate">

      <p class="mb-5 text-xs text-app-text-tertiary">{{ (editingServiceId() ? 'catalog.services.editHint' : 'catalog.services.addHint') | translate }}</p>

      <form [formGroup]="serviceForm" (ngSubmit)="saveService()" class="space-y-5">
        <section class="space-y-4">
          <h4 class="text-[11px] font-semibold uppercase tracking-wide text-app-text-tertiary">{{ 'catalog.services.sectionGeneral' | translate }}</h4>

          <div>
            <label class="label">{{ 'catalog.services.name' | translate }} *</label>
            <input pInputText formControlName="name" fluid placeholder="Ex: Lavagem de Tapete" />
            @if (serviceForm.get('name')?.touched && serviceForm.get('name')?.hasError('required')) {
              <small class="text-app-danger text-[10px] mt-1 block">{{ 'errors.required' | translate }}</small>
            }
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label">{{ 'catalog.services.category' | translate }} *</label>
              <p-select [options]="allCategories()" formControlName="categoryId" optionLabel="name" optionValue="id"
                        appendTo="body" fluid [placeholder]="'Selecione uma categoria'" (onChange)="onCategorySelected($event.value)"></p-select>
              @if (serviceForm.get('categoryId')?.touched && serviceForm.get('categoryId')?.hasError('required')) {
                <small class="text-app-danger text-[10px] mt-1 block">{{ 'errors.required' | translate }}</small>
              }
            </div>
            <div>
              <label class="label">{{ 'catalog.services.priceType' | translate }} *</label>
              <p-select [options]="priceTypeOptions" formControlName="priceType" optionLabel="label" optionValue="value"
                        appendTo="body" fluid [placeholder]="'Selecione o tipo'"></p-select>
              @if (serviceForm.get('priceType')?.touched && serviceForm.get('priceType')?.hasError('required')) {
                <small class="text-app-danger text-[10px] mt-1 block">{{ 'errors.required' | translate }}</small>
              }
            </div>
          </div>
          @if (editingServiceId()) {
            <p class="text-[10px] text-app-text-tertiary leading-tight">
              <i class="pi pi-lock mr-1"></i>{{ 'catalog.services.lockedFieldsHint' | translate }}
            </p>
          }

          @if (laundryFeature.active()) {
            <div>
              <label class="label">{{ 'catalog.services.executionMode' | translate }} *</label>
              <p-select [options]="executionModeOptions" [ngModel]="dialogExecutionMode()" (ngModelChange)="dialogExecutionMode.set($event)"
                        [ngModelOptions]="{standalone: true}" optionLabel="label" optionValue="value"
                        appendTo="body" fluid></p-select>
              <p class="text-[10px] text-app-text-tertiary leading-tight mt-1">{{ 'catalog.services.executionModeHint' | translate }}</p>
            </div>
          }

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label">{{ 'catalog.services.durationPerUnit' | translate }}</label>
              <p-inputNumber [ngModel]="dialogDurationMinutesPerUnit()" (ngModelChange)="dialogDurationMinutesPerUnit.set($event)"
                             [ngModelOptions]="{standalone: true}" [min]="0" suffix=" min" fluid
                             [placeholder]="dialogDurationPlaceholder()"></p-inputNumber>
              <p class="text-[10px] text-app-text-tertiary leading-tight mt-1">{{ 'catalog.services.durationPerUnitHint' | translate }}</p>
            </div>
            <div>
              <label class="label">{{ 'catalog.services.tolerance' | translate }}</label>
              <p-inputNumber [ngModel]="dialogToleranceMinutes()" (ngModelChange)="dialogToleranceMinutes.set($event)"
                             [ngModelOptions]="{standalone: true}" [min]="0" suffix=" min" fluid
                             [placeholder]="dialogTolerancePlaceholder()"></p-inputNumber>
              <p class="text-[10px] text-app-text-tertiary leading-tight mt-1">{{ 'catalog.services.toleranceHint' | translate }}</p>
            </div>
          </div>
        </section>

        <section class="space-y-2 border-t border-app-border pt-4">
          <h4 class="text-[11px] font-semibold uppercase tracking-wide text-app-text-tertiary">{{ 'catalog.services.sectionPrice' | translate }}</h4>
          <label class="label">{{ 'catalog.services.priceLabel' | translate }}</label>
          <p-inputNumber [ngModel]="dialogPrice()" (ngModelChange)="dialogPrice.set($event)" [ngModelOptions]="{standalone: true}"
                          mode="decimal" [minFractionDigits]="2" [maxFractionDigits]="2" [min]="0" fluid [placeholder]="'0.00'"></p-inputNumber>
        </section>

        <section class="space-y-2 border-t border-app-border pt-4">
          <h4 class="text-[11px] font-semibold uppercase tracking-wide text-app-text-tertiary">{{ 'catalog.services.sectionSkills' | translate }}</h4>
          <label class="label">{{ 'catalog.services.skillsLabel' | translate }}</label>
          <p-multiSelect [options]="skillsRows()" [ngModel]="dialogSkillIds()" (ngModelChange)="dialogSkillIds.set($event)"
                          [ngModelOptions]="{standalone: true}" [filter]="true" (onFilter)="onSkillFilter($event)"
                          optionLabel="name" optionValue="id" appendTo="body" fluid display="chip">
            <ng-template #empty>
              <div class="p-3 text-center space-y-2">
                <p class="text-sm text-app-text-tertiary">{{ 'skillQuickCreate.noSkillsYet' | translate }}</p>
                <p-button [label]="'skillQuickCreate.cta' | translate" icon="pi pi-plus" size="small"
                          (onClick)="openSkillQuickCreate()"></p-button>
              </div>
            </ng-template>
            <ng-template #emptyfilter>
              <div class="p-3 text-center space-y-2">
                <p class="text-sm text-app-text-tertiary">{{ 'skillQuickCreate.noMatchTitle' | translate }}</p>
                <p-button [label]="'skillQuickCreate.cta' | translate" icon="pi pi-plus" size="small"
                          (onClick)="openSkillQuickCreate()"></p-button>
              </div>
            </ng-template>
          </p-multiSelect>
        </section>

        <section class="space-y-2 border-t border-app-border pt-4">
          <p class="text-[11px] font-semibold uppercase tracking-wide text-app-text-tertiary">{{ 'catalog.services.checklistTitle' | translate }}</p>
          <ul class="space-y-1">
            <li class="flex items-center gap-2 text-sm">
              <i class="pi" [class.pi-check-circle]="dialogHasPrice()" [class.text-app-success]="dialogHasPrice()"
                 [class.pi-circle]="!dialogHasPrice()" [class.text-app-text-tertiary]="!dialogHasPrice()"></i>
              <span [class.text-app-text]="dialogHasPrice()" [class.text-app-text-tertiary]="!dialogHasPrice()">{{ 'catalog.services.checklistPrice' | translate }}</span>
            </li>
            <li class="flex items-center gap-2 text-sm">
              <i class="pi" [class.pi-check-circle]="dialogHasSkills()" [class.text-app-success]="dialogHasSkills()"
                 [class.pi-circle]="!dialogHasSkills()" [class.text-app-text-tertiary]="!dialogHasSkills()"></i>
              <span [class.text-app-text]="dialogHasSkills()" [class.text-app-text-tertiary]="!dialogHasSkills()">{{ 'catalog.services.checklistSkills' | translate }}</span>
            </li>
          </ul>
          <p class="text-xs text-app-text-tertiary leading-relaxed" [class.text-app-success]="dialogComplete()" [class.text-app-text-tertiary]="!dialogComplete()">
            <i class="pi" [class.pi-check]="dialogComplete()" [class.pi-info-circle]="!dialogComplete()"></i>
            {{ (dialogComplete() ? 'catalog.services.readyHint' : 'catalog.services.notReadyHint') | translate }}
          </p>
          
        </section>

        <div class="flex justify-end gap-2 pt-4 border-t border-app-border">
          <p-button type="button" [label]="'common.close' | translate" outlined (onClick)="serviceDialogVisible.set(false)"></p-button>
          <p-button type="submit" [label]="'common.save' | translate" icon="pi pi-check"
                    [loading]="serviceSaving()" [disabled]="serviceForm.invalid"></p-button>
        </div>
      </form>
    </p-dialog>

    <app-skill-quick-create [(visible)]="skillQuickCreateVisible" [prefill]="skillQuickCreatePrefill()"
                             (skillCreated)="onSkillCreated($event)"></app-skill-quick-create>

    <!-- Drawer: visualizar serviço -->
    <p-drawer [(visible)]="drawerVisible" position="right" [dismissible]="true" [closeOnEscape]="true"
              styleClass="w-full! sm:w-[30rem]! md:w-[34rem]!" [header]="''">
      <ng-template #header>
        @if (drawerService(); as svc) {
          <div class="flex items-center gap-2 min-w-0">
            <span class="font-semibold text-app-text truncate">{{ svc.name }}</span>
            <app-tag-badge [value]="serviceStatusLabel(svc)" [severity]="serviceStatusSeverity(svc)"></app-tag-badge>
          </div>
        } @else {
          <span class="font-semibold text-app-text">{{ 'catalog.services.drawerTitle' | translate }}</span>
        }
      </ng-template>

      @if (drawerService(); as svc) {
        <div class="space-y-5 pb-4">
          @if (isIncomplete(svc)) {
            <p class="mb-5 text-xs text-app-text-tertiary">
              <i class="pi pi-exclamation-triangle mr-1 text-app-warning"></i>
              {{ 'catalog.services.notReadyHint' | translate }}
            </p>
          }

          <section class="space-y-2">
            <h4 class="text-[11px] font-semibold uppercase tracking-wide text-app-text-tertiary">{{ 'catalog.services.sectionGeneral' | translate }}</h4>
            <dl class="grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
              <div>
                <dt class="text-app-text-tertiary text-xs">{{ 'catalog.services.category' | translate }}</dt>
                <dd class="text-app-text">{{ categoryName(svc.categoryId) }}</dd>
              </div>
              <div>
                <dt class="text-app-text-tertiary text-xs">{{ 'catalog.services.priceType' | translate }}</dt>
                <dd class="text-app-text">{{ ('catalog.services.priceType' + svc.priceType) | translate }}</dd>
              </div>
              @if (laundryFeature.active()) {
                <div>
                  <dt class="text-app-text-tertiary text-xs">{{ 'catalog.services.executionMode' | translate }}</dt>
                  <dd class="text-app-text">{{ ('catalog.services.executionMode' + svc.executionMode) | translate }}</dd>
                </div>
              }
              <div>
                <dt class="text-app-text-tertiary text-xs">{{ 'catalog.services.durationPerUnit' | translate }}</dt>
                <dd class="text-app-text">
                  {{ effectiveDuration(svc) }} min
                  @if (svc.durationMinutesPerUnit == null) {
                    <span class="text-app-text-tertiary text-xs">({{ 'catalog.services.inherited' | translate }})</span>
                  }
                </dd>
              </div>
              <div>
                <dt class="text-app-text-tertiary text-xs">{{ 'catalog.services.tolerance' | translate }}</dt>
                <dd class="text-app-text">
                  {{ effectiveTolerance(svc) }} min
                  @if (svc.toleranceMinutes == null) {
                    <span class="text-app-text-tertiary text-xs">({{ 'catalog.services.inherited' | translate }})</span>
                  }
                </dd>
              </div>
              <div>
                <dt class="text-app-text-tertiary text-xs">{{ 'catalog.services.price' | translate }}</dt>
                <dd class="text-app-text">
                  @if (svc.price != null) {
                    {{ svc.price | currency:(svc.currency ?? undefined):'symbol':'1.2-2' }}
                  } @else {
                    <span class="text-app-text-tertiary">{{ 'catalog.services.noPrice' | translate }}</span>
                  }
                </dd>
              </div>
            </dl>
          </section>

          <section class="space-y-2 border-t border-app-border pt-4">
            <h4 class="text-[11px] font-semibold uppercase tracking-wide text-app-text-tertiary">{{ 'catalog.services.sectionSkills' | translate }}</h4>
            @if (svc.requiredSkillIds.length === 0) {
              <p class="text-sm text-app-text-tertiary">{{ 'catalog.services.noSkills' | translate }}</p>
            } @else {
              <ul class="space-y-1">
                @for (id of svc.requiredSkillIds; track id) {
                  <li class="text-sm text-app-text">{{ skillName(id) }}</li>
                }
              </ul>
            }
          </section>
        </div>
      }

      <ng-template #footer>
        @if (drawerService(); as svc) {
          @if (canWrite()) {
            <div class="flex justify-end gap-2">
              <p-button [label]="'common.delete' | translate" icon="pi pi-trash" severity="danger" [outlined]="true"
                        [loading]="deletePendingId() === svc.id" (onClick)="confirmDeleteService(svc)"></p-button>
              <p-button [label]="'common.edit' | translate" icon="pi pi-pencil" (onClick)="editFromDrawer(svc)"></p-button>
            </div>
          }
        }
      </ng-template>
    </p-drawer>
  `,
  styles: [`
    @reference "../../../../styles.css";
    .label { @apply block text-[11px] font-medium text-app-text-secondary mb-1.5; }
  `],
})
export class ServicesComponent implements OnInit, OnDestroy {
  protected laundryFeature = inject(LaundryFeatureService);
  private fb = inject(FormBuilder);
  private categoryService = inject(ServiceCategoryService);
  private serviceService = inject(ServiceService);
  private skillService = inject(SkillService);
  private tenantService = inject(TenantService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);
  private translate = inject(TranslateService);
  private auth = inject(AuthService);
  private readonly destroy$ = new Subject<void>();

  readonly canWrite = computed(() => ['OWNER', 'ADMIN', 'OPERATOR'].includes(this.auth.userRole() ?? ''));
  readonly pageSize = PAGE_SIZE;

  tenantCurrency = signal('BRL');
  /** Topo da herança de tolerância (issue #172) — fallback só até o `getMe()` responder,
   *  espelha o default de tenant novo no backend (`Tenant#serviceToleranceMinutes`). */
  tenantToleranceDefault = signal(15);

  readonly activeOptions = [
    { label: this.translate.instant('common.active'), value: true },
    { label: this.translate.instant('common.inactive'), value: false },
  ];

  readonly priceTypeOptions: { label: string; value: PriceType }[] = [
    { label: this.translate.instant('catalog.services.priceTypeFIXED'), value: 'FIXED' },
    { label: this.translate.instant('catalog.services.priceTypePER_SQUARE_METER'), value: 'PER_SQUARE_METER' },
    { label: this.translate.instant('catalog.services.priceTypePER_PIECE'), value: 'PER_PIECE' },
    { label: this.translate.instant('catalog.services.priceTypePER_HOUR'), value: 'PER_HOUR' },
  ];

  readonly executionModeOptions: { label: string; value: ExecutionMode }[] = [
    { label: this.translate.instant('catalog.services.executionModeONSITE'), value: 'ONSITE' },
    { label: this.translate.instant('catalog.services.executionModeEXTERNAL'), value: 'EXTERNAL' },
  ];

  allCategories = signal<ServiceCategory[]>([]);
  serviceRows = signal<CatalogService[]>([]);
  serviceTotal = signal(0);
  serviceFirst = signal(0);
  serviceLoading = signal(false);
  servicesEmpty = computed(() => !this.serviceLoading() && this.serviceTotal() === 0 && !this.hasActiveFilters());
  servicePendingId = signal<string | null>(null);
  deletePendingId = signal<string | null>(null);
  serviceSearch = '';
  serviceCategoryId: string | null = null;
  serviceActive: boolean | null = null;
  serviceSortField = 'name';
  serviceSortOrder = 1;
  private servicePage = 0;
  private lastServiceQuery = '';

  serviceDialogVisible = signal(false);
  serviceSaving = signal(false);
  editingServiceId = signal<string | null>(null);
  private dialogWasActiveOnOpen = false;
  private dialogWasCompleteOnOpen = false;
  private dialogOriginalSkillIds: string[] = [];

  dialogPrice = signal<number | null>(null);
  dialogSkillIds = signal<string[]>([]);
  dialogExecutionMode = signal<ExecutionMode>('ONSITE');
  private dialogOriginalExecutionMode: ExecutionMode = 'ONSITE';

  /** Issue #172: `null` significa "herda da categoria", não "zero" — é o que distingue um
   *  serviço sem folga de um que segue a folga da categoria. */
  dialogToleranceMinutes = signal<number | null>(null);
  dialogDurationMinutesPerUnit = signal<number | null>(null);
  private dialogOriginalToleranceMinutes: number | null = null;
  private dialogOriginalDurationMinutesPerUnit: number | null = null;
  dialogHasPrice = computed(() => (this.dialogPrice() ?? 0) > 0);
  dialogHasSkills = computed(() => this.dialogSkillIds().length > 0);
  dialogComplete = computed(() => this.dialogHasPrice() && this.dialogHasSkills());

  serviceForm = this.fb.group({
    categoryId: [null as string | null, Validators.required],
    name: ['', Validators.required],
    priceType: [null as PriceType | null, Validators.required],
  });

  drawerVisible = signal(false);
  drawerService = signal<CatalogService | null>(null);

  skillsRows = signal<Skill[]>([]);
  skillFilterTerm = '';
  skillQuickCreateVisible = signal(false);
  skillQuickCreatePrefill = signal<string | null>(null);
  private search$ = new Subject<string>();

  ngOnInit(): void {
    this.tenantService.getMe().subscribe({
      next: t => {
        if (t.currency) this.tenantCurrency.set(t.currency);
        this.tenantToleranceDefault.set(t.systemParameters?.serviceToleranceMinutes ?? 15);
      },
      error: () => {},
    });
    this.loadAllCategories();
    this.loadServices();
    this.loadSkills();

    this.search$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    ).subscribe(() => {
      this.servicePage = 0;
      this.serviceFirst.set(0);
      this.loadServices();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  categoryName(id: string): string {
    return this.allCategories().find(c => c.id === id)?.name ?? '—';
  }

  /** Ao criar um serviço, o modo de execução parte do default da categoria escolhida — o usuário
   *  continua livre para mudá-lo antes de salvar. Não se aplica ao editar (categoria trancada). */
  onCategorySelected(categoryId: string): void {
    if (this.editingServiceId()) return;
    const category = this.allCategories().find(c => c.id === categoryId);
    // Sem lavanderia em uso o serviço nasce no local — o backend recusa EXTERNAL nesse caso.
    if (category) this.dialogExecutionMode.set(this.laundryFeature.active() ? category.defaultExecutionMode : 'ONSITE');
  }

  private categoryFor(categoryId: string): ServiceCategory | undefined {
    return this.allCategories().find(c => c.id === categoryId);
  }

  /** Valor efetivamente aplicado (issue #172) — resolve a herança em vez de só dizer "herda":
   *  category sempre tem duração própria, então dois níveis bastam aqui. */
  effectiveDuration(row: CatalogService): number {
    return row.durationMinutesPerUnit ?? this.categoryFor(row.categoryId)?.defaultDurationMinutesPerUnit ?? 0;
  }

  /** Mesma ideia para tolerância, três níveis: serviço → categoria → tenant. */
  effectiveTolerance(row: CatalogService): number {
    if (row.toleranceMinutes != null) return row.toleranceMinutes;
    const category = this.categoryFor(row.categoryId);
    return category?.toleranceMinutes ?? this.tenantToleranceDefault();
  }

  /** Categoria escolhida no formulário aberto — base do placeholder dinâmico dos campos de
   *  duração/tolerância, para o valor herdado aparecer sem o usuário ter de sair e conferir a
   *  categoria à parte. */
  private dialogSelectedCategory(): ServiceCategory | undefined {
    const categoryId = this.serviceForm.get('categoryId')?.value;
    return categoryId ? this.categoryFor(categoryId) : undefined;
  }

  dialogDurationPlaceholder(): string {
    const category = this.dialogSelectedCategory();
    if (!category) return this.translate.instant('catalog.services.inheritFromCategory');
    return this.translate.instant('catalog.services.inheritsWithValue', { value: category.defaultDurationMinutesPerUnit });
  }

  dialogTolerancePlaceholder(): string {
    const category = this.dialogSelectedCategory();
    const value = category?.toleranceMinutes ?? this.tenantToleranceDefault();
    return this.translate.instant('catalog.services.inheritsWithValue', { value });
  }

  skillName(id: string): string {
    return this.skillsRows().find(s => s.id === id)?.name ?? '?';
  }

  skillNames(ids: string[]): string {
    return ids.map(id => this.skillsRows().find(s => s.id === id)?.name ?? '?').join(', ');
  }

  isIncomplete(row: CatalogService): boolean {
    return !row.active && (row.price == null || row.requiredSkillIds.length === 0);
  }

  serviceStatusLabel(row: CatalogService): string {
    if (row.active) return this.translate.instant('common.active');
    if (this.isIncomplete(row)) return this.translate.instant('catalog.services.incomplete');
    return this.translate.instant('common.inactive');
  }

  serviceStatusSeverity(row: CatalogService): BadgeSeverity {
    if (row.active) return 'success';
    if (this.isIncomplete(row)) return 'warn';
    return 'secondary';
  }

  private loadAllCategories(): void {
    this.categoryService.list({ page: 0, size: 200 }).subscribe({
      next: result => this.allCategories.set(result.content),
      error: () => {},
    });
  }

  private currentServiceQuery(): string {
    return [this.serviceSearch.trim(), this.serviceCategoryId ?? '', this.serviceActive ?? '', this.servicePage].join('|');
  }

  hasActiveFilters(): boolean {
    return !!this.serviceSearch.trim() || this.serviceCategoryId !== null || this.serviceActive !== null;
  }

  onSearchChange(): void {
    this.search$.next(this.serviceSearch);
  }

  applyServiceFilters(): void {
    if (this.currentServiceQuery() === this.lastServiceQuery) return;
    this.servicePage = 0;
    this.serviceFirst.set(0);
    this.loadServices();
  }

  clearFilters(): void {
    this.serviceSearch = '';
    this.serviceCategoryId = null;
    this.serviceActive = null;
    this.applyServiceFilters();
  }

  onServiceLazyLoad(event: TableLazyLoadEvent): void {
    this.servicePage = Math.floor((event.first ?? 0) / (event.rows ?? PAGE_SIZE));
    this.serviceFirst.set(event.first ?? 0);
    if (typeof event.sortField === 'string') {
      this.serviceSortField = event.sortField;
      this.serviceSortOrder = event.sortOrder === -1 ? -1 : 1;
    }
    this.loadServices();
  }

  loadServices(): void {
    this.serviceLoading.set(true);
    this.lastServiceQuery = this.currentServiceQuery();
    this.serviceService.list({
      categoryId: this.serviceCategoryId, active: this.serviceActive, name: this.serviceSearch,
      page: this.servicePage, size: PAGE_SIZE,
      sort: `${this.serviceSortField},${this.serviceSortOrder === -1 ? 'desc' : 'asc'}`,
    }).subscribe({
      next: result => {
        this.serviceRows.set(result.content);
        this.serviceTotal.set(result.page.totalElements);
        this.serviceLoading.set(false);
        this.syncDrawerService(result.content);
      },
      error: () => {
        this.serviceLoading.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('catalog.services.loadError') });
      },
    });
  }

  /** Mantém o Drawer aberto sincronizado (preço/skills/estado) depois de qualquer recarga da tabela. */
  private syncDrawerService(rows: CatalogService[]): void {
    const current = this.drawerService();
    if (!current) return;
    const updated = rows.find(r => r.id === current.id);
    if (updated) this.drawerService.set(updated);
  }

  openCreateService(): void {
    this.editingServiceId.set(null);
    this.serviceForm.get('categoryId')?.enable();
    this.serviceForm.get('priceType')?.enable();
    this.serviceForm.reset({ categoryId: null, name: '', priceType: null });
    this.dialogPrice.set(null);
    this.dialogSkillIds.set([]);
    this.dialogOriginalSkillIds = [];
    this.dialogExecutionMode.set('ONSITE');
    this.dialogOriginalExecutionMode = 'ONSITE';
    this.dialogWasActiveOnOpen = false;
    this.dialogWasCompleteOnOpen = false;
    this.serviceDialogVisible.set(true);
  }

  openViewService(row: CatalogService): void {
    this.drawerService.set(row);
    this.drawerVisible.set(true);
  }

  openEditService(row: CatalogService): void {
    this.editingServiceId.set(row.id);
    this.serviceForm.reset({ categoryId: row.categoryId, name: row.name, priceType: row.priceType });
    this.serviceForm.get('categoryId')?.disable();
    this.serviceForm.get('priceType')?.disable();
    this.dialogPrice.set(row.price);
    this.dialogSkillIds.set([...row.requiredSkillIds]);
    this.dialogOriginalSkillIds = [...row.requiredSkillIds];
    this.dialogExecutionMode.set(row.executionMode);
    this.dialogOriginalExecutionMode = row.executionMode;
    this.dialogToleranceMinutes.set(row.toleranceMinutes);
    this.dialogDurationMinutesPerUnit.set(row.durationMinutesPerUnit);
    this.dialogOriginalToleranceMinutes = row.toleranceMinutes;
    this.dialogOriginalDurationMinutesPerUnit = row.durationMinutesPerUnit;
    this.dialogWasActiveOnOpen = row.active;
    this.dialogWasCompleteOnOpen = row.price != null && row.requiredSkillIds.length > 0;
    this.serviceDialogVisible.set(true);
  }

  editFromDrawer(row: CatalogService): void {
    this.drawerVisible.set(false);
    this.openEditService(row);
  }

  /** Abre o dialog de criação pré-preenchido com os dados de `row` — o original não é tocado, o save cria um registo novo. */
  copyService(row: CatalogService): void {
    this.editingServiceId.set(null);
    this.serviceForm.get('categoryId')?.enable();
    this.serviceForm.get('priceType')?.enable();
    this.serviceForm.reset({
      categoryId: row.categoryId,
      name: this.translate.instant('catalog.services.copyName', { name: row.name }),
      priceType: row.priceType,
    });
    this.dialogPrice.set(row.price);
    this.dialogSkillIds.set([...row.requiredSkillIds]);
    this.dialogOriginalSkillIds = [];
    this.dialogExecutionMode.set(this.laundryFeature.active() ? row.executionMode : 'ONSITE');
    this.dialogOriginalExecutionMode = 'ONSITE'; // cópia é sempre um serviço novo, força a mudança a aplicar
    this.dialogToleranceMinutes.set(row.toleranceMinutes);
    this.dialogDurationMinutesPerUnit.set(row.durationMinutesPerUnit);
    // Mesma razão: a cópia nasce a herdar, e os valores copiados têm de ser aplicados nela.
    this.dialogOriginalToleranceMinutes = null;
    this.dialogOriginalDurationMinutesPerUnit = null;
    this.dialogWasActiveOnOpen = false;
    this.dialogWasCompleteOnOpen = false;
    this.serviceDialogVisible.set(true);
  }

  saveService(): void {
    this.serviceForm.markAllAsTouched();
    if (this.serviceForm.invalid) return;
    this.serviceSaving.set(true);
    const v = this.serviceForm.getRawValue();
    const editingId = this.editingServiceId();
    if (editingId) {
      this.saveExistingService(editingId, v.name!);
    } else {
      this.createNewService(v.categoryId!, v.name!, v.priceType!);
    }
  }

  private createNewService(categoryId: string, name: string, priceType: PriceType): void {
    this.serviceService.create({ categoryId, name, priceType }).pipe(
      switchMap(created => this.applyDialogDetails(created.id, [], this.dialogSkillIds())),
    ).subscribe({
      next: () => this.onServiceSaved(),
      error: (err: HttpErrorResponse) => this.onServiceSaveError(err),
    });
  }

  private saveExistingService(id: string, name: string): void {
    const toAdd = this.dialogSkillIds().filter(sid => !this.dialogOriginalSkillIds.includes(sid));
    const toRemove = this.dialogOriginalSkillIds.filter(sid => !this.dialogSkillIds().includes(sid));
    this.serviceService.rename(id, name).pipe(
      switchMap(() => this.applyDialogDetails(id, toRemove, toAdd)),
    ).subscribe({
      next: () => this.onServiceSaved(),
      error: (err: HttpErrorResponse) => this.onServiceSaveError(err),
    });
  }

  /** Aplica skills + preço do dialog e, se o serviço passou de incompleto/inativo para completo nesta sessão, ativa-o. */
  private applyDialogDetails(serviceId: string, skillIdsToRemove: string[], skillIdsToAdd: string[]): Observable<unknown> {
    const skillOps = [
      ...skillIdsToAdd.map(sid => this.serviceService.assignSkill(serviceId, sid)),
      ...skillIdsToRemove.map(sid => this.serviceService.removeSkill(serviceId, sid)),
    ];
    const skills$: Observable<unknown> = skillOps.length > 0 ? forkJoin(skillOps) : of(null);
    const price = this.dialogPrice();
    const executionMode = this.dialogExecutionMode();
    const executionModeChanged = executionMode !== this.dialogOriginalExecutionMode;

    return skills$.pipe(
      switchMap((): Observable<unknown> => (price != null && price > 0)
        ? this.serviceService.changePrice(serviceId, price, this.tenantCurrency())
        : of(null)),
      switchMap((): Observable<unknown> => executionModeChanged
        ? this.serviceService.changeExecutionMode(serviceId, executionMode)
        : of(null)),
      switchMap((): Observable<unknown> => this.timingChanged()
        ? this.serviceService.changeTiming(serviceId, this.dialogToleranceMinutes(), this.dialogDurationMinutesPerUnit())
        : of(null)),
      switchMap((): Observable<unknown> => {
        const shouldActivate = !this.dialogWasActiveOnOpen && !this.dialogWasCompleteOnOpen && this.dialogComplete();
        return shouldActivate ? this.serviceService.activate(serviceId) : of(null);
      }),
    );
  }

  /** Duração ou tolerância do serviço mudaram no dialog? — issue #172. */
  private timingChanged(): boolean {
    return this.dialogToleranceMinutes() !== this.dialogOriginalToleranceMinutes
      || this.dialogDurationMinutesPerUnit() !== this.dialogOriginalDurationMinutesPerUnit;
  }

  private onServiceSaved(): void {
    this.serviceSaving.set(false);
    this.serviceDialogVisible.set(false);
    this.messageService.add({ severity: 'success', summary: this.translate.instant('catalog.services.saved') });
    this.loadServices();
  }

  private onServiceSaveError(err: HttpErrorResponse): void {
    this.serviceSaving.set(false);
    this.messageService.add({ severity: 'error', summary: this.businessError(err, 'catalog.services.errors', 'catalog.services.saveError') });
  }

  confirmToggleServiceActive(row: CatalogService, activate: boolean): void {
    this.confirmationService.confirm({
      message: this.translate.instant(activate ? 'catalog.services.activated' : 'catalog.services.confirmDeactivateMessage', { name: row.name }),
      header: this.translate.instant(activate ? 'catalog.services.activate' : 'catalog.services.confirmDeactivateTitle'),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.translate.instant(activate ? 'catalog.services.activate' : 'catalog.services.deactivate'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: activate ? 'info' : 'warn' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => this.toggleServiceActive(row, activate),
    });
  }

  toggleServiceActive(row: CatalogService, activate: boolean): void {
    if (this.servicePendingId()) return;
    this.servicePendingId.set(row.id);
    const obs$ = activate ? this.serviceService.activate(row.id) : this.serviceService.deactivate(row.id);
    obs$.subscribe({
      next: () => {
        this.servicePendingId.set(null);
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant(activate ? 'catalog.services.activated' : 'catalog.services.deactivated', { name: row.name }),
        });
        this.loadServices();
      },
      error: (err: HttpErrorResponse) => {
        this.servicePendingId.set(null);
        const fallback = activate ? 'catalog.services.activateError' : 'catalog.services.deactivateError';
        this.messageService.add({ severity: 'error', summary: this.businessError(err, 'catalog.services.errors', fallback) });
      },
    });
  }

  confirmDeleteService(row: CatalogService): void {
    this.confirmationService.confirm({
      message: this.translate.instant('catalog.services.deleteConfirmMessage', { name: row.name }),
      header: this.translate.instant('catalog.services.deleteTitle'),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.translate.instant('common.delete'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => this.deleteService(row),
    });
  }

  private deleteService(row: CatalogService): void {
    if (this.deletePendingId()) return;
    this.deletePendingId.set(row.id);
    this.serviceService.delete(row.id).subscribe({
      next: () => {
        this.deletePendingId.set(null);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('catalog.services.deleted', { name: row.name }) });
        if (this.drawerService()?.id === row.id) this.drawerVisible.set(false);
        this.loadServices();
      },
      error: (err: HttpErrorResponse) => {
        this.deletePendingId.set(null);
        this.messageService.add({ severity: 'error', summary: this.businessError(err, 'catalog.services.errors', 'catalog.services.deleteError') });
      },
    });
  }

  private loadSkills(): void {
    this.skillService.list().subscribe({
      next: skills => this.skillsRows.set(skills),
      error: () => {},
    });
  }

  onSkillFilter(event: { filter?: string }): void {
    this.skillFilterTerm = event?.filter ?? '';
  }

  openSkillQuickCreate(): void {
    this.skillQuickCreatePrefill.set(this.skillFilterTerm.trim() || null);
    this.skillQuickCreateVisible.set(true);
  }

  onSkillCreated(skill: Skill): void {
    this.skillsRows.update(list => [skill, ...list]);
    this.dialogSkillIds.update(ids => [...ids, skill.id]);
    this.skillFilterTerm = '';
  }

  private businessError(err: HttpErrorResponse, scope: string, fallbackKey: string): string {
    const code = (err.error as { errorCode?: string } | null)?.errorCode;
    if (err.status === 422 && code) {
      const key = `${scope}.${code}`;
      const translated = this.translate.instant(key);
      if (translated !== key) return translated;
    }
    return this.translate.instant(fallbackKey);
  }
}
