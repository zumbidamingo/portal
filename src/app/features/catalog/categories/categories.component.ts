import { LaundryFeatureService } from '../../../core/services/laundry-feature.service';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
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
import { map, switchMap } from 'rxjs/operators';
import { Observable, forkJoin, of } from 'rxjs';
import {
  ServiceCategoryService, ServiceService, SkillService, ServiceCategory, CatalogService, Skill, PriceType, ExecutionMode,
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
  selector: 'app-categories',
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
    <p-confirmDialog [style]="{ width: '26rem' }"></p-confirmDialog>

    <app-page-header [title]="'catalog.tabCategories' | translate" [description]="'catalog.categories.subtitle' | translate">
      @if (canWrite() && !categoriesEmpty()) {
        <p-button [label]="'catalog.categories.add' | translate" icon="pi pi-plus" size="small" (onClick)="openCreateCategory()"></p-button>
      }
    </app-page-header>

    @if (categoriesEmpty()) {
      <app-empty-state icon="pi pi-tags"
                       [message]="'catalog.categories.emptyTitle' | translate"
                       [subtitle]="'catalog.categories.emptySubtitle' | translate"></app-empty-state>
      @if (canWrite()) {
        <div class="flex justify-center -mt-3">
          <p-button icon="pi pi-plus" [label]="'catalog.categories.add' | translate" (onClick)="openCreateCategory()"></p-button>
        </div>
      }
    } @else {
    <p-panel>
      <div class="space-y-4 min-w-0">
        <div class="flex flex-wrap items-end gap-3">
          <div class="flex-1 min-w-56">
            <label class="label">{{ 'common.search' | translate }}</label>
            <input pInputText fluid [(ngModel)]="categorySearch"
                  [placeholder]="'catalog.categories.searchPlaceholder' | translate"
                  autocomplete="off"
                  (ngModelChange)="applyFilters()" />
          </div>
          @if (hasActiveFilters()) {
            <p-button [label]="'common.clearFilters' | translate" icon="pi pi-filter-slash" [text]="true" size="small"
                      (onClick)="clearFilters()"></p-button>
          }
        </div>

        <p-table appTableStandard [value]="categoryRows()" dataKey="id" styleClass="p-datatable-sm"
                [lazy]="true" [rows]="pageSize" [totalRecords]="categoryTotal()"
                [loading]="categoryLoading()" [showLoader]="false" [first]="categoryFirst()"
                [sortField]="categorySortField" [sortOrder]="categorySortOrder"
                (onLazyLoad)="onCategoryLazyLoad($event)">
          <ng-template pTemplate="header">
            <tr>
              <th pSortableColumn="name">{{ 'catalog.categories.name' | translate }} <p-sortIcon field="name"></p-sortIcon></th>
              <th pSortableColumn="displayOrder">{{ 'catalog.categories.displayOrder' | translate }} <p-sortIcon field="displayOrder"></p-sortIcon></th>
              @if (laundryFeature.active()) {
                <th>{{ 'catalog.services.executionMode' | translate }}</th>
              }
              <th>{{ 'catalog.categories.defaultDuration' | translate }}</th>
              <th pSortableColumn="active" class="w-32">{{ 'common.status' | translate }} <p-sortIcon field="active"></p-sortIcon></th>
              <th class="text-right w-32">{{ 'common.actions' | translate }}</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-row>
            <tr class="group cursor-pointer hover:bg-app-surface/50" (click)="openCategoryDrawer(row)">
              <td class="font-medium text-app-text">{{ row.name }}</td>
              <td>{{ row.displayOrder }}</td>
              @if (laundryFeature.active()) {
                <td>
                  <app-tag-badge [value]="('catalog.services.executionMode' + row.defaultExecutionMode) | translate"
                                 [severity]="row.defaultExecutionMode === 'EXTERNAL' ? 'primary' : 'info'"></app-tag-badge>
                </td>
              }
              <td class="text-app-text-secondary">{{ row.defaultDurationMinutesPerUnit }} min</td>
              <td>
                <app-tag-badge [value]="statusLabel(row.active)" [severity]="statusSeverity(row.active)"></app-tag-badge>
              </td>
              <td class="text-right whitespace-nowrap" (click)="$event.stopPropagation()">
                @if (canWrite()) {
                  <div class="flex justify-end gap-1">
                    <p-button icon="pi pi-pencil" [text]="true" size="small" severity="secondary"
                              [pTooltip]="'common.edit' | translate" tooltipPosition="top"
                              [disabled]="categoryPendingId() === row.id" (onClick)="openEditCategory(row)"></p-button>
                    @if (row.active) {
                      <p-button icon="pi pi-times-circle" [text]="true" size="small" severity="warn"
                                [pTooltip]="'catalog.categories.deactivate' | translate" tooltipPosition="top"
                                [loading]="categoryPendingId() === row.id" (onClick)="confirmToggleActive(row, false)"></p-button>
                    } @else {
                      <p-button icon="pi pi-check-circle" [text]="true" size="small" severity="info"
                                [pTooltip]="'catalog.categories.activate' | translate" tooltipPosition="top"
                                [loading]="categoryPendingId() === row.id" (onClick)="toggleCategoryActive(row, true)"></p-button>
                    }
                    <p-button icon="pi pi-trash" [text]="true" size="small" severity="danger"
                              [pTooltip]="'common.delete' | translate" tooltipPosition="top"
                              [loading]="deletePendingId() === row.id" (onClick)="confirmDeleteCategory(row)"></p-button>
                  </div>
                }
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="6" class="text-center text-app-text-tertiary py-16">
                <i class="pi pi-search text-3xl mb-3 block opacity-50"></i>
                <p class="text-sm font-medium text-app-text">{{ 'catalog.categories.noMatchTitle' | translate }}</p>
                <p class="text-xs text-app-text-secondary mb-4">{{ 'catalog.categories.noMatchSubtitle' | translate }}</p>
                <p-button [label]="'common.clearFilters' | translate" [text]="true" size="small"
                          (onClick)="clearFilters()"></p-button>
              </td>
            </tr>
          </ng-template>
        </p-table>
      </div>
    </p-panel>
    }

    <!-- Dialog: criar/editar categoria -->
    <p-dialog [(visible)]="categoryDialogVisible" [modal]="true" [style]="{ width: '32rem', maxWidth: '95vw' }"
              [header]="(editingCategoryId() ? 'catalog.categories.editTitle' : 'catalog.categories.addTitle') | translate">

      <p class="text-xs text-app-text-tertiary">{{ 'catalog.categories.addHint' | translate }}</p>

      <form [formGroup]="categoryForm" (ngSubmit)="saveCategory()" class="space-y-4">
        <div>
          <label class="label">{{ 'catalog.categories.name' | translate }} *</label>
          <input pInputText formControlName="name" fluid [placeholder]="'Ex: Higienização, Reformas...'" />
          @if (categoryForm.get('name')?.touched && categoryForm.get('name')?.hasError('required')) {
            <small class="text-app-danger text-[10px] mt-1 block">{{ 'errors.required' | translate }}</small>
          }
        </div>
        <div>
          <label class="label">{{ 'catalog.categories.displayOrder' | translate }} *</label>
          <p-inputNumber formControlName="displayOrder" fluid [min]="0"></p-inputNumber>
          <small class="text-app-text-tertiary text-[10px] block mt-1 leading-tight">{{ 'catalog.categories.orderHint' | translate }}</small>
        </div>
        @if (laundryFeature.active()) {
          <div>
            <label class="label">{{ 'catalog.services.executionMode' | translate }} *</label>
            <p-select [options]="executionModeOptions" formControlName="defaultExecutionMode" optionLabel="label" optionValue="value"
                      appendTo="body" fluid></p-select>
            <small class="text-app-text-tertiary text-[10px] block mt-1 leading-tight">{{ 'catalog.categories.executionModeHint' | translate }}</small>
          </div>
        }
        <div>
          <label class="label">{{ 'catalog.categories.defaultDuration' | translate }} *</label>
          <p-inputNumber formControlName="defaultDurationMinutesPerUnit" fluid [min]="0" suffix=" min"></p-inputNumber>
          <small class="text-app-text-tertiary text-[10px] block mt-1 leading-tight">{{ 'catalog.categories.defaultDurationHint' | translate }}</small>
        </div>
        <div>
          <label class="label">{{ 'catalog.categories.tolerance' | translate }}</label>
          <p-inputNumber formControlName="toleranceMinutes" fluid [min]="0" suffix=" min"
                         [placeholder]="tenantTolerancePlaceholder()"></p-inputNumber>
          <small class="text-app-text-tertiary text-[10px] block mt-1 leading-tight">{{ 'catalog.categories.toleranceHint' | translate }}</small>
        </div>

        <div class="flex justify-end gap-2 pt-4 border-t border-app-border">
          <p-button type="button" [label]="'common.close' | translate" [outlined]="true" (onClick)="categoryDialogVisible.set(false)"></p-button>
          <p-button type="submit" [label]="'common.save' | translate" icon="pi pi-check"
                    [loading]="categorySaving()" [disabled]="categoryForm.invalid"></p-button>
        </div>
      </form>
    </p-dialog>

    <app-skill-quick-create [(visible)]="skillQuickCreateVisible" [prefill]="skillQuickCreatePrefill()"
                             (skillCreated)="onSkillCreated($event)"></app-skill-quick-create>

    <!-- Drawer: serviços da categoria -->
    <p-drawer [(visible)]="drawerVisible" position="right" [dismissible]="true" [closeOnEscape]="true"
              styleClass="w-full! sm:w-[30rem]! md:w-[34rem]!" [header]="''">
      <ng-template #header>
        @if (drawerCategory(); as c) {
          <div class="flex items-center gap-2 min-w-0">
            <span class="font-semibold text-app-text truncate">{{ c.name }}</span>
            <app-tag-badge [value]="statusLabel(c.active)" [severity]="statusSeverity(c.active)"></app-tag-badge>
          </div>
        } @else {
          <span class="font-semibold text-app-text">{{ 'catalog.categories.drawerTitle' | translate }}</span>
        }
      </ng-template>

      @if (drawerCategory(); as c) {
        <div class="space-y-5 pb-4">
          <section class="space-y-2">
            <h4 class="text-[11px] font-semibold uppercase tracking-wide text-app-text-tertiary">{{ 'catalog.services.sectionGeneral' | translate }}</h4>
            <dl class="grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
              <div>
                <dt class="text-app-text-tertiary text-xs">{{ 'catalog.categories.displayOrder' | translate }}</dt>
                <dd class="text-app-text">{{ c.displayOrder }}</dd>
              </div>
              @if (laundryFeature.active()) {
                <div>
                  <dt class="text-app-text-tertiary text-xs">{{ 'catalog.services.executionMode' | translate }}</dt>
                  <dd class="text-app-text">{{ ('catalog.services.executionMode' + c.defaultExecutionMode) | translate }}</dd>
                </div>
              }
              <div>
                <dt class="text-app-text-tertiary text-xs">{{ 'catalog.categories.defaultDuration' | translate }}</dt>
                <dd class="text-app-text">{{ c.defaultDurationMinutesPerUnit }} min</dd>
              </div>
              <div>
                <dt class="text-app-text-tertiary text-xs">{{ 'catalog.categories.tolerance' | translate }}</dt>
                <dd class="text-app-text">
                  {{ effectiveTolerance(c) }} min
                  @if (c.toleranceMinutes == null) {
                    <span class="text-app-text-tertiary text-xs">({{ 'catalog.categories.inherited' | translate }})</span>
                  }
                </dd>
              </div>
            </dl>
          </section>

          <section class="space-y-2 border-t border-app-border pt-4">
            <div class="flex items-center justify-between">
              <h4 class="text-[11px] font-semibold uppercase tracking-wide text-app-text-tertiary">
                {{ 'catalog.categories.drawerServicesTitle' | translate }}
              </h4>
              <span class="text-xs text-app-text-tertiary">
                {{ 'catalog.categories.drawerServicesCount' | translate:{ count: drawerServices().length } }}
              </span>
            </div>

            @if (drawerServicesLoading()) {
              <div class="flex flex-col items-center justify-center py-10 text-center text-app-text-tertiary">
                <i class="pi pi-spin pi-spinner text-2xl mb-3" aria-hidden="true"></i>
                <p class="text-sm">{{ 'common.loading' | translate }}</p>
              </div>
            } @else if (drawerServicesError()) {
              <div class="flex flex-col items-center justify-center py-10 text-center">
                <i class="pi pi-exclamation-triangle text-2xl text-app-danger mb-3" aria-hidden="true"></i>
                <p class="text-sm font-medium text-app-text">{{ 'catalog.categories.drawerLoadError' | translate }}</p>
                <p-button [label]="'common.retry' | translate" [text]="true" size="small" class="mt-2"
                          (onClick)="retryLoadDrawerServices()"></p-button>
              </div>
            } @else if (drawerServices().length === 0) {
              <p class="text-sm text-app-text-tertiary py-2">{{ 'catalog.categories.drawerNoServices' | translate }}</p>
            } @else {
              <ul class="space-y-1">
                @for (svc of drawerServices(); track svc.id) {
                  <li class="flex items-center justify-between gap-2 text-sm rounded-md px-2 py-2 -mx-2 hover:bg-app-surface">
                    <div class="min-w-0">
                      <p class="text-app-text font-medium truncate">{{ svc.name }}</p>
                      <p class="text-app-text-tertiary text-xs">
                        {{ ('catalog.services.priceType' + svc.priceType) | translate }}
                        @if (svc.price != null) {
                          · {{ svc.price | currency:(svc.currency ?? undefined):'symbol':'1.2-2' }}
                        }
                      </p>
                    </div>
                    <app-tag-badge [value]="statusLabel(svc.active)" [severity]="statusSeverity(svc.active)"></app-tag-badge>
                  </li>
                }
              </ul>
            }
          </section>

          @if (canWrite()) {
            <section class="space-y-3 border-t border-app-border pt-4">
              <h4 class="text-[11px] font-semibold uppercase tracking-wide text-app-text-tertiary">
                {{ 'catalog.categories.drawerAddServiceTitle' | translate }}
              </h4>
              <form [formGroup]="quickAddForm" (ngSubmit)="addQuickService()" class="space-y-3">
                <div>
                  <label class="label">{{ 'catalog.services.name' | translate }} *</label>
                  <input pInputText formControlName="name" fluid placeholder="Ex: Lavagem de Tapete" />
                  @if (quickAddForm.get('name')?.touched && quickAddForm.get('name')?.hasError('required')) {
                    <small class="text-app-danger text-[10px] mt-1 block">{{ 'errors.required' | translate }}</small>
                  }
                </div>
                <div>
                  <label class="label">{{ 'catalog.services.priceType' | translate }} *</label>
                  <p-select [options]="priceTypeOptions" formControlName="priceType" optionLabel="label" optionValue="value"
                            appendTo="body" fluid [placeholder]="'Selecione o tipo'"></p-select>
                  @if (quickAddForm.get('priceType')?.touched && quickAddForm.get('priceType')?.hasError('required')) {
                    <small class="text-app-danger text-[10px] mt-1 block">{{ 'errors.required' | translate }}</small>
                  }
                </div>
                <div>
                  <label class="label">{{ 'catalog.services.priceLabel' | translate }}</label>
                  <p-inputNumber [ngModel]="quickAddPrice()" (ngModelChange)="quickAddPrice.set($event)" [ngModelOptions]="{standalone: true}"
                                  mode="decimal" [minFractionDigits]="2" [maxFractionDigits]="2" [min]="0" fluid [placeholder]="'0.00'"></p-inputNumber>
                </div>
                <div>
                  <label class="label">{{ 'catalog.services.skillsLabel' | translate }}</label>
                  <p-multiSelect [options]="skillsRows()" [ngModel]="quickAddSkillIds()" (ngModelChange)="quickAddSkillIds.set($event)"
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
                </div>
                <div class="flex justify-end">
                  <p-button type="submit" [label]="'catalog.categories.drawerAddServiceButton' | translate" icon="pi pi-plus"
                            [loading]="quickAddSaving()" [disabled]="quickAddForm.invalid"></p-button>
                </div>
              </form>
              <p class="text-[10px] text-app-text-tertiary leading-tight">{{ 'catalog.services.addHint' | translate }}</p>
            </section>
          }
        </div>
      }

      <ng-template #footer>
        @if (canWrite() && drawerCategory(); as c) {
          <div class="flex justify-end gap-2">
            <p-button [label]="'common.delete' | translate" icon="pi pi-trash" severity="danger" [outlined]="true"
                      [loading]="deletePendingId() === c.id" (onClick)="confirmDeleteCategory(c)"></p-button>
            <p-button [label]="'common.edit' | translate" icon="pi pi-pencil" severity="secondary" [outlined]="true"
                      (onClick)="editFromDrawer(c)"></p-button>
          </div>
        }
      </ng-template>
    </p-drawer>
  `,
  styles: [`
    @reference "../../../../styles.css";
    .label { @apply block text-[11px] font-medium text-app-text-secondary mb-1.5; }
  `],
})
export class CategoriesComponent implements OnInit {
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

  readonly canWrite = computed(() => ['OWNER', 'ADMIN', 'OPERATOR'].includes(this.auth.userRole() ?? ''));
  readonly pageSize = PAGE_SIZE;

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

  categoryRows = signal<ServiceCategory[]>([]);
  categoryTotal = signal(0);
  categoryFirst = signal(0);
  categoryLoading = signal(false);
  categoriesEmpty = computed(() => !this.categoryLoading() && this.categoryTotal() === 0 && !this.hasActiveFilters());
  categoryDialogVisible = signal(false);
  categorySaving = signal(false);
  editingCategoryId = signal<string | null>(null);
  categoryPendingId = signal<string | null>(null);
  deletePendingId = signal<string | null>(null);
  categorySearch = '';
  categorySortField = 'displayOrder';
  categorySortOrder = 1;
  private categoryPage = 0;

  categoryForm = this.fb.group({
    name: ['', Validators.required],
    displayOrder: [0, Validators.required],
    defaultExecutionMode: ['ONSITE' as ExecutionMode, Validators.required],
    // Issue #172. `toleranceMinutes` nulo = herda do tenant; a duração é sempre um número
    // (0 = ainda não medida) porque é só um ponto de partida para serviços novos.
    toleranceMinutes: [null as number | null, Validators.min(0)],
    defaultDurationMinutesPerUnit: [0, [Validators.required, Validators.min(0)]],
  });
  /** Valores com que o dialog de edição abriu — só dispara o fluxo de propagação em massa se o
   *  usuário realmente os mudar (comparado em {@link applyCategoryDefaultsIfNeeded}). */
  private editingCategoryOriginalExecutionMode: ExecutionMode = 'ONSITE';
  private editingCategoryOriginalToleranceMinutes: number | null = null;
  private editingCategoryOriginalDuration = 0;

  drawerVisible = signal(false);
  drawerCategory = signal<ServiceCategory | null>(null);
  drawerServices = signal<CatalogService[]>([]);
  drawerServicesLoading = signal(false);
  drawerServicesError = signal(false);
  quickAddSaving = signal(false);
  quickAddPrice = signal<number | null>(null);
  quickAddSkillIds = signal<string[]>([]);

  quickAddForm = this.fb.group({
    name: ['', Validators.required],
    priceType: [null as PriceType | null, Validators.required],
  });

  tenantCurrency = signal('BRL');
  /** Topo da herança de tolerância (issue #172) — fallback só até o `getMe()` responder,
   *  espelha o default de tenant novo no backend (`Tenant#serviceToleranceMinutes`). */
  tenantToleranceDefault = signal(15);
  skillsRows = signal<Skill[]>([]);
  skillFilterTerm = '';
  skillQuickCreateVisible = signal(false);
  skillQuickCreatePrefill = signal<string | null>(null);

  ngOnInit(): void {
    this.loadCategories();
    this.loadSkills();
    this.tenantService.getMe().subscribe({
      next: t => {
        if (t.currency) this.tenantCurrency.set(t.currency);
        this.tenantToleranceDefault.set(t.systemParameters?.serviceToleranceMinutes ?? 15);
      },
      error: () => {},
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
    this.quickAddSkillIds.update(ids => [...ids, skill.id]);
    this.skillFilterTerm = '';
  }

  onCategoryLazyLoad(event: TableLazyLoadEvent): void {
    this.categoryPage = Math.floor((event.first ?? 0) / (event.rows ?? PAGE_SIZE));
    this.categoryFirst.set(event.first ?? 0);
    if (typeof event.sortField === 'string') {
      this.categorySortField = event.sortField;
      this.categorySortOrder = event.sortOrder === -1 ? -1 : 1;
    }
    this.loadCategories();
  }

  statusLabel(active: boolean): string {
    return this.translate.instant(active ? 'common.active' : 'common.inactive');
  }

  statusSeverity(active: boolean): BadgeSeverity {
    return active ? 'success' : 'secondary';
  }

  hasActiveFilters(): boolean {
    return !!this.categorySearch.trim();
  }

  applyFilters(): void {
    this.categoryPage = 0;
    this.categoryFirst.set(0);
    this.loadCategories();
  }

  clearFilters(): void {
    this.categorySearch = '';
    this.loadCategories();
  }

  loadCategories(): void {
    this.categoryLoading.set(true);
    this.categoryService.list({
      name: this.categorySearch, page: this.categoryPage, size: PAGE_SIZE,
      sort: `${this.categorySortField},${this.categorySortOrder === -1 ? 'desc' : 'asc'}`,
    }).subscribe({
      next: result => {
        this.categoryRows.set(result.content);
        this.categoryTotal.set(result.page.totalElements);
        this.categoryLoading.set(false);
        this.syncDrawerCategory(result.content);
      },
      error: () => {
        this.categoryLoading.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('catalog.categories.loadError') });
      },
    });
  }

  /** Mantém o Drawer aberto sincronizado (nome/ordem/estado) depois de qualquer recarga da tabela. */
  private syncDrawerCategory(rows: ServiceCategory[]): void {
    const current = this.drawerCategory();
    if (!current) return;
    const updated = rows.find(r => r.id === current.id);
    if (updated) this.drawerCategory.set(updated);
  }

  openCreateCategory(): void {
    this.editingCategoryId.set(null);
    this.categoryForm.reset({
      name: '', displayOrder: this.categoryTotal() * 10, defaultExecutionMode: 'ONSITE',
      toleranceMinutes: null, defaultDurationMinutesPerUnit: 0,
    });
    this.editingCategoryOriginalExecutionMode = 'ONSITE';
    this.editingCategoryOriginalToleranceMinutes = null;
    this.editingCategoryOriginalDuration = 0;
    this.categoryDialogVisible.set(true);
  }

  /** Valor efetivamente aplicado quando a categoria não tem override (issue #172) — mostra o
   *  número em vez de só dizer "herda", para não obrigar quem está no serviço a ir conferir a
   *  categoria à parte para saber quanto é. */
  effectiveTolerance(row: ServiceCategory): number {
    return row.toleranceMinutes ?? this.tenantToleranceDefault();
  }

  tenantTolerancePlaceholder(): string {
    return this.translate.instant('catalog.categories.inheritsWithValue', { value: this.tenantToleranceDefault() });
  }

  openEditCategory(row: ServiceCategory): void {
    this.editingCategoryId.set(row.id);
    this.categoryForm.reset({
      name: row.name, displayOrder: row.displayOrder, defaultExecutionMode: row.defaultExecutionMode,
      toleranceMinutes: row.toleranceMinutes, defaultDurationMinutesPerUnit: row.defaultDurationMinutesPerUnit,
    });
    this.editingCategoryOriginalExecutionMode = row.defaultExecutionMode;
    this.editingCategoryOriginalToleranceMinutes = row.toleranceMinutes;
    this.editingCategoryOriginalDuration = row.defaultDurationMinutesPerUnit;
    this.categoryDialogVisible.set(true);
  }

  editFromDrawer(row: ServiceCategory): void {
    this.drawerVisible.set(false);
    this.openEditCategory(row);
  }

  saveCategory(): void {
    this.categoryForm.markAllAsTouched();
    if (this.categoryForm.invalid) return;
    this.categorySaving.set(true);
    const v = this.categoryForm.getRawValue();
    const editingId = this.editingCategoryId();
    if (editingId) {
      this.saveExistingCategory(editingId, v.name!, v.displayOrder!, v.defaultExecutionMode!, false);
    } else {
      this.createCategory(v.name!, v.displayOrder!, v.defaultExecutionMode!, false);
    }
  }

  /** Duração e tolerância da categoria mudaram no formulário? — issue #172. */
  private categoryTimingChanged(): boolean {
    const v = this.categoryForm.getRawValue();
    return v.toleranceMinutes !== this.editingCategoryOriginalToleranceMinutes
      || v.defaultDurationMinutesPerUnit !== this.editingCategoryOriginalDuration;
  }

  private createCategory(name: string, displayOrder: number, executionMode: ExecutionMode, resolveConflict: boolean): void {
    this.categoryService.create({ name, displayOrder, resolveConflict }).pipe(
      // Categoria nasce sempre ONSITE no backend — só um serviço próprio, sem propagação
      // possível (nada foi cadastrado ainda), então não há o que perguntar ao usuário aqui.
      switchMap(created => executionMode !== 'ONSITE'
        ? this.categoryService.changeExecutionMode(created.id, executionMode, false).pipe(map(() => created))
        : of(created)),
      // Duração e tolerância entram sempre na criação: a categoria nasce com 0/herdada no
      // backend, e não há serviços dentro para propagar nada (issue #172).
      switchMap(created => this.categoryService.changeTiming(
        created.id, this.categoryForm.getRawValue().toleranceMinutes ?? null,
        this.categoryForm.getRawValue().defaultDurationMinutesPerUnit ?? 0, false)),
    ).subscribe({
      next: () => this.onCategorySaved(),
      error: (err: HttpErrorResponse) => {
        if (this.handleOrderConflict(err, () => this.createCategory(name, displayOrder, executionMode, true))) return;
        this.onCategorySaveError(err);
      },
    });
  }

  private saveExistingCategory(id: string, name: string, displayOrder: number, executionMode: ExecutionMode, resolveConflict: boolean): void {
    this.categoryService.rename(id, name).pipe(
      switchMap(() => this.categoryService.reorder(id, displayOrder, resolveConflict)),
    ).subscribe({
      next: () => this.applyCategoryDefaultsIfNeeded(id, executionMode),
      error: (err: HttpErrorResponse) => {
        if (this.handleOrderConflict(err, () => this.saveExistingCategory(id, name, displayOrder, executionMode, true))) return;
        this.onCategorySaveError(err);
      },
    });
  }

  /**
   * Nenhum default da categoria mudou: nada a fazer. Mudou: pergunta <b>uma vez</b> se propaga
   * para os serviços já cadastrados antes de aplicar — a exigência explícita do produto (nunca
   * silencioso), com a contagem real em vez de "alguns serviços" genérico.
   *
   * <p>Uma pergunta só, mesmo quando modo de execução e duração/tolerância mudaram juntos:
   * "aplicar aos serviços existentes?" é a mesma decisão para os dois, e dois diálogos seguidos
   * no mesmo save levariam o usuário a carregar em qualquer coisa para se ver livre deles.
   */
  private applyCategoryDefaultsIfNeeded(categoryId: string, executionMode: ExecutionMode): void {
    const executionModeChanged = executionMode !== this.editingCategoryOriginalExecutionMode;
    const timingChanged = this.categoryTimingChanged();
    if (!executionModeChanged && !timingChanged) {
      this.onCategorySaved();
      return;
    }
    this.serviceService.list({ categoryId, size: 1 }).subscribe({
      next: page => {
        const serviceCount = page.page.totalElements;
        if (serviceCount === 0) {
          this.applyCategoryDefaults(categoryId, executionMode, executionModeChanged, timingChanged, false);
          return;
        }
        this.categorySaving.set(false);
        this.confirmationService.confirm({
          message: this.translate.instant('catalog.categories.executionModeApplyMessage', { count: serviceCount }),
          header: this.translate.instant('catalog.categories.executionModeApplyTitle'),
          icon: 'pi pi-sitemap',
          acceptLabel: this.translate.instant('catalog.categories.executionModeApplyAccept'),
          rejectLabel: this.translate.instant('catalog.categories.executionModeApplyReject'),
          acceptButtonProps: { severity: 'info' },
          rejectButtonProps: { severity: 'secondary', outlined: true },
          accept: () => this.applyCategoryDefaults(categoryId, executionMode, executionModeChanged, timingChanged, true),
          reject: () => this.applyCategoryDefaults(categoryId, executionMode, executionModeChanged, timingChanged, false),
        });
      },
      error: (err: HttpErrorResponse) => this.onCategorySaveError(err),
    });
  }

  private applyCategoryDefaults(categoryId: string, executionMode: ExecutionMode, executionModeChanged: boolean,
                                 timingChanged: boolean, applyToServices: boolean): void {
    this.categorySaving.set(true);
    const v = this.categoryForm.getRawValue();
    // Só o total de serviços tocados interessa daqui para a frente — as duas chamadas devolvem
    // formas diferentes e o union delas não é utilizável.
    type Propagation = { updatedServiceCount: number } | null;
    const executionModeCall: Observable<Propagation> = executionModeChanged
      ? this.categoryService.changeExecutionMode(categoryId, executionMode, applyToServices)
      : of(null);
    const timingCall: Observable<Propagation> = timingChanged
      ? this.categoryService.changeTiming(categoryId, v.toleranceMinutes ?? null, v.defaultDurationMinutesPerUnit ?? 0, applyToServices)
      : of(null);

    executionModeCall.pipe(switchMap((): Observable<Propagation> => timingCall)).subscribe({
      next: result => {
        this.onCategorySaved();
        const updated = result?.updatedServiceCount ?? 0;
        if (applyToServices && updated > 0) {
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('catalog.categories.executionModeApplied', { count: updated }),
          });
        }
      },
      error: (err: HttpErrorResponse) => this.onCategorySaveError(err),
    });
  }

  /** @returns true se o erro era um conflito de ordem e já foi tratado (dialog de confirmação aberto). */
  private handleOrderConflict(err: HttpErrorResponse, retry: () => void): boolean {
    const code = (err.error as { errorCode?: string } | null)?.errorCode;
    if (err.status !== 422 || code !== 'SERVICE_CATEGORY_DISPLAY_ORDER_CONFLICT') return false;

    const detail = err.error as { conflictingCategoryName: string; suggestedNextOrder: number };
    this.categorySaving.set(false);
    this.confirmationService.confirm({
      message: this.translate.instant('catalog.categories.orderConflictMessage', {
        name: detail.conflictingCategoryName, suggested: detail.suggestedNextOrder,
      }),
      header: this.translate.instant('catalog.categories.orderConflictTitle'),
      icon: 'pi pi-sort-numeric-up-alt',
      acceptLabel: this.translate.instant('catalog.categories.orderConflictAccept'),
      rejectLabel: this.translate.instant('catalog.categories.orderConflictReject'),
      acceptButtonProps: { severity: 'warn' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => { this.categorySaving.set(true); retry(); },
    });
    return true;
  }

  private onCategorySaved(): void {
    this.categorySaving.set(false);
    this.categoryDialogVisible.set(false);
    this.messageService.add({ severity: 'success', summary: this.translate.instant('catalog.categories.saved') });
    this.loadCategories();
  }

  private onCategorySaveError(err: HttpErrorResponse): void {
    this.categorySaving.set(false);
    this.messageService.add({ severity: 'error', summary: this.businessError(err, 'catalog.categories.errors', 'catalog.categories.saveError') });
  }

  confirmToggleActive(row: ServiceCategory, activate: boolean): void {
    this.confirmationService.confirm({
      message: this.translate.instant(activate ? 'catalog.categories.activated' : 'catalog.categories.confirmDeactivateMessage', { name: row.name }),
      header: this.translate.instant(activate ? 'catalog.categories.activate' : 'catalog.categories.confirmDeactivateTitle'),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.translate.instant(activate ? 'catalog.categories.activate' : 'common.deactivate'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: activate ? 'info' : 'warn' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => this.toggleCategoryActive(row, activate),
    });
  }

  toggleCategoryActive(row: ServiceCategory, activate: boolean): void {
    if (this.categoryPendingId()) return;
    this.categoryPendingId.set(row.id);
    const obs$ = activate ? this.categoryService.activate(row.id) : this.categoryService.deactivate(row.id);
    obs$.subscribe({
      next: () => {
        this.categoryPendingId.set(null);
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant(activate ? 'catalog.categories.activated' : 'catalog.categories.deactivated', { name: row.name }),
        });
        this.loadCategories();
      },
      error: (err: HttpErrorResponse) => {
        this.categoryPendingId.set(null);
        const fallback = activate ? 'catalog.categories.activateError' : 'catalog.categories.deactivateError';
        this.messageService.add({ severity: 'error', summary: this.businessError(err, 'catalog.categories.errors', fallback) });
      },
    });
  }

  confirmDeleteCategory(row: ServiceCategory): void {
    this.confirmationService.confirm({
      message: this.translate.instant('catalog.categories.deleteConfirmMessage', { name: row.name }),
      header: this.translate.instant('catalog.categories.deleteTitle'),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.translate.instant('common.delete'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => this.deleteCategory(row, false),
    });
  }

  private deleteCategory(row: ServiceCategory, deleteServices: boolean): void {
    if (this.deletePendingId()) return;
    this.deletePendingId.set(row.id);
    this.categoryService.delete(row.id, deleteServices).subscribe({
      next: () => {
        this.deletePendingId.set(null);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('catalog.categories.deleted', { name: row.name }) });
        if (this.drawerCategory()?.id === row.id) this.drawerVisible.set(false);
        this.loadCategories();
      },
      error: (err: HttpErrorResponse) => {
        this.deletePendingId.set(null);
        const code = (err.error as { errorCode?: string } | null)?.errorCode;
        if (!deleteServices && err.status === 422 && code === 'SERVICE_CATEGORY_HAS_SERVICES') {
          const count = (err.error as { serviceCount?: number } | null)?.serviceCount ?? 0;
          this.confirmDeleteWithServices(row, count);
          return;
        }
        this.messageService.add({ severity: 'error', summary: this.businessError(err, 'catalog.categories.errors', 'catalog.categories.deleteError') });
      },
    });
  }

  private confirmDeleteWithServices(row: ServiceCategory, serviceCount: number): void {
    this.confirmationService.confirm({
      message: this.translate.instant('catalog.categories.deleteConfirmMessageWithServices', { name: row.name, count: serviceCount }),
      header: this.translate.instant('catalog.categories.deleteTitle'),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.translate.instant('catalog.categories.deleteForceAccept'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => this.deleteCategory(row, true),
    });
  }

  openCategoryDrawer(row: ServiceCategory): void {
    this.drawerCategory.set(row);
    this.drawerVisible.set(true);
    this.quickAddForm.reset({ name: '', priceType: null });
    this.quickAddPrice.set(null);
    this.quickAddSkillIds.set([]);
    this.loadDrawerServices(row.id);
  }

  retryLoadDrawerServices(): void {
    const category = this.drawerCategory();
    if (category) this.loadDrawerServices(category.id);
  }

  private loadDrawerServices(categoryId: string): void {
    this.drawerServicesLoading.set(true);
    this.drawerServicesError.set(false);
    this.serviceService.list({ categoryId, page: 0, size: 100, sort: 'name,asc' }).subscribe({
      next: result => {
        this.drawerServices.set(result.content);
        this.drawerServicesLoading.set(false);
      },
      error: () => {
        this.drawerServicesLoading.set(false);
        this.drawerServicesError.set(true);
      },
    });
  }

  addQuickService(): void {
    this.quickAddForm.markAllAsTouched();
    if (this.quickAddForm.invalid) return;
    const category = this.drawerCategory();
    if (!category) return;
    this.quickAddSaving.set(true);
    const v = this.quickAddForm.value;
    const price = this.quickAddPrice();
    const skillIds = this.quickAddSkillIds();
    this.serviceService.create({ categoryId: category.id, name: v.name!, priceType: v.priceType! }).pipe(
      switchMap(created => {
        const skills$: Observable<unknown> = skillIds.length > 0
          ? forkJoin(skillIds.map(sid => this.serviceService.assignSkill(created.id, sid)))
          : of(null);
        return skills$.pipe(
          switchMap((): Observable<unknown> => (price != null && price > 0)
            ? this.serviceService.changePrice(created.id, price, this.tenantCurrency())
            : of(null)),
          switchMap((): Observable<unknown> => (price != null && price > 0 && skillIds.length > 0)
            ? this.serviceService.activate(created.id)
            : of(null)),
        );
      }),
    ).subscribe({
      next: () => {
        this.quickAddSaving.set(false);
        this.quickAddForm.reset({ name: '', priceType: null });
        this.quickAddPrice.set(null);
        this.quickAddSkillIds.set([]);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('catalog.services.saved') });
        this.loadDrawerServices(category.id);
      },
      error: (err: HttpErrorResponse) => {
        this.quickAddSaving.set(false);
        this.messageService.add({ severity: 'error', summary: this.businessError(err, 'catalog.services.errors', 'catalog.services.saveError') });
      },
    });
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
