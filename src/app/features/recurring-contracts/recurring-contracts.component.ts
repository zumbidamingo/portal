import { ChangeDetectionStrategy, Component, LOCALE_ID, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { CommonModule, DatePipe, formatDate } from '@angular/common';
import { Subject, Subscription, map, startWith, switchMap } from 'rxjs';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { DrawerModule } from 'primeng/drawer';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { InputTextModule } from 'primeng/inputtext';
import { ToggleSwitch, ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Panel } from 'primeng/panel';
import {
  Periodicity, RecurringContract, RecurringContractService, RecurringCycleStatus, RecurringOrderGeneration,
} from '../../core/services/recurring-contract.service';
import { Quotation, QuotationService } from '../../core/services/quotation.service';
import { CustomerService, Customer } from '../../core/services/customer.service';
import { nextCycleDate, startOfDay, suggestedFirstRun } from './recurring-contract.utils';
import { TagBadgeComponent } from '../../shared/components/tag-badge/tag-badge.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { formatQuotationNumber } from '../quotations/quotation-form.utils';
import type { BadgeSeverity } from '../../shared/utils/status.utils';
import { TableStandardDirective } from '../../shared/directives/table-standard.directive';

/** Orçamento aprovado do cliente escolhido, já reduzido ao que ajuda a decidir "o que repete". */
interface QuotationChoice {
  id: string;
  number: string;
  services: string[];
  total: number;
  currency: string;
  issuedAt: string;
  /** Já sustenta um contrato ativo — o backend recusa um segundo, então nem se oferece. */
  inUse: boolean;
}

/**
 * Contratos Recorrentes: cliente → serviços (do orçamento aprovado) → recorrência → próxima
 * execução. Criação em passos progressivos: o cliente restringe os orçamentos, e um único
 * orçamento elegível já vem selecionado. Separado de Regras de Automação (`AutomationRulesComponent`) — jornada de produto
 * distinta ("para este cliente, execute estes serviços nesta frequência"), rota e serviço
 * próprios.
 */
@Component({
  selector: 'app-recurring-contracts',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TranslatePipe, DatePipe, RouterLink, ButtonModule, TableModule,
    DialogModule, DrawerModule, DatePickerModule, SelectModule, AutoCompleteModule, InputTextModule, ToggleSwitchModule,
    TooltipModule, ToastModule, ConfirmDialogModule, TagBadgeComponent, PageHeaderComponent, EmptyStateComponent, Panel,
    TableStandardDirective],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast position="top-right"></p-toast>
    <p-confirmDialog></p-confirmDialog>

    <app-page-header [title]="'automationRecurringContracts.title' | translate" [description]="'automationRecurringContracts.subtitle' | translate">
      @if (!contractsEmpty()) {
        <p-button icon="pi pi-plus" [label]="'automationRecurringContracts.add' | translate" size="small" (onClick)="openCreate()" />
      }
    </app-page-header>

    @if (contractsEmpty()) {
      <app-empty-state icon="pi pi-sync" [message]="'automationRecurringContracts.emptyTitle' | translate"
                        [subtitle]="'automationRecurringContracts.emptySubtitle' | translate">
      </app-empty-state>
      <div class="flex justify-center -mt-3">
        <p-button icon="pi pi-plus" [label]="'automationRecurringContracts.add' | translate" (onClick)="openCreate()" />
      </div>
    } @else {
      <p-panel>
        <div class="overflow-x-auto">
          <p-table appTableStandard [value]="contracts()" styleClass="p-datatable-sm" [loading]="loading()"
                   [rows]="20" [sortField]="'nextRunDate'" [sortOrder]="1">
            <ng-template pTemplate="header">
              <tr>
                <th>{{ 'automationRecurringContracts.columnClient' | translate }}</th>
                <th>{{ 'automationRecurringContracts.columnServices' | translate }}</th>
                <th>{{ 'automationRecurringContracts.periodicity' | translate }}</th>
                <th pSortableColumn="nextRunDate">{{ 'automationRecurringContracts.nextRunDate' | translate }} <p-sortIcon field="nextRunDate"></p-sortIcon></th>
                <th>{{ 'automationRecurringContracts.lastRunDate' | translate }}</th>
                <th>{{ 'automationRecurringContracts.validity' | translate }}</th>
                <th>{{ 'common.status' | translate }}</th>
                <th class="text-right w-36">{{ 'common.actions' | translate }}</th>
              </tr>
            </ng-template>
            <ng-template pTemplate="body" let-contract>
              <tr class="group">
                <td class="whitespace-nowrap font-medium text-app-text">{{ contract.customerName ?? '—' }}</td>
                <td class="text-sm text-app-text-secondary max-w-[16rem] truncate"
                    [pTooltip]="contract.serviceNames.join(', ')" tooltipPosition="top">
                  {{ contract.serviceNames.length ? contract.serviceNames.join(', ') : ('automationRecurringContracts.noServices' | translate) }}
                </td>
                <td class="whitespace-nowrap"><app-tag-badge [value]="periodicityLabel(contract.periodicity)" severity="info"></app-tag-badge></td>
                <td class="whitespace-nowrap">
                  <div class="text-app-text">{{ contract.nextRunDate | date:'mediumDate' }}</div>
                  <app-tag-badge [value]="nextRunRelativeLabel(contract)" [severity]="nextRunSeverity(contract)"></app-tag-badge>
                </td>
                <td class="whitespace-nowrap text-sm text-app-text-secondary">
                  {{ contract.lastRunDate ? (contract.lastRunDate | date:'mediumDate') : ('automationRecurringContracts.neverRun' | translate) }}
                </td>
                <td class="whitespace-nowrap text-sm text-app-text-secondary">
                  {{ 'automationRecurringContracts.validitySince' | translate: { date: (contract.createdAt | date:'mediumDate') } }}
                </td>
                <td class="whitespace-nowrap">
                  <div class="flex items-center gap-2">
                    <p-toggleswitch #toggle [ngModel]="contract.active" [ngModelOptions]="{standalone: true}"
                                    [disabled]="togglingContractId() === contract.id"
                                    (onChange)="toggleContractActive(contract, $event.checked, toggle)"></p-toggleswitch>
                    <span class="text-xs text-app-text-tertiary">{{ (contract.active ? 'common.active' : 'common.inactive') | translate }}</span>
                  </div>
                </td>
                <td class="text-right whitespace-nowrap">
                  <p-button icon="pi pi-list" [text]="true" size="small" severity="secondary"
                            [pTooltip]="'automationRecurringContracts.generations' | translate" (onClick)="openGenerations(contract)"></p-button>
                  <p-button icon="pi pi-pencil" [text]="true" size="small" severity="secondary"
                            [pTooltip]="'common.edit' | translate" (onClick)="openEdit(contract)"></p-button>
                  <p-button icon="pi pi-trash" [text]="true" size="small" severity="danger"
                            [pTooltip]="'common.delete' | translate"
                            [loading]="deletingContractId() === contract.id" (onClick)="confirmDeleteContract(contract)"></p-button>
                </td>
              </tr>
            </ng-template>
          </p-table>
        </div>
      </p-panel>
    }

    <!-- Novo contrato recorrente: Cliente -> o que repete -> frequência -> início -> resumo.
         Cada passo só aparece quando o anterior está resolvido: nada de formulário longo de uma vez. -->
    <p-dialog [(visible)]="createDialogVisible" [modal]="true" [draggable]="false"
              [style]="{ width: '36rem', maxWidth: '95vw' }"
              [header]="'automationRecurringContracts.add' | translate">
      <div class="space-y-5" [formGroup]="createForm">

        <section>
          <h3 class="step-title"><span class="step-num">1</span>{{ 'automationRecurringContracts.stepCustomer' | translate }}</h3>
          <p-autocomplete formControlName="customer" [suggestions]="customerSuggestions()"
                          (completeMethod)="searchCustomers($event.query)" optionLabel="name"
                          [dropdown]="true" [forceSelection]="true" [minLength]="0" [completeOnFocus]="true"
                          [placeholder]="'automationRecurringContracts.customerPlaceholder' | translate"
                          appendTo="body" fluid>
            <ng-template #item let-customer>
              <div class="min-w-0">
                <div class="font-medium text-app-text truncate">{{ customer.name }}</div>
                @if (customerHint(customer); as hint) {
                  <div class="text-xs text-app-text-tertiary truncate">{{ hint }}</div>
                }
              </div>
            </ng-template>
            <ng-template #empty>
              <span class="text-sm text-app-text-tertiary px-3 py-2 block">{{ 'automationRecurringContracts.customerEmpty' | translate }}</span>
            </ng-template>
          </p-autocomplete>
        </section>

        @if (selectedCustomer(); as customer) {
          <section>
            <h3 class="step-title"><span class="step-num">2</span>{{ 'automationRecurringContracts.stepService' | translate }}</h3>
            @if (loadingQuotations()) {
              <p class="text-sm text-app-text-tertiary flex items-center gap-2">
                <i class="pi pi-spin pi-spinner" aria-hidden="true"></i>
                {{ 'automationRecurringContracts.quotationsLoading' | translate }}
              </p>
            } @else if (quotationChoices().length === 0) {
              <div class="rounded-md border border-dashed border-app-border bg-app-surface px-4 py-4 text-center space-y-2">
                <i class="pi pi-file text-app-text-tertiary text-lg" aria-hidden="true"></i>
                <p class="text-sm font-medium text-app-text">
                  {{ 'automationRecurringContracts.noQuotationsTitle' | translate: { name: customer.name } }}
                </p>
                <p class="text-xs text-app-text-secondary">{{ 'automationRecurringContracts.noQuotationsHint' | translate }}</p>
                <p-button [label]="'automationRecurringContracts.noQuotationsAction' | translate" icon="pi pi-arrow-right"
                          iconPos="right" size="small" [outlined]="true" routerLink="/quotations"
                          (onClick)="createDialogVisible.set(false)"></p-button>
              </div>
            } @else {
              <div class="space-y-2 max-h-64 overflow-y-auto pr-0.5" role="radiogroup"
                   [attr.aria-label]="'automationRecurringContracts.stepService' | translate">
                @for (q of quotationChoices(); track q.id) {
                  <button type="button" role="radio" class="choice-card" [disabled]="q.inUse"
                          [class.choice-card-selected]="q.id === selectedQuotation()?.id"
                          [attr.aria-checked]="q.id === selectedQuotation()?.id" (click)="selectQuotation(q)">
                    <div class="flex items-start justify-between gap-3">
                      <span class="text-sm font-medium text-app-text min-w-0">
                        {{ q.services.length ? q.services.join(', ') : ('automationRecurringContracts.noServices' | translate) }}
                      </span>
                      <span class="text-sm font-semibold text-app-text whitespace-nowrap">
                        {{ q.total | currency: q.currency : 'symbol' : '1.2-2' }}
                      </span>
                    </div>
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-xs text-app-text-tertiary">
                      <span>{{ 'automationRecurringContracts.quotationNumber' | translate: { number: q.number } }}</span>
                      <span aria-hidden="true">·</span>
                      <span>{{ 'automationRecurringContracts.quotationIssuedOn' | translate: { date: (q.issuedAt | date:'mediumDate') } }}</span>
                      @if (q.inUse) {
                        <app-tag-badge [value]="'automationRecurringContracts.quotationAlreadyRecurring' | translate" severity="warn"></app-tag-badge>
                      }
                    </div>
                  </button>
                }
              </div>
              @if (allQuotationsInUse()) {
                <p class="text-xs text-app-text-secondary mt-2">{{ 'automationRecurringContracts.allQuotationsInUse' | translate }}</p>
              } @else if (autoSelected()) {
                <p class="text-xs text-app-text-tertiary mt-2 flex items-center gap-1.5">
                  <i class="pi pi-check-circle text-app-accent" aria-hidden="true"></i>
                  {{ 'automationRecurringContracts.singleAutoSelected' | translate }}
                </p>
              }
            }
          </section>
        }

        @if (selectedQuotation()) {
          <section>
            <h3 class="step-title"><span class="step-num">3</span>{{ 'automationRecurringContracts.stepFrequency' | translate }}</h3>
            <div class="grid grid-cols-2 gap-2" role="radiogroup" [attr.aria-label]="'automationRecurringContracts.stepFrequency' | translate">
              @for (option of periodicityOptions; track option.value) {
                <button type="button" role="radio" class="choice-card text-center text-sm font-medium"
                        [class.choice-card-selected]="option.value === periodicity()"
                        [attr.aria-checked]="option.value === periodicity()" (click)="selectPeriodicity(option.value)">
                  {{ option.label }}
                </button>
              }
            </div>
          </section>

          <section>
            <h3 class="step-title"><span class="step-num">4</span>{{ 'automationRecurringContracts.stepStart' | translate }}</h3>
            <label class="label" for="recurring-first-run">{{ 'automationRecurringContracts.firstRunLabel' | translate }}</label>
            <p-datepicker inputId="recurring-first-run" formControlName="firstRunDate" [dateFormat]="datePickerFormat"
                          [minDate]="today" [showIcon]="true" [readonlyInput]="true"
                          (onSelect)="firstRunTouched = true" appendTo="body" fluid></p-datepicker>
            @if (firstRunInPast()) {
              <p class="text-xs text-app-danger mt-1">{{ 'automationRecurringContracts.errors.RECURRING_CONTRACT_FIRST_RUN_IN_PAST' | translate }}</p>
            } @else if (!firstRunTouched) {
              <p class="text-xs text-app-text-tertiary mt-1">{{ 'automationRecurringContracts.firstRunSuggested' | translate }}</p>
            }
          </section>

          @if (canCreate() || saving()) {
            <section class="rounded-md border border-app-border bg-app-surface px-4 py-3">
              <h3 class="text-xs font-semibold uppercase tracking-wide text-app-text-secondary mb-2">
                {{ 'automationRecurringContracts.stepSummary' | translate }}
              </h3>
              <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt class="text-app-text-tertiary">{{ 'automationRecurringContracts.summaryCustomer' | translate }}</dt>
                <dd class="text-app-text font-medium">{{ selectedCustomer()?.name }}</dd>
                <dt class="text-app-text-tertiary">{{ 'automationRecurringContracts.summaryService' | translate }}</dt>
                <dd class="text-app-text">{{ selectedQuotation()?.services?.join(', ') }}</dd>
                <dt class="text-app-text-tertiary">{{ 'automationRecurringContracts.summaryValue' | translate }}</dt>
                <dd class="text-app-text">{{ selectedQuotation()?.total | currency: selectedQuotation()?.currency : 'symbol' : '1.2-2' }}</dd>
                <dt class="text-app-text-tertiary">{{ 'automationRecurringContracts.summaryFrequency' | translate }}</dt>
                <dd class="text-app-text">{{ periodicityLabel(periodicity()) }}</dd>
                <dt class="text-app-text-tertiary">{{ 'automationRecurringContracts.summaryFirstRun' | translate }}</dt>
                <dd class="text-app-text font-medium">{{ firstRunDate() | date:'longDate' }}</dd>
                <dt class="text-app-text-tertiary">{{ 'automationRecurringContracts.summaryThen' | translate }}</dt>
                <dd class="text-app-text">{{ thenRepeatsDate() | date:'longDate' }}</dd>
              </dl>
              <p class="text-xs text-app-text-tertiary mt-3">{{ 'automationRecurringContracts.createHint' | translate }}</p>
            </section>
          }
        }
      </div>
      <ng-template #footer>
        <p-button [label]="'common.cancel' | translate" [outlined]="true" severity="secondary"
                  (onClick)="createDialogVisible.set(false)"></p-button>
        <p-button [label]="'automationRecurringContracts.create' | translate" icon="pi pi-check"
                  [disabled]="!canCreate()" [loading]="saving()" (onClick)="createContract()"></p-button>
      </ng-template>
    </p-dialog>

    <!-- Editar recorrência -->
    <p-dialog [(visible)]="editDialogVisible" [modal]="true" [style]="{ width: '24rem', maxWidth: '95vw' }"
              [header]="'automationRecurringContracts.editTitle' | translate">
      <div class="space-y-3" [formGroup]="editForm">
        @if (editingContract(); as contract) {
          <div class="text-xs text-app-text-secondary">
            {{ contract.customerName ?? '—' }} — {{ contract.serviceNames.join(', ') }}
          </div>
        }
        <div>
          <label class="label">{{ 'automationRecurringContracts.periodicity' | translate }}</label>
          <p-select [options]="periodicityOptions" optionLabel="label" optionValue="value"
                    formControlName="periodicity" appendTo="body" fluid></p-select>
        </div>
        <div class="flex justify-end gap-2 pt-1">
          <p-button [label]="'common.close' | translate" [outlined]="true" (onClick)="editDialogVisible.set(false)"></p-button>
          <p-button [label]="'common.save' | translate" icon="pi pi-check" [loading]="savingEdit()"
                    (onClick)="saveEdit()"></p-button>
        </div>
      </div>
    </p-dialog>

    <!-- Ciclos do contrato: executados e não executados, com o motivo -->
    <p-drawer [(visible)]="generationsDrawerVisible" position="right" [style]="{ width: '28rem', maxWidth: '95vw' }"
              [header]="'automationRecurringContracts.generations' | translate">
      @if (generationsContract(); as contract) {
        <div class="space-y-3">
          <div>
            <div class="text-sm font-medium text-app-text">{{ contract.customerName ?? '—' }}</div>
            <div class="text-xs text-app-text-tertiary mt-0.5">
              {{ 'automationRecurringContracts.cycleNextScheduled' | translate }}: {{ contract.nextRunDate | date:'mediumDate' }}
            </div>
          </div>
          @if (loadingGenerations()) {
            <p class="text-sm text-app-text-tertiary">{{ 'common.loading' | translate }}</p>
          } @else if (generations().length === 0) {
            <p class="text-sm text-app-text-tertiary py-4 text-center">{{ 'automationRecurringContracts.generationsEmpty' | translate }}</p>
          } @else {
            <ul class="space-y-2">
              @for (g of generations(); track g.id) {
                <li class="rounded-md border border-app-border px-3 py-2 text-sm space-y-1">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-app-text">{{ g.cycleDate | date:'mediumDate' }}</span>
                    <app-tag-badge [value]="('automationRecurringContracts.cycleStatus.' + g.status) | translate"
                                   [severity]="cycleSeverity(g.status)"></app-tag-badge>
                  </div>
                  @if (g.status === 'GENERATED' && g.orderId) {
                    <a [routerLink]="['/orders']" [queryParams]="{ open: g.orderId }"
                       class="text-xs text-app-accent hover:underline">
                      {{ 'automationRecurringContracts.generationOrder' | translate }}
                    </a>
                  } @else {
                    <div class="text-xs text-app-text-secondary">{{ cycleReasonText(g) }}</div>
                    @if (g.status === 'FAILED') {
                      <div class="text-xs text-app-text-tertiary">{{ 'automationRecurringContracts.cycleRetryHint' | translate }}</div>
                    }
                  }
                </li>
              }
            </ul>
          }
        </div>
      }
    </p-drawer>
  `,
  styles: [`
    @reference "../../../styles.css";
    .label { @apply block text-[11px] font-medium text-app-text-secondary mb-1.5; }
  `],
})
export class RecurringContractsComponent implements OnInit {
  private recurringContractService = inject(RecurringContractService);
  private quotationService = inject(QuotationService);
  private customerService = inject(CustomerService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);
  private translate = inject(TranslateService);
  private locale = inject(LOCALE_ID);

  contracts = signal<RecurringContract[]>([]);
  loading = signal(false);
  contractsEmpty = computed(() => !this.loading() && this.contracts().length === 0);

  createDialogVisible = signal(false);
  saving = signal(false);
  loadingQuotations = signal(false);
  customerSuggestions = signal<Customer[]>([]);
  quotationChoices = signal<QuotationChoice[]>([]);
  /** O orçamento foi escolhido pelo sistema (único elegível), não pelo usuário — só para avisar. */
  autoSelected = signal(false);
  /** Enquanto o usuário não mexe na data, ela acompanha a periodicidade escolhida. */
  firstRunTouched = false;
  today = startOfDay(new Date());
  readonly datePickerFormat = this.locale.toLowerCase().startsWith('en') ? 'mm/dd/yy' : 'dd/mm/yy';

  editDialogVisible = signal(false);
  savingEdit = signal(false);
  editingContract = signal<RecurringContract | null>(null);

  deletingContractId = signal<string | null>(null);
  togglingContractId = signal<string | null>(null);

  generationsDrawerVisible = signal(false);
  generationsContract = signal<RecurringContract | null>(null);
  generations = signal<RecurringOrderGeneration[]>([]);
  loadingGenerations = signal(false);

  periodicityOptions: { label: string; value: Periodicity }[] = [];

  /** `string` enquanto o usuário digita na busca; vira `Customer` ao escolher um da lista. */
  readonly createForm = new FormGroup({
    customer: new FormControl<Customer | string | null>(null),
    quotationId: new FormControl('', { nonNullable: true, validators: Validators.required }),
    periodicity: new FormControl<Periodicity>('MONTHLY', { nonNullable: true }),
    firstRunDate: new FormControl<Date | null>(null, Validators.required),
  });

  private readonly formValue = toSignal(
    this.createForm.valueChanges.pipe(startWith(null), map(() => this.createForm.getRawValue())),
    { requireSync: true });

  readonly selectedCustomer = computed(() => {
    const customer = this.formValue().customer;
    return customer && typeof customer === 'object' ? customer : null;
  });
  readonly periodicity = computed(() => this.formValue().periodicity);
  readonly firstRunDate = computed(() => this.formValue().firstRunDate);
  readonly selectedQuotation = computed(() =>
    this.quotationChoices().find(q => q.id === this.formValue().quotationId && !q.inUse) ?? null);
  readonly allQuotationsInUse = computed(() =>
    this.quotationChoices().length > 0 && this.quotationChoices().every(q => q.inUse));
  readonly firstRunInPast = computed(() => {
    const date = this.firstRunDate();
    return !!date && startOfDay(date) < this.today;
  });
  readonly thenRepeatsDate = computed(() => {
    const date = this.firstRunDate();
    return date ? nextCycleDate(date, this.periodicity()) : null;
  });
  /** Só há o que criar quando cliente, orçamento livre e data válida estão resolvidos. */
  readonly canCreate = computed(() =>
    !!this.selectedCustomer() && !!this.selectedQuotation() && !!this.firstRunDate()
    && !this.firstRunInPast() && !this.loadingQuotations());

  private readonly customerQuery$ = new Subject<string>();
  private quotationsRequest?: Subscription;

  readonly editForm = new FormGroup({
    periodicity: new FormControl<Periodicity>('MONTHLY', { nonNullable: true }),
  });

  constructor() {
    this.customerQuery$.pipe(
      switchMap(query => this.customerService.list({ active: true, search: query, size: 10, sort: 'name,asc' })),
      takeUntilDestroyed(),
    ).subscribe({
      next: page => this.customerSuggestions.set(page.content),
      error: () => this.messageService.add({
        severity: 'error', summary: this.translate.instant('automationRecurringContracts.loadCustomersError') }),
    });

    this.createForm.controls.customer.valueChanges.pipe(takeUntilDestroyed()).subscribe(customer => {
      this.onCustomerChanged(customer && typeof customer === 'object' ? customer : null);
    });

    this.createForm.controls.periodicity.valueChanges.pipe(takeUntilDestroyed()).subscribe(periodicity => {
      if (!this.firstRunTouched) {
        this.createForm.controls.firstRunDate.setValue(suggestedFirstRun(new Date(), periodicity));
      }
    });
  }

  ngOnInit(): void {
    this.periodicityOptions = (['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY'] as Periodicity[])
      .map(v => ({ label: this.translate.instant(`automationRecurringContracts.periodicities.${v}`), value: v }));
    this.loadContracts();
  }

  periodicityLabel(periodicity: string): string {
    return this.translate.instant(`automationRecurringContracts.periodicities.${periodicity}`);
  }

  nextRunRelativeLabel(contract: RecurringContract): string {
    if (!contract.active) return this.translate.instant('automationRecurringContracts.nextRunPaused');
    const diff = this.daysUntil(contract.nextRunDate);
    if (diff < 0) return this.translate.instant('automationRecurringContracts.nextRunOverdue');
    if (diff === 0) return this.translate.instant('automationRecurringContracts.nextRunToday');
    return this.translate.instant('automationRecurringContracts.nextRunInDays', { count: diff });
  }

  nextRunSeverity(contract: RecurringContract): BadgeSeverity {
    if (!contract.active) return 'secondary';
    const diff = this.daysUntil(contract.nextRunDate);
    if (diff < 0) return 'danger';
    if (diff === 0) return 'warn';
    return 'secondary';
  }

  cycleSeverity(status: RecurringCycleStatus): BadgeSeverity {
    if (status === 'GENERATED') return 'success';
    return status === 'FAILED' ? 'danger' : 'warn';
  }

  cycleReasonText(cycle: RecurringOrderGeneration): string {
    const key = `automationRecurringContracts.cycleReason.${cycle.reasonCode}`;
    const translated = this.translate.instant(key);
    return translated !== key ? translated : (cycle.reasonDetail ?? cycle.reasonCode ?? '—');
  }

  private daysUntil(dateStr: string): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr);
    target.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - today.getTime()) / 86_400_000);
  }

  private toDateString(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  loadContracts(): void {
    this.loading.set(true);
    this.recurringContractService.list().subscribe({
      next: res => { this.contracts.set(res.content); this.loading.set(false); },
      error: () => {
        this.loading.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('automationRecurringContracts.loadError') });
      },
    });
  }

  openCreate(): void {
    this.quotationsRequest?.unsubscribe();
    this.today = startOfDay(new Date());
    this.firstRunTouched = false;
    this.autoSelected.set(false);
    this.quotationChoices.set([]);
    this.loadingQuotations.set(false);
    this.createForm.reset({
      customer: null,
      quotationId: '',
      periodicity: 'MONTHLY',
      firstRunDate: suggestedFirstRun(this.today, 'MONTHLY'),
    });
    this.createDialogVisible.set(true);
  }

  searchCustomers(query: string): void {
    this.customerQuery$.next(query ?? '');
  }

  /** Linha de apoio para distinguir clientes de nome parecido — só o que existe, sem campos vazios. */
  customerHint(customer: Customer): string {
    return [customer.taxId, customer.city].filter((part): part is string => !!part).join(' · ');
  }

  selectQuotation(choice: QuotationChoice): void {
    if (choice.inUse) return;
    this.autoSelected.set(false);
    this.createForm.controls.quotationId.setValue(choice.id);
  }

  selectPeriodicity(periodicity: Periodicity): void {
    this.createForm.controls.periodicity.setValue(periodicity);
  }

  /** Trocar (ou limpar) o cliente invalida o orçamento escolhido: ele pertencia ao cliente anterior. */
  private onCustomerChanged(customer: Customer | null): void {
    this.quotationsRequest?.unsubscribe();
    this.autoSelected.set(false);
    this.quotationChoices.set([]);
    this.createForm.controls.quotationId.setValue('');
    if (!customer) {
      this.loadingQuotations.set(false);
      return;
    }
    this.loadQuotationsOf(customer);
  }

  private loadQuotationsOf(customer: Customer): void {
    this.loadingQuotations.set(true);
    this.quotationsRequest = this.quotationService
      .list({ status: 'APPROVED', customerId: customer.id, size: 50, sort: 'createdAt,desc' })
      .subscribe({
        next: page => {
          const inUseIds = new Set(this.contracts().filter(c => c.active).map(c => c.quotationId));
          const choices = page.content
            .map((q: Quotation): QuotationChoice => ({
              id: q.id,
              number: formatQuotationNumber(q.quotationNumber),
              services: q.items.map(i => i.description).filter((n): n is string => !!n && n.trim() !== ''),
              total: q.total,
              currency: q.currency,
              issuedAt: q.createdAt,
              inUse: inUseIds.has(q.id),
            }))
            // Orçamento sem serviço não tem o que repetir — o backend também o recusa.
            .filter(choice => choice.services.length > 0);
          this.quotationChoices.set(choices);
          this.loadingQuotations.set(false);
          const free = choices.filter(choice => !choice.inUse);
          if (free.length === 1) {
            this.createForm.controls.quotationId.setValue(free[0].id);
            this.autoSelected.set(true);
          }
        },
        error: () => {
          this.loadingQuotations.set(false);
          this.messageService.add({ severity: 'error', summary: this.translate.instant('automationRecurringContracts.loadQuotationsError') });
        },
      });
  }

  createContract(): void {
    const { periodicity, firstRunDate } = this.createForm.getRawValue();
    const quotation = this.selectedQuotation();
    if (!this.canCreate() || !quotation || !firstRunDate) return;
    this.saving.set(true);
    this.recurringContractService.create({
      quotationId: quotation.id,
      periodicity,
      firstRunDate: this.toDateString(firstRunDate),
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.createDialogVisible.set(false);
        this.loadContracts();
        this.messageService.add({ severity: 'success', summary: this.translate.instant('automationRecurringContracts.saved') });
      },
      error: (err) => {
        this.saving.set(false);
        this.messageService.add({ severity: 'error', summary: this.createErrorMessage(err) });
      },
    });
  }

  /** Erro conhecido do backend vira frase do produto; o resto cai no detalhe ou na mensagem genérica. */
  private createErrorMessage(err: { error?: { errorCode?: string; detail?: string } } | null): string {
    const code = err?.error?.errorCode;
    if (code) {
      const key = `automationRecurringContracts.errors.${code}`;
      const translated = this.translate.instant(key);
      if (translated !== key) return translated;
    }
    return err?.error?.detail ?? this.translate.instant('automationRecurringContracts.saveError');
  }

  openEdit(contract: RecurringContract): void {
    this.editingContract.set(contract);
    this.editForm.reset({ periodicity: contract.periodicity });
    this.editDialogVisible.set(true);
  }

  saveEdit(): void {
    const contract = this.editingContract();
    if (!contract) return;
    this.savingEdit.set(true);
    this.recurringContractService.update(contract.id, { periodicity: this.editForm.controls.periodicity.value }).subscribe({
      next: () => {
        this.savingEdit.set(false);
        this.editDialogVisible.set(false);
        this.loadContracts();
        this.messageService.add({ severity: 'success', summary: this.translate.instant('automationRecurringContracts.saved') });
      },
      error: (err) => {
        this.savingEdit.set(false);
        this.messageService.add({ severity: 'error', summary: err?.error?.detail ?? this.translate.instant('automationRecurringContracts.saveError') });
      },
    });
  }

  toggleContractActive(contract: RecurringContract, active: boolean, toggle: ToggleSwitch): void {
    if (this.togglingContractId()) return;
    this.togglingContractId.set(contract.id);
    const name = contract.customerName ?? '—';
    this.recurringContractService.setActive(contract.id, active).subscribe({
      next: updated => {
        this.togglingContractId.set(null);
        this.contracts.update(list => list.map(c => (c.id === updated.id
          ? { ...c, active: updated.active, nextRunDate: updated.nextRunDate, updatedAt: updated.updatedAt }
          : c)));
        this.messageService.add({
          severity: 'success',
          summary: active
            ? this.translate.instant('automationRecurringContracts.activated', {
                name, date: formatDate(updated.nextRunDate, 'mediumDate', this.locale),
              })
            : this.translate.instant('automationRecurringContracts.deactivated', { name }),
        });
        this.loadContracts();
      },
      error: err => {
        this.togglingContractId.set(null);
        toggle.writeValue(contract.active);
        this.messageService.add({
          severity: 'error',
          summary: err?.error?.detail ?? this.translate.instant('automationRecurringContracts.toggleError'),
        });
        this.loadContracts();
      },
    });
  }

  confirmDeleteContract(contract: RecurringContract): void {
    this.confirmationService.confirm({
      message: this.translate.instant('automationRecurringContracts.deleteConfirm', { name: contract.customerName ?? '—' }),
      header: this.translate.instant('automationRecurringContracts.deleteConfirmTitle'),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.translate.instant('automationRecurringContracts.deleteConfirmAccept'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => this.deleteContract(contract),
    });
  }

  private deleteContract(contract: RecurringContract): void {
    if (this.deletingContractId()) return;
    this.deletingContractId.set(contract.id);
    this.recurringContractService.delete(contract.id).subscribe({
      next: () => {
        this.deletingContractId.set(null);
        this.loadContracts();
        this.messageService.add({ severity: 'success', summary: this.translate.instant('automationRecurringContracts.deleted') });
      },
      error: (err) => {
        this.deletingContractId.set(null);
        this.messageService.add({ severity: 'error', summary: err?.error?.detail ?? this.translate.instant('automationRecurringContracts.deleteError') });
      },
    });
  }

  openGenerations(contract: RecurringContract): void {
    this.generationsContract.set(contract);
    this.generationsDrawerVisible.set(true);
    this.loadingGenerations.set(true);
    this.recurringContractService.generations(contract.id).subscribe({
      next: res => { this.generations.set(res.content); this.loadingGenerations.set(false); },
      error: () => {
        this.loadingGenerations.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('automationRecurringContracts.generationsLoadError') });
      },
    });
  }
}
