import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { DialogModule } from 'primeng/dialog';
import { DrawerModule } from 'primeng/drawer';
import { TooltipModule } from 'primeng/tooltip';
import { Panel } from 'primeng/panel';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { HttpErrorResponse } from '@angular/common/http';
import { SkillService, Skill, CatalogService } from '../../../core/services/catalog.service';
import { ProviderService, Provider } from '../../../core/services/provider.service';
import { TenantUserService } from '../../../core/services/tenant-user.service';
import { AuthService } from '../../../core/auth/auth.service';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { TagBadgeComponent } from '../../../shared/components/tag-badge/tag-badge.component';
import { TableStandardDirective } from '../../../shared/directives/table-standard.directive';

@Component({
  selector: 'app-skills',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule, TranslatePipe, TableModule, ButtonModule,
    InputTextModule, DialogModule, DrawerModule, TooltipModule, ConfirmDialogModule, ToastModule,
    PageHeaderComponent, EmptyStateComponent, TagBadgeComponent, Panel, TableStandardDirective,
  ],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast position="top-right"></p-toast>
    <p-confirmDialog [style]="{ width: '26rem' }"></p-confirmDialog>

    <app-page-header [title]="'catalog.skills.title' | translate" [description]="'catalog.skills.subtitle' | translate">
      @if (canWrite() && !skillsEmpty()) {
        <p-button [label]="'catalog.skills.add' | translate" icon="pi pi-plus" size="small" (onClick)="openCreateSkill()"></p-button>
      }
    </app-page-header>

    @if (skillsEmpty()) {
      <app-empty-state icon="pi pi-sparkles"
                       [message]="'catalog.skills.emptyTitle' | translate"
                       [subtitle]="'catalog.skills.emptySubtitle' | translate"></app-empty-state>
      @if (canWrite()) {
        <div class="flex justify-center -mt-3">
          <p-button icon="pi pi-plus" [label]="'catalog.skills.add' | translate" (onClick)="openCreateSkill()"></p-button>
        </div>
      }
    } @else {
    <div class="mt-3">
    <p-panel>
      <div class="space-y-4 min-w-0">
        <div class="flex flex-wrap items-end gap-3">
          <div class="flex-1 min-w-56">
            <label class="label">{{ 'common.search' | translate }}</label>
            <input pInputText fluid [(ngModel)]="skillSearch"
                   [placeholder]="'catalog.skills.searchPlaceholder' | translate"
                   autocomplete="off"
                   (ngModelChange)="applyFilters()" />
          </div>
          @if (hasActiveFilters()) {
            <p-button [label]="'common.clearFilters' | translate" icon="pi pi-filter-slash" [text]="true" size="small"
                      (onClick)="clearFilters()"></p-button>
          }
        </div>

        <p-table appTableStandard [value]="filteredSkills()" dataKey="id" styleClass="p-datatable-sm"
                 [rows]="pageSize" [sortField]="'name'" [sortOrder]="1">
          <ng-template pTemplate="header">
            <tr>
              <th pSortableColumn="name">{{ 'catalog.skills.name' | translate }} <p-sortIcon field="name"></p-sortIcon></th>
              <th class="w-32">{{ 'common.status' | translate }}</th>
              <th class="text-right w-32">{{ 'common.actions' | translate }}</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-row>
            <tr class="group cursor-pointer hover:bg-app-surface/50" (click)="openSkillDrawer(row)">
              <td class="font-medium text-app-text">{{ row.name }}</td>
              <td>
                <app-tag-badge [value]="(row.active ? 'common.active' : 'common.inactive') | translate"
                               [severity]="row.active ? 'success' : 'secondary'"></app-tag-badge>
              </td>
              <td class="text-right whitespace-nowrap" (click)="$event.stopPropagation()">
                @if (canWrite()) {
                  <div class="flex justify-end gap-1">
                    <p-button icon="pi pi-pencil" [text]="true" size="small" severity="secondary"
                              [pTooltip]="'common.edit' | translate" tooltipPosition="top"
                              [disabled]="skillPendingId() === row.id" (onClick)="openEditSkill(row)"></p-button>
                    @if (row.active) {
                      <p-button icon="pi pi-times-circle" [text]="true" size="small" severity="warn"
                                [pTooltip]="'catalog.skills.deactivate' | translate" tooltipPosition="top"
                                [loading]="skillPendingId() === row.id" (onClick)="confirmToggleActive(row, false)"></p-button>
                    } @else {
                      <p-button icon="pi pi-check-circle" [text]="true" size="small" severity="info"
                                [pTooltip]="'catalog.skills.activate' | translate" tooltipPosition="top"
                                [loading]="skillPendingId() === row.id" (onClick)="toggleActive(row, true)"></p-button>
                    }
                    <p-button icon="pi pi-trash" [text]="true" size="small" severity="danger"
                              [pTooltip]="'common.delete' | translate" tooltipPosition="top"
                              [loading]="deletePendingId() === row.id" (onClick)="confirmDeleteSkill(row)"></p-button>
                  </div>
                }
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="3" class="text-center text-app-text-tertiary py-16">
                <i class="pi pi-search text-3xl mb-3 block opacity-50"></i>
                <p class="text-sm font-medium text-app-text">{{ 'catalog.skills.noMatchTitle' | translate }}</p>
                <p class="text-xs text-app-text-secondary mb-4">{{ 'catalog.skills.noMatchSubtitle' | translate }}</p>
                <p-button [label]="'common.clearFilters' | translate" [text]="true" size="small"
                          (onClick)="clearFilters()"></p-button>
              </td>
            </tr>
          </ng-template>
        </p-table>

        <p class="text-[10px] text-app-text-tertiary pt-2 border-t border-app-border leading-tight">
          {{ 'catalog.skills.footerNote' | translate }}
        </p>
      </div>
    </p-panel>
    </div>
    }

    <!-- Dialog: criar/editar habilidade -->
    <p-dialog [(visible)]="skillDialogVisible" [modal]="true" [style]="{ width: '28rem', maxWidth: '95vw' }"
              [header]="(editingSkillId() ? 'catalog.skills.editTitle' : 'catalog.skills.addTitle') | translate">

      <p class="mb-4 text-xs text-app-text-tertiary">{{ 'catalog.skills.addHint' | translate }}</p>

      <form [formGroup]="skillForm" (ngSubmit)="saveSkill()" class="space-y-4">
        <div>
          <label class="label">{{ 'catalog.skills.name' | translate }} *</label>
          <input pInputText formControlName="name" fluid [placeholder]="'catalog.skills.namePlaceholder' | translate" autocomplete="off" />
          @if (skillForm.get('name')?.touched && skillForm.get('name')?.hasError('required')) {
            <small class="text-app-danger text-[10px] mt-1 block">{{ 'errors.required' | translate }}</small>
          }
        </div>

        <div class="flex justify-end gap-2 pt-4 border-t border-app-border">
          <p-button type="button" [label]="'common.close' | translate" [outlined]="true" (onClick)="skillDialogVisible.set(false)"></p-button>
          <p-button type="submit" [label]="'common.save' | translate" icon="pi pi-check"
                    [loading]="skillSaving()" [disabled]="skillForm.invalid"></p-button>
        </div>
      </form>
    </p-dialog>

    <!-- Drawer: serviços e prestadores associados -->
    <p-drawer [(visible)]="drawerVisible" position="right" [dismissible]="true" [closeOnEscape]="true"
              styleClass="w-full! sm:w-[30rem]! md:w-[34rem]!" [header]="''">
      <ng-template #header>
        @if (drawerSkill(); as s) {
          <div class="flex items-center gap-2 min-w-0">
            <span class="font-semibold text-app-text truncate">{{ s.name }}</span>
            <app-tag-badge [value]="(s.active ? 'common.active' : 'common.inactive') | translate"
                           [severity]="s.active ? 'success' : 'secondary'"></app-tag-badge>
          </div>
        } @else {
          <span class="font-semibold text-app-text">{{ 'catalog.skills.drawerTitle' | translate }}</span>
        }
      </ng-template>

      @if (drawerSkill(); as s) {
        <div class="space-y-5 pb-4">
          <section class="space-y-2">
            <div class="flex items-center justify-between">
              <h4 class="text-[11px] font-semibold uppercase tracking-wide text-app-text-tertiary">
                {{ 'catalog.skills.sectionServices' | translate }}
              </h4>
              @if (!drawerServicesLoading() && !drawerServicesError()) {
                <span class="text-xs text-app-text-tertiary">
                  {{ 'catalog.skills.drawerServicesCount' | translate:{ count: drawerServices().length } }}
                </span>
              }
            </div>

            @if (drawerServicesLoading()) {
              <div class="flex flex-col items-center justify-center py-8 text-center text-app-text-tertiary">
                <i class="pi pi-spin pi-spinner text-2xl mb-3" aria-hidden="true"></i>
                <p class="text-sm">{{ 'common.loading' | translate }}</p>
              </div>
            } @else if (drawerServicesError()) {
              <div class="flex flex-col items-center justify-center py-8 text-center">
                <i class="pi pi-exclamation-triangle text-2xl text-app-danger mb-3" aria-hidden="true"></i>
                <p class="text-sm font-medium text-app-text">{{ 'catalog.skills.drawerServicesLoadError' | translate }}</p>
                <p-button [label]="'common.retry' | translate" [text]="true" size="small" class="mt-2"
                          (onClick)="retryLoadDrawerServices()"></p-button>
              </div>
            } @else if (drawerServices().length === 0) {
              <p class="text-sm text-app-text-tertiary py-2">{{ 'catalog.skills.drawerNoServices' | translate }}</p>
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
                    <app-tag-badge [value]="(svc.active ? 'common.active' : 'common.inactive') | translate"
                                   [severity]="svc.active ? 'success' : 'secondary'"></app-tag-badge>
                  </li>
                }
              </ul>
            }
          </section>

          <section class="space-y-2 border-t border-app-border pt-4">
            <div class="flex items-center justify-between">
              <h4 class="text-[11px] font-semibold uppercase tracking-wide text-app-text-tertiary">
                {{ 'catalog.skills.sectionProviders' | translate }}
              </h4>
              @if (!drawerProvidersLoading() && !drawerProvidersError()) {
                <span class="text-xs text-app-text-tertiary">
                  {{ 'catalog.skills.drawerProvidersCount' | translate:{ count: drawerProviders().length } }}
                </span>
              }
            </div>

            @if (drawerProvidersLoading()) {
              <div class="flex flex-col items-center justify-center py-8 text-center text-app-text-tertiary">
                <i class="pi pi-spin pi-spinner text-2xl mb-3" aria-hidden="true"></i>
                <p class="text-sm">{{ 'common.loading' | translate }}</p>
              </div>
            } @else if (drawerProvidersError()) {
              <div class="flex flex-col items-center justify-center py-8 text-center">
                <i class="pi pi-exclamation-triangle text-2xl text-app-danger mb-3" aria-hidden="true"></i>
                <p class="text-sm font-medium text-app-text">{{ 'catalog.skills.drawerProvidersLoadError' | translate }}</p>
                <p-button [label]="'common.retry' | translate" [text]="true" size="small" class="mt-2"
                          (onClick)="retryLoadDrawerProviders()"></p-button>
              </div>
            } @else if (drawerProviders().length === 0) {
              <p class="text-sm text-app-text-tertiary py-2">{{ 'catalog.skills.drawerNoProviders' | translate }}</p>
            } @else {
              <ul class="space-y-1">
                @for (p of drawerProviders(); track p.id) {
                  <li class="flex items-center justify-between gap-2 text-sm rounded-md px-2 py-2 -mx-2 hover:bg-app-surface">
                    <div class="min-w-0">
                      <p class="text-app-text font-medium truncate">{{ providerDisplayName(p) }}</p>
                    </div>
                    <app-tag-badge [value]="(p.active ? 'common.active' : 'common.inactive') | translate"
                                   [severity]="p.active ? 'success' : 'secondary'"></app-tag-badge>
                  </li>
                }
              </ul>
            }
          </section>
        </div>
      }

      <ng-template #footer>
        @if (canWrite() && drawerSkill(); as s) {
          <div class="flex justify-end gap-2">
            <p-button [label]="'common.delete' | translate" icon="pi pi-trash" severity="danger" [outlined]="true"
                      [loading]="deletePendingId() === s.id" (onClick)="confirmDeleteSkill(s)"></p-button>
            @if (s.active) {
              <p-button [label]="'catalog.skills.deactivate' | translate" icon="pi pi-times-circle" severity="warn" [outlined]="true"
                        [loading]="skillPendingId() === s.id" (onClick)="confirmToggleActive(s, false)"></p-button>
            } @else {
              <p-button [label]="'catalog.skills.activate' | translate" icon="pi pi-check-circle" severity="info"
                        [loading]="skillPendingId() === s.id" (onClick)="toggleActive(s, true)"></p-button>
            }
            <p-button [label]="'common.edit' | translate" icon="pi pi-pencil" (onClick)="editFromDrawer(s)"></p-button>
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
export class SkillsComponent implements OnInit {
  private fb = inject(FormBuilder);
  private skillService = inject(SkillService);
  private providerService = inject(ProviderService);
  private tenantUserService = inject(TenantUserService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);
  private translate = inject(TranslateService);
  private auth = inject(AuthService);

  readonly canWrite = computed(() => ['OWNER', 'ADMIN', 'OPERATOR'].includes(this.auth.userRole() ?? ''));
  readonly pageSize = 20;

  skillsRows = signal<Skill[]>([]);
  skillsLoading = signal(false);
  skillsError = signal(false);
  skillsEmpty = computed(() => !this.skillsLoading() && this.skillsRows().length === 0 && !this.hasActiveFilters());
  skillSearch = '';
  skillPendingId = signal<string | null>(null);
  deletePendingId = signal<string | null>(null);

  filteredSkills = computed<Skill[]>(() => {
    const q = this.skillSearch.trim().toLowerCase();
    if (!q) return this.skillsRows();
    return this.skillsRows().filter(s => s.name.toLowerCase().includes(q));
  });

  skillDialogVisible = signal(false);
  skillSaving = signal(false);
  editingSkillId = signal<string | null>(null);

  skillForm = this.fb.group({
    name: ['', Validators.required],
  });

  drawerVisible = signal(false);
  drawerSkill = signal<Skill | null>(null);
  drawerServices = signal<CatalogService[]>([]);
  drawerServicesLoading = signal(false);
  drawerServicesError = signal(false);
  drawerProviders = signal<Provider[]>([]);
  drawerProvidersLoading = signal(false);
  drawerProvidersError = signal(false);

  private userNames = new Map<string, string>();

  ngOnInit(): void {
    this.loadSkills();
    this.tenantUserService.directory().subscribe({
      next: users => users.forEach(u => this.userNames.set(u.id, u.name)),
      error: () => {},
    });
  }

  hasActiveFilters(): boolean {
    return !!this.skillSearch.trim();
  }

  applyFilters(): void {
    // filtro é local (computed) — sem chamada ao backend, mesma lógica de antes
  }

  clearFilters(): void {
    this.skillSearch = '';
  }

  loadSkills(): void {
    this.skillsLoading.set(true);
    this.skillsError.set(false);
    this.skillService.list().subscribe({
      next: skills => {
        this.skillsRows.set([...skills].sort((a, b) => a.name.localeCompare(b.name)));
        this.skillsLoading.set(false);
        this.syncDrawerSkill(skills);
      },
      error: () => {
        this.skillsLoading.set(false);
        this.skillsError.set(true);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('catalog.skills.loadError') });
      },
    });
  }

  /** Mantém o Drawer aberto sincronizado (nome/estado) depois de qualquer recarga da tabela. */
  private syncDrawerSkill(rows: Skill[]): void {
    const current = this.drawerSkill();
    if (!current) return;
    const updated = rows.find(r => r.id === current.id);
    if (updated) this.drawerSkill.set(updated);
  }

  providerDisplayName(p: Provider): string {
    return this.userNames.get(p.userId) || this.translate.instant('providers.technician');
  }

  openCreateSkill(): void {
    this.editingSkillId.set(null);
    this.skillForm.reset({ name: '' });
    this.skillDialogVisible.set(true);
  }

  openEditSkill(row: Skill): void {
    this.editingSkillId.set(row.id);
    this.skillForm.reset({ name: row.name });
    this.skillDialogVisible.set(true);
  }

  editFromDrawer(row: Skill): void {
    this.drawerVisible.set(false);
    this.openEditSkill(row);
  }

  saveSkill(): void {
    this.skillForm.markAllAsTouched();
    if (this.skillForm.invalid) return;
    this.skillSaving.set(true);
    const name = this.skillForm.value.name!.trim();
    const editingId = this.editingSkillId();
    const obs$ = editingId ? this.skillService.rename(editingId, name) : this.skillService.create(name);
    obs$.subscribe({
      next: () => {
        this.skillSaving.set(false);
        this.skillDialogVisible.set(false);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('catalog.skills.saved') });
        this.loadSkills();
      },
      error: (err: HttpErrorResponse) => {
        this.skillSaving.set(false);
        this.messageService.add({ severity: 'error', summary: this.businessError(err, 'catalog.skills.errors', 'catalog.skills.saveError') });
      },
    });
  }

  confirmToggleActive(row: Skill, activate: boolean): void {
    if (activate) {
      this.toggleActive(row, true);
      return;
    }
    this.confirmationService.confirm({
      message: this.translate.instant('catalog.skills.confirmDeactivateMessage', { name: row.name }),
      header: this.translate.instant('catalog.skills.deactivate'),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.translate.instant('catalog.skills.deactivate'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'warn' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => this.toggleActive(row, false),
    });
  }

  toggleActive(row: Skill, activate: boolean): void {
    if (this.skillPendingId()) return;
    this.skillPendingId.set(row.id);
    const obs$ = activate ? this.skillService.activate(row.id) : this.skillService.deactivate(row.id);
    obs$.subscribe({
      next: () => {
        this.skillPendingId.set(null);
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant(activate ? 'catalog.skills.activated' : 'catalog.skills.deactivated', { name: row.name }),
        });
        this.loadSkills();
      },
      error: (err: HttpErrorResponse) => {
        this.skillPendingId.set(null);
        const fallback = activate ? 'catalog.skills.activateError' : 'catalog.skills.deactivateError';
        this.messageService.add({ severity: 'error', summary: this.businessError(err, 'catalog.skills.errors', fallback) });
      },
    });
  }

  confirmDeleteSkill(row: Skill): void {
    this.confirmationService.confirm({
      message: this.translate.instant('catalog.skills.removeConfirm', { name: row.name }),
      header: this.translate.instant('catalog.skills.deleteTitle'),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.translate.instant('common.delete'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => this.deleteSkill(row, false),
    });
  }

  private deleteSkill(row: Skill, force: boolean): void {
    if (this.deletePendingId()) return;
    this.deletePendingId.set(row.id);
    this.skillService.delete(row.id, force).subscribe({
      next: () => {
        this.deletePendingId.set(null);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('catalog.skills.removeSuccess') });
        if (this.drawerSkill()?.id === row.id) this.drawerVisible.set(false);
        this.loadSkills();
      },
      error: (err: HttpErrorResponse) => {
        this.deletePendingId.set(null);
        const code = (err.error as { errorCode?: string } | null)?.errorCode;
        if (!force && err.status === 422 && code === 'SKILL_IN_USE_BY_SERVICES') {
          this.confirmForceDeleteSkill(row);
          return;
        }
        this.messageService.add({ severity: 'error', summary: this.businessError(err, 'catalog.skills.errors', 'catalog.skills.removeError') });
      },
    });
  }

  private confirmForceDeleteSkill(row: Skill): void {
    this.confirmationService.confirm({
      message: this.translate.instant('catalog.skills.removeForceConfirm', { name: row.name }),
      header: this.translate.instant('catalog.skills.deleteTitle'),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.translate.instant('catalog.skills.removeForceAccept'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => this.deleteSkill(row, true),
    });
  }

  openSkillDrawer(row: Skill): void {
    this.drawerSkill.set(row);
    this.drawerVisible.set(true);
    this.loadDrawerServices(row.id);
    this.loadDrawerProviders(row.id);
  }

  retryLoadDrawerServices(): void {
    const skill = this.drawerSkill();
    if (skill) this.loadDrawerServices(skill.id);
  }

  retryLoadDrawerProviders(): void {
    const skill = this.drawerSkill();
    if (skill) this.loadDrawerProviders(skill.id);
  }

  private loadDrawerServices(skillId: string): void {
    this.drawerServicesLoading.set(true);
    this.drawerServicesError.set(false);
    this.skillService.listServices(skillId).subscribe({
      next: services => {
        this.drawerServices.set(services);
        this.drawerServicesLoading.set(false);
      },
      error: () => {
        this.drawerServicesLoading.set(false);
        this.drawerServicesError.set(true);
      },
    });
  }

  private loadDrawerProviders(skillId: string): void {
    this.drawerProvidersLoading.set(true);
    this.drawerProvidersError.set(false);
    this.providerService.list({ skillId, page: 0, size: 200, sort: 'createdAt,desc' }).subscribe({
      next: result => {
        this.drawerProviders.set(result.content);
        this.drawerProvidersLoading.set(false);
      },
      error: () => {
        this.drawerProvidersLoading.set(false);
        this.drawerProvidersError.set(true);
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
