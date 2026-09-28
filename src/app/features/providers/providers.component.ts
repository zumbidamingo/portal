import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { DrawerModule } from 'primeng/drawer';
import { TooltipModule } from 'primeng/tooltip';
import { TabsModule } from 'primeng/tabs';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { Panel } from 'primeng/panel';
import { ConfirmationService, MessageService } from 'primeng/api';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, Subject, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, switchMap, tap } from 'rxjs/operators';
import { ProviderService, Provider, ProviderColor, ProviderColorOption, ProviderPage, CreateTechnicianResult, PROVIDER_COLOR_HEX } from '../../core/services/provider.service';
import { SkillService, Skill } from '../../core/services/catalog.service';
import { TenantUserService } from '../../core/services/tenant-user.service';
import { TenantService } from '../../core/services/tenant.service';
import { AuthService } from '../../core/auth/auth.service';
import { maskPersonalTaxIdInput, personalTaxIdValidator } from '../../shared/utils/tax-id.validator';
import { TagBadgeComponent } from '../../shared/components/tag-badge/tag-badge.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { ProviderSkillsTabComponent } from './tabs/provider-skills-tab.component';
import { ProviderAvailabilityTabComponent } from './tabs/provider-availability-tab.component';
import { ProviderCapacityTabComponent } from './tabs/provider-capacity-tab.component';
import { ProviderRouteTabComponent } from './tabs/provider-route-tab.component';
import { ProviderColorTabComponent } from './tabs/provider-color-tab.component';
import { ProviderColorPickerComponent } from './provider-color-picker.component';
import { TableStandardDirective } from '../../shared/directives/table-standard.directive';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-providers',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TranslatePipe, TableModule, ButtonModule,
    InputTextModule, SelectModule, DatePickerModule, DialogModule, DrawerModule, TooltipModule, TabsModule, ToastModule,
    ConfirmDialogModule, Panel, TagBadgeComponent, PageHeaderComponent, EmptyStateComponent,
    ProviderSkillsTabComponent, ProviderAvailabilityTabComponent, ProviderCapacityTabComponent,
    ProviderRouteTabComponent, ProviderColorTabComponent, ProviderColorPickerComponent, TableStandardDirective],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast position="top-right"></p-toast>
    <p-confirmDialog></p-confirmDialog>

    <app-page-header [title]="'providers.title' | translate" [description]="'providers.subtitle' | translate">
      @if (canWrite() && !providersEmpty()) {
        <p-button [label]="'providers.newTechnician' | translate" icon="pi pi-plus" (onClick)="openCreateTechnician()" size="small"></p-button>
      }
    </app-page-header>

    @if (providersEmpty()) {
      <app-empty-state icon="pi pi-users" [message]="'providers.empty' | translate"
                        [subtitle]="'providers.emptySubtitle' | translate">
      </app-empty-state>
      @if (canWrite()) {
        <div class="flex flex-wrap justify-center gap-2 -mt-3">
          <p-button icon="pi pi-plus" [label]="'providers.newTechnician' | translate" (onClick)="openCreateTechnician()"></p-button>
        </div>
      }
    } @else {
    <p-panel>
      <div class="space-y-4 min-w-0">
        <div class="flex flex-wrap items-end gap-3">
          <div class="flex-1 min-w-56">
            <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'common.search' | translate }}</label>
            <input pInputText fluid [(ngModel)]="search" [placeholder]="'providers.searchPlaceholder' | translate"
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
              <th>{{ 'providers.name' | translate }}</th>
              <th>{{ 'providers.skills' | translate }}</th>
              <th>{{ 'providers.capacity' | translate }}</th>
              <th>{{ 'common.status' | translate }}</th>
              <th class="text-right w-20">{{ 'common.actions' | translate }}</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-row>
            <tr class="group">
              <td class="font-medium text-app-text">{{ displayName(row) }}</td>
              <td>
                @if (row.skillIds.length === 0) {
                  <span class="text-app-text-tertiary">{{ 'providers.noSkills' | translate }}</span>
                } @else {
                  <span class="text-sm">{{ skillNames(row) }}</span>
                }
              </td>
              <td class="text-sm">
                @if (row.maxOrdersPerDay == null && row.maxMinutesPerDay == null && row.maxVolumePerDay == null) {
                  <span class="text-app-text-tertiary">{{ 'providers.capacityUnlimited' | translate }}</span>
                } @else {
                  <span>{{ capacitySummary(row) }}</span>
                }
              </td>
              <td>
                <div class="flex items-center gap-1.5 flex-wrap">
                  <app-tag-badge [value]="(row.active ? 'common.active' : 'common.inactive') | translate"
                                [severity]="row.active ? 'success' : 'secondary'"></app-tag-badge>
                  @if (isIncomplete(row)) {
                    <app-tag-badge [value]="'providers.incomplete' | translate" severity="warn"
                                  [pTooltip]="'providers.incompleteTooltip' | translate" tooltipPosition="top"></app-tag-badge>
                  }
                </div>
              </td>
              <td class="text-right whitespace-nowrap">
                @if (canWrite()) {
                  <span>
                    @if (canEditProfile()) {
                      <p-button icon="pi pi-pencil" [text]="true" size="small" severity="secondary"
                                [pTooltip]="'providers.editProfileTooltip' | translate" tooltipPosition="top"
                                (onClick)="openEditProfile(row)"></p-button>
                    }
                    <p-button icon="pi pi-cog" [text]="true" size="small" severity="secondary"
                              [pTooltip]="'providers.manageTooltip' | translate" tooltipPosition="top"
                              (onClick)="openManage(row)"></p-button>
                    @if (row.active) {
                      <p-button icon="pi pi-times-circle" [text]="true" size="small" severity="warn"
                                [pTooltip]="'providers.deactivate' | translate" tooltipPosition="top"
                                [loading]="pendingId() === row.id" (onClick)="confirmDeactivate(row)"></p-button>
                    } @else {
                      <p-button icon="pi pi-check-circle" [text]="true" size="small" severity="info"
                                [pTooltip]="'providers.activate' | translate" tooltipPosition="top"
                                [loading]="pendingId() === row.id" (onClick)="toggleActive(row, true)"></p-button>
                    }
                  </span>
                }
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="5" class="text-center text-app-text-tertiary py-10">
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

    <!-- Dialog: novo técnico — só o nome é obrigatório (velocidade de cadastro); o resto fica
         num bloco "opcional" visualmente separado, configurável agora ou depois pelo Gerir. -->
    <p-dialog [(visible)]="createVisible" [modal]="true" [style]="{ width: '28rem' }"
              [header]="'providers.newTechnicianTitle' | translate" (onShow)="focusCreateName()">
      <div [formGroup]="technicianForm">
        <p class="text-xs text-app-text-tertiary mb-4">{{ 'providers.newTechnicianSubtitle' | translate }}</p>

        <div>
          <label class="label">{{ 'providers.fullName' | translate }} *</label>
          <input pInputText formControlName="fullName" fluid autocomplete="off" #createNameInput
                (keydown.enter)="saveTechnician()" />
        </div>

        <div class="mt-4">
          <label class="label">{{ 'providers.document' | translate }} *</label>
          <input pInputText formControlName="document" fluid autocomplete="off" inputmode="numeric"
                placeholder="000.000.000-00" (input)="maskDocument(technicianForm.controls.document)"
                (keydown.enter)="saveTechnician()" />
          @if (technicianForm.controls.document.invalid && technicianForm.controls.document.dirty) {
            <p class="text-xs text-app-danger mt-1">{{ 'providers.documentInvalid' | translate }}</p>
          } @else {
            <p class="text-xs text-app-text-tertiary mt-1">{{ 'providers.documentHint' | translate }}</p>
          }
        </div>

        <div class="mt-5 pt-4 border-t border-app-border-subtle space-y-4">
          <p class="text-[11px] font-medium text-app-text-tertiary uppercase tracking-wide">{{ 'providers.optionalSectionLabel' | translate }}</p>

          <div>
            <label class="label">{{ 'providers.startDate' | translate }}</label>
            <p-datepicker formControlName="startDate" dateFormat="dd/mm/yy" appendTo="body" fluid [showIcon]="true"></p-datepicker>
          </div>
          <div>
            <label class="label">{{ 'providers.contactEmail' | translate }}</label>
            <input pInputText formControlName="contactEmail" fluid type="email" autocomplete="off" />
            @if (technicianForm.controls.contactEmail.invalid && technicianForm.controls.contactEmail.dirty) {
              <p class="text-xs text-app-danger mt-1">{{ 'errors.invalidEmail' | translate }}</p>
            } @else {
              <p class="text-xs text-app-text-tertiary mt-1">{{ 'providers.contactEmailHint' | translate }}</p>
            }
          </div>
          <div>
            <label class="label">{{ 'providers.color.label' | translate }}</label>
            @if (colorPickerExpanded()) {
              <app-provider-color-picker [options]="createColorOptions()" [selected]="technicianForm.controls.color.value"
                                          (colorSelected)="pickCreateColor($event)" />
            } @else {
              <div class="flex items-center gap-2.5">
                <span class="w-6 h-6 rounded-full shrink-0 border border-app-border" [style.background]="createColorHex()"></span>
                <span class="text-xs text-app-text-tertiary flex-1">
                  {{ (colorManuallyChosen() ? 'providers.color.manuallyChosen' : 'providers.color.autoAssigned') | translate }}
                </span>
                <p-button [label]="'providers.color.change' | translate" [text]="true" size="small"
                          (onClick)="colorPickerExpanded.set(true)"></p-button>
              </div>
            }
          </div>
        </div>

        <div class="flex justify-end gap-2 mt-5">
          <p-button type="button" [label]="'common.close' | translate" [outlined]="true" (onClick)="createVisible.set(false)"></p-button>
          <p-button [label]="'providers.createSubmit' | translate" icon="pi pi-check" [loading]="creatingTechnician()"
                    [disabled]="technicianForm.invalid" (onClick)="saveTechnician()"></p-button>
        </div>
      </div>
    </p-dialog>

    <!-- Dialog: editar nome/email (login) do prestador — só identidade; skills, disponibilidade,
         capacidade, rota e cor ficam no Gerir (ícone de engrenagem), nunca aqui. -->
    <p-dialog [(visible)]="editVisible" [modal]="true" [style]="{ width: '26rem' }"
              [header]="'providers.editProfileTitle' | translate" (onShow)="focusEditName()">
      <div class="space-y-4" [formGroup]="editForm">
        <div>
          <label class="label">{{ 'providers.fullName' | translate }} *</label>
          <input pInputText formControlName="fullName" fluid autocomplete="off" #editNameInput
                (keydown.enter)="saveEditProfile()" />
        </div>
        <div>
          <label class="label">{{ 'providers.editProfileEmail' | translate }} *</label>
          <input pInputText formControlName="email" fluid type="email" autocomplete="off"
                (keydown.enter)="saveEditProfile()" />
          @if (editForm.controls.email.invalid && editForm.controls.email.dirty) {
            <p class="text-xs text-app-danger mt-1">{{ 'errors.invalidEmail' | translate }}</p>
          } @else {
            <p class="text-xs text-app-text-tertiary mt-1">{{ 'providers.editProfileEmailHint' | translate }}</p>
          }
        </div>
        <div>
          <label class="label">{{ 'providers.document' | translate }}</label>
          <input pInputText formControlName="document" fluid autocomplete="off" inputmode="numeric"
                placeholder="000.000.000-00" (input)="maskDocument(editForm.controls.document)"
                (keydown.enter)="saveEditProfile()" />
          @if (editForm.controls.document.invalid && editForm.controls.document.dirty) {
            <p class="text-xs text-app-danger mt-1">{{ 'providers.documentInvalid' | translate }}</p>
          } @else if (editingDocumentLast4()) {
            <p class="text-xs text-app-text-tertiary mt-1">{{ 'providers.documentRegistered' | translate: { last4: editingDocumentLast4() } }}</p>
          } @else {
            <p class="text-xs text-app-warning mt-1">{{ 'providers.documentMissing' | translate }}</p>
          }
        </div>
        <div class="flex justify-end gap-2">
          <p-button type="button" [label]="'common.close' | translate" [outlined]="true" (onClick)="editVisible.set(false)"></p-button>
          <p-button [label]="'common.save' | translate" icon="pi pi-check" [loading]="savingProfile()"
                    [disabled]="editForm.invalid" (onClick)="saveEditProfile()"></p-button>
        </div>
      </div>
    </p-dialog>

    <!-- Dialog: login/senha do técnico — some ao fechar, hash é one-way, não há como recuperar depois -->
    <p-dialog [(visible)]="credentialsVisible" [modal]="true" [closable]="false" [style]="{ width: '26rem' }"
              [header]="'providers.credentialsTitle' | translate">
      @if (credentialsResult(); as result) {
        <div class="space-y-4">
          <p class="text-sm text-app-warning flex items-start gap-1.5">
            <i class="pi pi-exclamation-triangle mt-0.5"></i>
            <span>{{ 'providers.credentialsWarning' | translate }}</span>
          </p>
          <div>
            <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'common.email' | translate }}</label>
            <p class="text-sm font-mono text-app-text">{{ result.email }}</p>
          </div>
          <div>
            <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'providers.credentialsPassword' | translate }}</label>
            <p class="text-sm font-mono text-app-text">{{ result.temporaryPassword }}</p>
          </div>
          <div class="flex gap-2">
            <p-button [label]="'providers.credentialsCopy' | translate" icon="pi pi-copy" [outlined]="true" size="small"
                      (onClick)="copyCredentials(result)"></p-button>
            @if (result.provider.contactEmail) {
              <p-button [label]="'providers.credentialsSendEmail' | translate" icon="pi pi-send" [outlined]="true" size="small"
                        [loading]="sendingCredentialsEmail()" (onClick)="sendCredentialsEmail(result)"></p-button>
            }
          </div>
          <div class="pt-3 border-t border-app-border-subtle space-y-3">
            <p class="text-xs text-app-text-tertiary">{{ 'providers.credentialsNextStepHint' | translate }}</p>
            <div class="flex justify-end">
              <p-button [label]="'providers.credentialsClose' | translate" icon="pi pi-arrow-right" iconPos="right"
                        (onClick)="closeCredentials()"></p-button>
            </div>
          </div>
        </div>
      }
    </p-dialog>

    <!-- Drawer: gerir prestador — cabeçalho e rodapé fixos, tabs de altura estável porque
         o scroll pertence ao drawer inteiro (100vh), nunca a um tabpanel de altura fixa. -->
    <p-drawer [(visible)]="manageVisible" position="right" [dismissible]="true" [closeOnEscape]="true"
              styleClass="w-full! sm:w-[30rem]! md:w-[42rem]!">
      <ng-template #header>
        @if (managing(); as p) {
          <div class="flex items-center gap-2 min-w-0">
            <span class="font-semibold text-app-text truncate">{{ displayName(p) }}</span>
            <app-tag-badge [value]="(p.active ? 'common.active' : 'common.inactive') | translate"
                          [severity]="p.active ? 'success' : 'secondary'"></app-tag-badge>
            @if (isIncomplete(p)) {
              <app-tag-badge [value]="'providers.incomplete' | translate" severity="warn"></app-tag-badge>
            }
          </div>
        }
      </ng-template>

      @if (managing(); as p) {
        <div class="pb-4">
          <p-tabs [value]="manageActiveTab()" (valueChange)="manageActiveTab.set($any($event))">
            <p-tablist class="sticky top-0 bg-app-surface z-10">
              <p-tab value="skills">{{ 'providers.tabSkills' | translate }}</p-tab>
              <p-tab value="availability">{{ 'providers.tabAvailability' | translate }}</p-tab>
              <p-tab value="capacity">{{ 'providers.tabCapacity' | translate }}</p-tab>
              <p-tab value="route">{{ 'providers.tabRoute' | translate }}</p-tab>
              <p-tab value="color">{{ 'providers.tabColor' | translate }}</p-tab>
            </p-tablist>
            <p-tabpanels>
              <p-tabpanel value="skills">
                <app-provider-skills-tab [provider]="p" [allSkills]="allSkills()" [canWrite]="canWrite()"
                                          (providerUpdated)="refreshManaging($event)"></app-provider-skills-tab>
              </p-tabpanel>
              <p-tabpanel value="availability">
                <app-provider-availability-tab [provider]="p" [canWrite]="canWrite()"
                                                (providerUpdated)="refreshManaging($event)"></app-provider-availability-tab>
              </p-tabpanel>
              <p-tabpanel value="capacity">
                <app-provider-capacity-tab [provider]="p" [canWrite]="canWrite()"
                                            (providerUpdated)="refreshManaging($event)"></app-provider-capacity-tab>
              </p-tabpanel>
              <p-tabpanel value="route">
                <app-provider-route-tab [provider]="p" [canWrite]="canWrite()"
                                        [forcedByCompany]="forceRouteStartFromCompany()"
                                        (providerUpdated)="refreshManaging($event)"></app-provider-route-tab>
              </p-tabpanel>
              <p-tabpanel value="color">
                <app-provider-color-tab [provider]="p" [canWrite]="canWrite()"
                                        (providerUpdated)="refreshManaging($event)"></app-provider-color-tab>
              </p-tabpanel>
            </p-tabpanels>
          </p-tabs>
        </div>
      }

      <ng-template #footer>
        @if (managing(); as p) {
          <div class="flex justify-end gap-2">
            @if (p.active) {
              <p-button [label]="'providers.deactivate' | translate" icon="pi pi-times-circle" severity="warn" [outlined]="true"
                        [loading]="pendingId() === p.id" (onClick)="confirmDeactivate(p)"></p-button>
            } @else {
              <p-button [label]="'providers.activate' | translate" icon="pi pi-check-circle" severity="info" [outlined]="true"
                        [loading]="pendingId() === p.id" (onClick)="toggleActive(p, true)"></p-button>
            }
          </div>
        }
      </ng-template>
    </p-drawer>
  `,
  styles: [`
    @reference "../../../styles.css";
    .label { @apply block text-[11px] font-medium text-app-text-secondary mb-1.5; }
  `],
})
export class ProvidersComponent implements OnInit {
  private providerService = inject(ProviderService);
  private skillService = inject(SkillService);
  private tenantUserService = inject(TenantUserService);
  private tenantService = inject(TenantService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);
  private translate = inject(TranslateService);
  private auth = inject(AuthService);
  private destroyRef = inject(DestroyRef);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly canWrite = () => ['OWNER', 'ADMIN', 'OPERATOR'].includes(this.auth.userRole() ?? '');
  readonly canEditProfile = () => ['OWNER', 'ADMIN'].includes(this.auth.userRole() ?? '');
  readonly pageSize = PAGE_SIZE;

  private userNames = new Map<string, string>();
  private userEmails = new Map<string, string>();
  private userDocumentLast4 = new Map<string, string | null>();
  allSkills = signal<Skill[]>([]);
  private skillsById = computed(() => new Map(this.allSkills().map(s => [s.id, s])));

  readonly activeOptions = [
    { label: this.translate.instant('common.active'), value: true },
    { label: this.translate.instant('common.inactive'), value: false },
  ];

  rows = signal<Provider[]>([]);
  total = signal(0);
  first = signal(0);
  loading = signal(false);
  pendingId = signal<string | null>(null);
  /** Primeira carga sem filtros e sem resultados — onboarding, distinto de "sem resultados para o filtro". */
  providersEmpty = computed(() => !this.loading() && this.total() === 0 && !this.hasActiveFilters());
  search = '';
  activeFilter: boolean | null = null;
  private page = 0;
  private filterChange$ = new Subject<void>();

  createVisible = signal(false);
  creatingTechnician = signal(false);
  createColorOptions = signal<ProviderColorOption[]>([]);
  /** Cor some por trás de um chip com a auto-atribuída até o usuário pedir pra trocar — 34
   *  opções logo de cara pesaria contra a velocidade de cadastro (só nome é obrigatório). */
  colorPickerExpanded = signal(false);
  colorManuallyChosen = signal(false);
  readonly technicianForm = new FormGroup({
    fullName: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    document: new FormControl('', { nonNullable: true, validators: [Validators.required, personalTaxIdValidator()] }),
    startDate: new FormControl<Date | null>(null),
    contactEmail: new FormControl('', { nonNullable: true, validators: [Validators.email] }),
    color: new FormControl<ProviderColor | null>(null, { validators: [Validators.required] }),
  });
  private createNameInputRef = viewChild<ElementRef<HTMLInputElement>>('createNameInput');

  editVisible = signal(false);
  editingRow: Provider | null = null;
  savingProfile = signal(false);
  readonly editForm = new FormGroup({
    fullName: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    /** Opcional aqui: só preenche quem ainda não tem documento registado (contas anteriores à regra). */
    document: new FormControl('', { nonNullable: true, validators: [personalTaxIdValidator()] }),
  });
  /** Últimos 4 dígitos do documento da conta em edição; vazio = ainda não registado. */
  readonly editingDocumentLast4 = signal<string | null>(null);
  private editNameInputRef = viewChild<ElementRef<HTMLInputElement>>('editNameInput');

  credentialsVisible = signal(false);
  credentialsResult = signal<CreateTechnicianResult | null>(null);
  sendingCredentialsEmail = signal(false);

  manageVisible = signal(false);
  managing = signal<Provider | null>(null);
  manageActiveTab = signal('skills');

  /** Parâmetro do sistema (issue #173): quando ligado, a preferência de origem/fim de cada
   *  técnico deixa de ser consultada e o separador de rota di-lo em vez de a deixar editar. */
  forceRouteStartFromCompany = signal(true);

  ngOnInit(): void {
    this.tenantService.getMe().subscribe({
      next: tenant => this.forceRouteStartFromCompany.set(tenant.systemParameters?.forceRouteStartFromCompany ?? true),
      error: () => {},
    });
    this.skillService.list().subscribe({
      next: skills => this.allSkills.set(skills),
      error: () => {},
    });
    // Email é dado de conta: só quem gere a equipa (OWNER/ADMIN) o lê; os restantes perfis
    // resolvem só o nome pelo diretório.
    if (['OWNER', 'ADMIN'].includes(this.auth.userRole() ?? '')) {
      this.tenantUserService.list().subscribe({
        next: users => users.forEach(u => {
          this.userNames.set(u.id, u.name);
          this.userEmails.set(u.id, u.email);
          this.userDocumentLast4.set(u.id, u.documentLast4);
        }),
        error: () => {},
      });
    } else {
      this.tenantUserService.directory().subscribe({
        next: users => users.forEach(u => this.userNames.set(u.id, u.name)),
        error: () => {},
      });
    }
    this.wireFilters();
    this.load();
    this.openFromQueryParam();
  }

  /** Chegada a partir do Drawer da Equipa ("Gerir habilidades e disponibilidade") — abre
   *  diretamente o Drawer de gestão do prestador indicado, sem depender da paginação da lista. */
  private openFromQueryParam(): void {
    const id = this.route.snapshot.queryParamMap.get('open');
    if (!id) return;
    this.providerService.get(id).subscribe({
      next: provider => {
        this.openManage(provider);
        this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
      },
      error: () => {},
    });
  }

  /** Busca/tipo/estado disparam aqui; debounce+distinctUntilChanged evitam requests supérfluos,
   *  switchMap cancela a busca anterior quando uma nova é iniciada. */
  private wireFilters(): void {
    const sub = this.filterChange$.pipe(
      debounceTime(300),
      map(() => this.filterKey()),
      distinctUntilChanged(),
      tap(() => { this.page = 0; this.first.set(0); this.loading.set(true); }),
      switchMap(() => this.fetchProviders$().pipe(
        catchError(() => {
          this.messageService.add({ severity: 'error', summary: this.translate.instant('providers.loadError') });
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

  private fetchProviders$(): Observable<ProviderPage> {
    return this.providerService.list({
      active: this.activeFilter, name: this.search, page: this.page, size: PAGE_SIZE,
    });
  }

  displayName(p: Provider): string {
    return this.userNames.get(p.userId) || this.translate.instant('providers.technician');
  }

  skillName(id: string): string {
    return this.skillsById().get(id)?.name ?? '?';
  }

  isIncomplete(p: Provider): boolean {
    return p.skillIds.length === 0 || !p.hasWeeklyAvailability;
  }

  skillNames(p: Provider): string {
    return p.skillIds.map(id => this.skillName(id)).join(', ');
  }

  capacitySummary(p: Provider): string {
    const parts: string[] = [];
    if (p.maxOrdersPerDay != null) parts.push(this.translate.instant('providers.capacityOrders', { n: p.maxOrdersPerDay }));
    if (p.maxMinutesPerDay != null) parts.push(this.translate.instant('providers.capacityMinutes', { n: p.maxMinutesPerDay }));
    if (p.maxVolumePerDay != null) parts.push(this.translate.instant('providers.capacityVolume', { n: p.maxVolumePerDay }));
    return parts.join(' · ');
  }

  /** Disparado a cada tecla/seleção — alimenta o pipeline reativo em {@link wireFilters}. */
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

  onLazyLoad(event: TableLazyLoadEvent): void {
    this.page = Math.floor((event.first ?? 0) / (event.rows ?? PAGE_SIZE));
    this.first.set(event.first ?? 0);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.fetchProviders$().subscribe({
      next: result => {
        this.rows.set(result.content);
        this.total.set(result.page.totalElements);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('providers.loadError') });
      },
    });
  }

  openCreateTechnician(): void {
    this.technicianForm.reset({ fullName: '', document: '', startDate: null, contactEmail: '', color: null });
    this.colorPickerExpanded.set(false);
    this.colorManuallyChosen.set(false);
    this.createVisible.set(true);
    this.providerService.listColors().subscribe({
      next: options => {
        this.createColorOptions.set(options);
        const firstAvailable = options.find(o => o.available)?.color ?? null;
        this.technicianForm.controls.color.setValue(firstAvailable);
      },
      error: () => {},
    });
  }

  /** `onShow` do dialog: garante que o campo já existe no DOM antes de focar. */
  focusCreateName(): void {
    this.createNameInputRef()?.nativeElement.focus();
  }

  focusEditName(): void {
    this.editNameInputRef()?.nativeElement.focus();
  }

  /** Escolha manual colapsa de volta pro chip — confirma a seleção sem deixar a grelha de 34
   *  cores aberta ocupando o dialog. */
  pickCreateColor(color: ProviderColor): void {
    this.technicianForm.controls.color.setValue(color);
    this.colorManuallyChosen.set(true);
    this.colorPickerExpanded.set(false);
  }

  createColorHex(): string {
    const color = this.technicianForm.controls.color.value;
    return color ? PROVIDER_COLOR_HEX[color] : 'transparent';
  }

  /** Formata o CPF enquanto se digita; o servidor normaliza de qualquer forma. */
  maskDocument(control: FormControl<string>): void {
    const masked = maskPersonalTaxIdInput(control.value);
    if (masked !== control.value) control.setValue(masked, { emitEvent: false });
  }

  saveTechnician(): void {
    if (this.technicianForm.invalid) return;
    const { fullName, document: personalDocument, startDate, contactEmail, color } = this.technicianForm.getRawValue();
    this.creatingTechnician.set(true);
    this.providerService.create({
      fullName: fullName.trim(),
      document: personalDocument.trim(),
      startDate: startDate ? this.toIsoDate(startDate) : null,
      contactEmail: contactEmail.trim() || null,
      color,
    }).subscribe({
      next: result => {
        this.creatingTechnician.set(false);
        this.createVisible.set(false);
        this.userNames.set(result.provider.userId, fullName.trim());
        this.userEmails.set(result.provider.userId, result.email);
        this.credentialsResult.set(result);
        this.credentialsVisible.set(true);
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.creatingTechnician.set(false);
        this.messageService.add({ severity: 'error', summary: this.businessError(err, 'providers.errors', 'providers.createError') });
      },
    });
  }

  closeCredentials(): void {
    const result = this.credentialsResult();
    this.credentialsVisible.set(false);
    this.credentialsResult.set(null);
    if (result) this.openManage(result.provider);
  }

  copyCredentials(result: CreateTechnicianResult): void {
    const text = `${this.translate.instant('common.email')}: ${result.email}\n${this.translate.instant('providers.credentialsPassword')}: ${result.temporaryPassword}`;
    navigator.clipboard.writeText(text).then(
      () => this.messageService.add({ severity: 'success', summary: this.translate.instant('providers.credentialsCopied') }),
      () => this.messageService.add({ severity: 'error', summary: this.translate.instant('providers.credentialsCopyError') }),
    );
  }

  sendCredentialsEmail(result: CreateTechnicianResult): void {
    if (this.sendingCredentialsEmail() || !result.provider.contactEmail) return;
    this.sendingCredentialsEmail.set(true);
    this.providerService.sendCredentialsEmail(result.provider.id, result.temporaryPassword).subscribe({
      next: () => {
        this.sendingCredentialsEmail.set(false);
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('providers.credentialsEmailSent', { email: result.provider.contactEmail }),
        });
      },
      error: (err: HttpErrorResponse) => {
        this.sendingCredentialsEmail.set(false);
        this.messageService.add({ severity: 'error', summary: this.businessError(err, 'providers.errors', 'providers.credentialsEmailError') });
      },
    });
  }

  private toIsoDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  confirmDeactivate(row: Provider): void {
    this.confirmationService.confirm({
      message: this.translate.instant('providers.deactivateConfirm', { name: this.displayName(row) }),
      header: this.translate.instant('providers.deactivateConfirmTitle'),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.translate.instant('providers.deactivate'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'warn' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => this.toggleActive(row, false),
    });
  }

  toggleActive(row: Provider, activate: boolean): void {
    if (this.pendingId()) return;
    this.pendingId.set(row.id);
    const obs$ = activate ? this.providerService.activate(row.id) : this.providerService.deactivate(row.id);
    obs$.subscribe({
      next: updated => {
        this.pendingId.set(null);
        if (this.managing()?.id === updated.id) this.managing.set(updated);
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant(activate ? 'providers.activated' : 'providers.deactivated', { name: this.displayName(row) }),
        });
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.pendingId.set(null);
        const fallback = activate ? 'providers.activateError' : 'providers.deactivateError';
        this.messageService.add({ severity: 'error', summary: this.businessError(err, 'providers.errors', fallback) });
      },
    });
  }

  openEditProfile(row: Provider): void {
    this.editingRow = row;
    this.editForm.reset({
      fullName: this.userNames.get(row.userId) ?? '',
      email: this.userEmails.get(row.userId) ?? '',
      document: '',
    });
    this.editingDocumentLast4.set(this.userDocumentLast4.get(row.userId) ?? null);
    this.editVisible.set(true);
  }

  saveEditProfile(): void {
    if (this.editForm.invalid || !this.editingRow) return;
    const row = this.editingRow;
    const { fullName, email, document: personalDocument } = this.editForm.getRawValue();
    this.savingProfile.set(true);
    this.tenantUserService.updateProfile(row.userId, { fullName: fullName.trim(), email: email.trim() }).pipe(
      switchMap(updated => personalDocument.trim()
        ? this.tenantUserService.setDocument(row.userId, personalDocument.trim())
        : of(updated)),
    ).subscribe({
      next: updated => {
        this.savingProfile.set(false);
        this.editVisible.set(false);
        this.userNames.set(updated.id, updated.name);
        this.userEmails.set(updated.id, updated.email);
        this.userDocumentLast4.set(updated.id, updated.documentLast4);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('providers.editProfileSaved', { name: updated.name }) });
      },
      error: (err: HttpErrorResponse) => {
        this.savingProfile.set(false);
        this.messageService.add({ severity: 'error', summary: this.businessError(err, 'providers.errors', 'providers.editProfileSaveError') });
      },
    });
  }

  openManage(row: Provider): void {
    this.managing.set(row);
    this.manageActiveTab.set('skills');
    this.manageVisible.set(true);
  }

  refreshManaging(updated: Provider): void {
    this.managing.set(updated);
    this.rows.update(rows => rows.map(r => (r.id === updated.id ? updated : r)));
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
