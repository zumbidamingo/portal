import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe, JsonPipe } from '@angular/common';
import { FormArray, FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { DrawerModule } from 'primeng/drawer';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Panel } from 'primeng/panel';
import {
  ActionType, AutomationExecution, AutomationRule, AutomationRuleService, CatalogField, ConditionMatchType,
  ConditionOperator, PreviewResult, RuleAction, RuleCondition, TRIGGER_EVENTS,
} from '../../core/services/automation-rule.service';
import { CustomerService } from '../../core/services/customer.service';
import { TagBadgeComponent } from '../../shared/components/tag-badge/tag-badge.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import type { BadgeSeverity } from '../../shared/utils/status.utils';
import { TableStandardDirective } from '../../shared/directives/table-standard.directive';

/** {@code recipient} só existe no formulário: CUSTOMER = target vazio no backend (contacto do cliente do evento). */
type ActionRecipient = 'CUSTOMER' | 'ADDRESS';
type ActionGroup = FormGroup<{
  actionType: FormControl<ActionType>; recipient: FormControl<ActionRecipient>; target: FormControl<string>;
  subject: FormControl<string>; message: FormControl<string>;
}>;

type ConditionGroup = FormGroup<{ field: FormControl<string>; operator: FormControl<ConditionOperator>; value: FormControl<string> }>;

/**
 * Regras de Automação (gatilho → condições → ações). Separado de Contratos Recorrentes
 * (`RecurringContractsComponent`) — duas jornadas de produto distintas, cada uma com rota,
 * serviço e estado próprios; só compartilham o agrupador "Automação" no sidebar.
 *
 * Criação/edição em Dialog (formulário guiado, mas curto o bastante para não precisar de página
 * própria). Testar regra é uma jornada à parte — não faz sentido só ao editar — por isso vive num
 * Drawer disparado direto da listagem, nunca empilhado sobre o Dialog de edição.
 */
@Component({
  selector: 'app-automation-rules',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TranslatePipe, DatePipe, JsonPipe, ButtonModule, TableModule,
    DialogModule, DrawerModule, SelectModule, SelectButtonModule, InputTextModule, TextareaModule, ToggleSwitchModule,
    TooltipModule, ToastModule, ConfirmDialogModule, TagBadgeComponent, PageHeaderComponent,
    EmptyStateComponent, Panel, TableStandardDirective],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast position="top-right"></p-toast>
    <p-confirmDialog></p-confirmDialog>

    <app-page-header [title]="'automationRules.title' | translate" [description]="'automationRules.subtitle' | translate">
      @if (!rulesEmpty()) {
        <p-button icon="pi pi-plus" [label]="'automationRules.add' | translate" size="small" (onClick)="openNewRule()" />
      }
    </app-page-header>

    @if (rulesEmpty()) {
      <app-empty-state icon="pi pi-bolt" [message]="'automationRules.emptyTitle' | translate"
                        [subtitle]="'automationRules.emptySubtitle' | translate">
      </app-empty-state>
      <div class="flex justify-center -mt-3">
        <p-button icon="pi pi-plus" [label]="'automationRules.add' | translate" (onClick)="openNewRule()" />
      </div>
    } @else {
      <p-panel>
        <div class="overflow-x-auto">
          <p-table appTableStandard [value]="rules()" styleClass="p-datatable-sm" [loading]="loadingRules()"
                   [rows]="20" [sortField]="'name'" [sortOrder]="1">
            <ng-template pTemplate="header">
              <tr>
                <th pSortableColumn="name">{{ 'automationRules.columnName' | translate }} <p-sortIcon field="name"></p-sortIcon></th>
                <th>{{ 'automationRules.trigger' | translate }}</th>
                <th>{{ 'automationRules.conditions' | translate }}</th>
                <th>{{ 'automationRules.actions' | translate }}</th>
                <th>{{ 'common.status' | translate }}</th>
                <th>{{ 'automationRules.lastExecution' | translate }}</th>
                <th class="text-right w-36">{{ 'common.actions' | translate }}</th>
              </tr>
            </ng-template>
            <ng-template pTemplate="body" let-rule>
              <tr class="group">
                <td class="font-medium text-app-text whitespace-nowrap">{{ rule.name }}</td>
                <td class="whitespace-nowrap"><app-tag-badge [value]="triggerLabel(rule.triggerEvent)" severity="info"></app-tag-badge></td>
                <td class="text-sm text-app-text-secondary whitespace-nowrap">{{ ruleConditionsSummary(rule) }}</td>
                <td class="text-sm text-app-text-secondary">{{ ruleActionsSummary(rule) }}</td>
                <td class="whitespace-nowrap">
                  <div class="flex items-center gap-2">
                    <p-toggleswitch [ngModel]="rule.active" [ngModelOptions]="{standalone: true}"
                                    (onChange)="toggleRuleActive(rule, $event.checked)"></p-toggleswitch>
                    <span class="text-xs text-app-text-tertiary">{{ (rule.active ? 'automationRules.active' : 'automationRules.paused') | translate }}</span>
                  </div>
                </td>
                <td class="whitespace-nowrap">
                  @if (rule.lastExecutionAt) {
                    <app-tag-badge [value]="(rule.lastExecutionAt | date:'short') + ''"
                                   [severity]="rule.lastExecutionStatus === 'FAILED' ? 'danger' : 'secondary'"></app-tag-badge>
                  } @else {
                    <span class="text-app-text-tertiary text-sm">{{ 'automationRules.neverExecuted' | translate }}</span>
                  }
                </td>
                <td class="text-right whitespace-nowrap">
                  <span>
                    <p-button icon="pi pi-play" [text]="true" size="small" severity="secondary"
                              [pTooltip]="'automationRules.testRule' | translate" (onClick)="openTest(rule)"></p-button>
                    <p-button icon="pi pi-pencil" [text]="true" size="small" severity="secondary"
                              [pTooltip]="'common.edit' | translate" (onClick)="openEditRule(rule)"></p-button>
                    <p-button icon="pi pi-history" [text]="true" size="small" severity="secondary"
                              [pTooltip]="'automationRules.history' | translate" (onClick)="openHistory(rule)"></p-button>
                    <p-button icon="pi pi-trash" [text]="true" size="small" severity="danger"
                              [pTooltip]="'common.delete' | translate"
                              [loading]="deletingRuleId() === rule.id" (onClick)="confirmDeleteRule(rule)"></p-button>
                  </span>
                </td>
              </tr>
            </ng-template>
          </p-table>
        </div>
      </p-panel>
    }

    <!-- Criar / editar regra -->
    <p-dialog [(visible)]="ruleDialogVisible" [modal]="true" [style]="{ width: '46rem', maxWidth: '95vw' }"
              [header]="(activeRule()?.id ? 'automationRules.editTitle' : 'automationRules.newTitle') | translate"
              (onHide)="activeRule.set(null)">
      @if (activeRule(); as rule) {
        <div class="space-y-5" [formGroup]="ruleForm">
          <!-- Resumo em linguagem visual -->
          <div class="rounded-md border border-app-border bg-app-surface px-4 py-3 flex flex-wrap items-center gap-2 text-sm">
            <i class="pi pi-bolt text-app-accent-hover" aria-hidden="true"></i>
            <span class="text-app-text-secondary shrink-0">{{ 'automationRules.summaryLabel' | translate }}:</span>
            <app-tag-badge [value]="triggerLabel(ruleForm.controls.trigger.value)" severity="info"></app-tag-badge>
            @if (ruleForm.controls.conditions.length > 0) {
              <i class="pi pi-arrow-right text-app-text-tertiary text-xs" aria-hidden="true"></i>
              <app-tag-badge [value]="draftConditionsSummary()" severity="secondary"></app-tag-badge>
            }
            <i class="pi pi-arrow-right text-app-text-tertiary text-xs" aria-hidden="true"></i>
            @if (ruleForm.controls.actions.length === 0) {
              <span class="text-app-text-tertiary italic text-xs">{{ 'automationRules.actionsEmptyHint' | translate }}</span>
            } @else {
              @for (a of ruleForm.controls.actions.controls; track $index) {
                <app-tag-badge [value]="actionTypeLabel(a.value.actionType!)" severity="warn"></app-tag-badge>
              }
            }
          </div>

          <!-- Nome / descrição -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="label">{{ 'common.name' | translate }} *</label>
              <input pInputText formControlName="name" fluid />
            </div>
            <div>
              <label class="label">{{ 'common.description' | translate }}</label>
              <input pInputText formControlName="description" fluid />
            </div>
          </div>

          <!-- Sequência: Gatilho -> Condições -> Ações -->
          <div>
            <!-- Passo 1: Gatilho -->
            <div class="flex gap-3">
              <div class="flex flex-col items-center">
                <span class="step-num">1</span>
                <span class="step-line"></span>
              </div>
              <div class="flex-1 min-w-0 pb-6">
                <h3 class="text-sm font-semibold text-app-text">{{ 'automationRules.step1Title' | translate }}</h3>
                <p class="text-xs text-app-text-tertiary mt-0.5 mb-2">{{ 'automationRules.step1Hint' | translate }}</p>
                <div class="max-w-sm">
                  <p-select [options]="triggerOptions" optionLabel="label" optionValue="value"
                            formControlName="trigger"
                            appendTo="body" fluid></p-select>
                  @if (rule.id) {
                    <p class="text-xs text-app-text-tertiary mt-1">
                      <i class="pi pi-lock" aria-hidden="true"></i> {{ 'automationRules.triggerLocked' | translate }}
                    </p>
                  }
                </div>
              </div>
            </div>

            <!-- Passo 2: Condições -->
            <div class="flex gap-3">
              <div class="flex flex-col items-center">
                <span class="step-num">2</span>
                <span class="step-line"></span>
              </div>
              <div class="flex-1 min-w-0 pb-6">
                <div class="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <h3 class="text-sm font-semibold text-app-text">
                      {{ 'automationRules.step2Title' | translate }}
                      <span class="text-xs font-normal text-app-text-tertiary">({{ 'automationRules.step2Optional' | translate }})</span>
                    </h3>
                    <p class="text-xs text-app-text-tertiary mt-0.5 mb-2">{{ 'automationRules.step2Hint' | translate }}</p>
                  </div>
                  @if (ruleForm.controls.conditions.length > 1) {
                    <div class="flex items-center gap-2">
                      <span class="text-xs text-app-text-secondary">{{ 'automationRules.matchLabel' | translate }}</span>
                      <p-selectbutton [options]="matchTypeOptions" optionLabel="label" optionValue="value"
                                      formControlName="matchType"></p-selectbutton>
                    </div>
                  }
                </div>

                @if (ruleForm.controls.conditions.length === 0) {
                  <div class="rounded-md border border-dashed border-app-border px-3 py-2.5 text-xs text-app-text-tertiary">
                    {{ 'automationRules.conditionsEmptyHint' | translate }}
                  </div>
                } @else {
                  <div class="space-y-2">
                    @for (c of ruleForm.controls.conditions.controls; track $index) {
                      @if ($index > 0) {
                        <div class="text-[11px] font-semibold text-app-text-tertiary pl-1">
                          {{ (ruleForm.controls.matchType.value === 'ALL' ? 'automationRules.connectorAnd' : 'automationRules.connectorOr') | translate }}
                        </div>
                      }
                      <div class="flex flex-col sm:flex-row gap-2 sm:items-center" [formGroup]="c">
                        <p-select [options]="fieldOptions()" optionLabel="label" optionValue="value"
                                  formControlName="field" [placeholder]="'automationRules.fieldPlaceholder' | translate"
                                  appendTo="body" class="sm:w-56" (onChange)="onFieldChange(c)"></p-select>
                        <p-select [options]="operatorOptionsFor(c)" optionLabel="label" optionValue="value"
                                  formControlName="operator" appendTo="body" class="sm:w-44"></p-select>
                        @switch (fieldDef(c)?.type) {
                          @case ('SELECT') {
                            <p-select [options]="valueOptionsFor(c)" optionLabel="label" optionValue="value"
                                      formControlName="value" [placeholder]="'automationRules.valueSelectPlaceholder' | translate"
                                      appendTo="body" class="flex-1 min-w-0"></p-select>
                          }
                          @case ('RULE') {
                            <p-select [options]="ruleOptions()" optionLabel="label" optionValue="value"
                                      formControlName="value" [placeholder]="'automationRules.valueRulePlaceholder' | translate"
                                      appendTo="body" class="flex-1 min-w-0"></p-select>
                          }
                          @case ('CUSTOMER') {
                            <p-select [options]="customerOptions()" optionLabel="label" optionValue="value"
                                      formControlName="value" [filter]="true" filterBy="label" [showClear]="false"
                                      [placeholder]="'automationRules.valueCustomerPlaceholder' | translate"
                                      [emptyFilterMessage]="'automationRules.customerNoResults' | translate"
                                      (onFilter)="searchCustomers($event.filter)"
                                      appendTo="body" class="flex-1 min-w-0"></p-select>
                          }
                          @case ('NUMBER') {
                            <input pInputText type="number" step="any" inputmode="decimal" formControlName="value"
                                   [placeholder]="'automationRules.valueNumberPlaceholder' | translate" class="flex-1 min-w-0" />
                          }
                          @default {
                            <input pInputText formControlName="value" [placeholder]="'automationRules.value' | translate"
                                   class="flex-1 min-w-0" />
                          }
                        }
                        <p-button icon="pi pi-trash" [text]="true" severity="danger" size="small"
                                  [pTooltip]="'automationRules.removeCondition' | translate" (onClick)="removeCondition($index)"></p-button>
                      </div>
                    }
                  </div>
                }
                <p-button [label]="'automationRules.addCondition' | translate" icon="pi pi-plus" [text]="true" size="small"
                          class="mt-2 inline-block" (onClick)="addCondition()"></p-button>
              </div>
            </div>

            <!-- Passo 3: Ações -->
            <div class="flex gap-3">
              <div class="flex flex-col items-center">
                <span class="step-num">3</span>
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="text-sm font-semibold text-app-text">{{ 'automationRules.step3Title' | translate }}</h3>
                <p class="text-xs text-app-text-tertiary mt-0.5 mb-2">{{ 'automationRules.step3Hint' | translate }}</p>

                @if (ruleForm.controls.actions.length === 0) {
                  <div class="rounded-md border border-dashed border-app-border px-3 py-2.5 text-xs text-app-text-tertiary flex items-center gap-2">
                    <i class="pi pi-exclamation-triangle" aria-hidden="true"></i> {{ 'automationRules.actionsEmptyHint' | translate }}
                  </div>
                } @else {
                  <div class="space-y-2">
                    @for (a of ruleForm.controls.actions.controls; track $index) {
                      <div class="space-y-2 rounded-md border border-app-border p-2.5" [formGroup]="a">
                      <div class="flex flex-col sm:flex-row gap-2 sm:items-center">
                        <span class="text-xs text-app-text-tertiary w-5 shrink-0">{{ $index + 1 }}.</span>
                        <p-select [options]="actionTypeOptions" optionLabel="label" optionValue="value"
                                  formControlName="actionType" appendTo="body" class="sm:w-56"
                                  (onChange)="onActionTypeChange(a)"></p-select>
                        @switch (a.controls.actionType.value) {
                          @case ('SEND_EMAIL') {
                            <p-select [options]="recipientOptions()" optionLabel="label" optionValue="value"
                                      formControlName="recipient" appendTo="body" class="sm:w-44"
                                      (onChange)="applyEmailTemplate(a)"></p-select>
                            @if (a.controls.recipient.value === 'ADDRESS') {
                              <input pInputText type="email" formControlName="target" autocomplete="off"
                                     [placeholder]="'automationRules.targetPlaceholders.SEND_EMAIL' | translate" class="flex-1 min-w-0" />
                            } @else {
                              <span class="flex-1 min-w-0 text-xs text-app-text-tertiary">{{ 'automationRules.emailToCustomerHint' | translate }}</span>
                            }
                          }
                          @case ('SEND_PUSH') {
                            <span class="flex-1 min-w-0 text-xs text-app-text-tertiary">{{ 'automationRules.pushRecipientHint' | translate }}</span>
                          }
                          @case ('WEBHOOK') {
                            <input pInputText type="url" formControlName="target" autocomplete="off"
                                   [placeholder]="'automationRules.targetPlaceholders.WEBHOOK' | translate" class="flex-1 min-w-0" />
                          }
                        }
                        <p-button icon="pi pi-trash" [text]="true" severity="danger" size="small"
                                  [pTooltip]="'automationRules.removeAction' | translate" (onClick)="removeAction($index)"></p-button>
                      </div>
                      @if (a.controls.actionType.value === 'SEND_EMAIL') {
                        <div class="space-y-2 sm:pl-7">
                          <div>
                            <label class="label">{{ 'automationRules.emailSubject' | translate }} *</label>
                            <input pInputText formControlName="subject" maxlength="200" fluid
                                   (focus)="focusEmailField(a, 'subject')" />
                          </div>
                          <div>
                            <label class="label">{{ 'automationRules.emailMessage' | translate }} *</label>
                            <textarea pTextarea formControlName="message" rows="5" maxlength="5000" fluid
                                      (focus)="focusEmailField(a, 'message')"></textarea>
                          </div>
                          @if (messageVariablesForTrigger().length > 0) {
                            <div class="flex flex-wrap items-center gap-1.5">
                              <span class="text-[11px] text-app-text-tertiary">{{ 'automationRules.insertVariable' | translate }}:</span>
                              @for (v of messageVariablesForTrigger(); track v) {
                                <p-button [label]="variableLabel(v)" size="small" [outlined]="true" severity="secondary"
                                          (onClick)="insertVariable(a, v)"></p-button>
                              }
                            </div>
                          }
                        </div>
                      }
                      </div>
                    }
                  </div>
                }
                <p-button [label]="'automationRules.addAction' | translate" icon="pi pi-plus" [text]="true" size="small"
                          class="mt-2 inline-block" (onClick)="addAction()"></p-button>
              </div>
            </div>
          </div>

          <div class="flex justify-end gap-2 pt-1 border-t border-app-border">
            <p-button [label]="'common.close' | translate" [outlined]="true" (onClick)="ruleDialogVisible.set(false)"></p-button>
            <p-button [label]="'common.save' | translate" icon="pi pi-check" [loading]="saving()"
                      (onClick)="saveRule()"></p-button>
          </div>
        </div>
      }
    </p-dialog>

    <!-- Testar regra -->
    <p-drawer [(visible)]="testDrawerVisible" position="right" [style]="{ width: '26rem', maxWidth: '95vw' }"
              [header]="'automationRules.previewTitle' | translate">
      @if (testingRule(); as rule) {
        <div class="space-y-3">
          <div class="text-sm font-medium text-app-text">{{ rule.name }}</div>
          <p class="text-xs text-app-text-tertiary">{{ 'automationRules.previewHint' | translate }}</p>
          <div class="flex flex-col gap-2">
            <input pInputText [(ngModel)]="previewAggregateId" [ngModelOptions]="{standalone: true}"
                   [placeholder]="'automationRules.previewSampleId' | translate" />
            <p-button [label]="'automationRules.previewRun' | translate" icon="pi pi-play" (onClick)="runPreview()"></p-button>
          </div>
          @if (previewResult(); as result) {
            <div class="text-sm space-y-1.5 pt-1">
              <app-tag-badge [value]="(result.wouldMatch ? 'automationRules.previewWouldRun' : 'automationRules.previewWouldNotRun') | translate"
                             [severity]="result.wouldMatch ? 'success' : 'secondary'"></app-tag-badge>
              @if (result.wouldMatch && result.wouldExecuteActions.length > 0) {
                <p class="text-xs font-medium text-app-text-secondary">{{ 'automationRules.previewActionsToRun' | translate }}:</p>
                <ul class="list-disc list-inside text-xs text-app-text-secondary">
                  @for (a of result.wouldExecuteActions; track a) { <li>{{ a }}</li> }
                </ul>
              }
              <details class="text-xs text-app-text-tertiary">
                <summary class="cursor-pointer select-none">{{ 'automationRules.previewFacts' | translate }}</summary>
                <pre class="whitespace-pre-wrap break-all">{{ result.resolvedFacts | json }}</pre>
              </details>
            </div>
          }
        </div>
      }
    </p-drawer>

    <!-- Histórico de execuções -->
    <p-dialog [(visible)]="historyDialogVisible" [modal]="true" [style]="{ width: '40rem', maxWidth: '95vw' }"
              [header]="'automationRules.history' | translate">
      @if (executions().length === 0) {
        <p class="text-sm text-app-text-tertiary py-4 text-center">{{ 'automationRules.historyEmpty' | translate }}</p>
      } @else {
        <div class="overflow-x-auto">
          <p-table appTableStandard [value]="executions()" styleClass="p-datatable-sm" [rows]="10"
                   [sortField]="'executedAt'" [sortOrder]="-1">
            <ng-template pTemplate="header">
              <tr>
                <th>{{ 'common.status' | translate }}</th>
                <th pSortableColumn="executedAt">{{ 'automationRules.executedAt' | translate }} <p-sortIcon field="executedAt"></p-sortIcon></th>
                <th>{{ 'automationRules.detail' | translate }}</th>
              </tr>
            </ng-template>
            <ng-template pTemplate="body" let-e>
              <tr>
                <td><app-tag-badge [value]="e.status" [severity]="e.status === 'SUCCESS' ? 'success' : e.status === 'FAILED' ? 'danger' : 'secondary'"></app-tag-badge></td>
                <td class="whitespace-nowrap">{{ e.executedAt | date:'medium' }}</td>
                <td class="text-xs text-app-text-secondary">{{ e.detail ?? ('automationRules.noDetail' | translate) }}</td>
              </tr>
            </ng-template>
          </p-table>
        </div>
      }
    </p-dialog>
  `,
  styles: [`
    @reference "../../../styles.css";
    .label { @apply block text-[11px] font-medium text-app-text-secondary mb-1.5; }
    .step-num {
      @apply w-7 h-7 rounded-full bg-app-accent-soft text-app-accent-hover text-xs font-semibold
             flex items-center justify-center shrink-0;
    }
    .step-line { @apply flex-1 w-px bg-app-border my-1; min-height: 0.5rem; }
  `],
})
export class AutomationRulesComponent implements OnInit {
  private automationRuleService = inject(AutomationRuleService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);
  private translate = inject(TranslateService);
  private destroyRef = inject(DestroyRef);
  private customerService = inject(CustomerService);

  rules = signal<AutomationRule[]>([]);
  loadingRules = signal(false);
  rulesEmpty = computed(() => !this.loadingRules() && this.rules().length === 0);
  deletingRuleId = signal<string | null>(null);

  ruleDialogVisible = signal(false);
  activeRule = signal<AutomationRule | null>(null);
  saving = signal(false);

  testDrawerVisible = signal(false);
  testingRule = signal<AutomationRule | null>(null);
  previewAggregateId = '';
  previewResult = signal<PreviewResult | null>(null);

  executions = signal<AutomationExecution[]>([]);
  historyDialogVisible = signal(false);

  readonly ruleForm = new FormGroup({
    name: new FormControl('', { nonNullable: true }),
    description: new FormControl('', { nonNullable: true }),
    trigger: new FormControl<string>(TRIGGER_EVENTS[0], { nonNullable: true }),
    matchType: new FormControl<ConditionMatchType>('ALL', { nonNullable: true }),
    conditions: new FormArray<ConditionGroup>([]),
    actions: new FormArray<ActionGroup>([]),
  });

  private static readonly TRIGGER_KEY: Record<string, string> = {
    'quotation.approved': 'quotationApproved',
    'quotation.declined': 'quotationDeclined',
    'order.finished': 'orderFinished',
    'automation.rule.executed': 'automationRuleExecuted',
    'lead.created': 'leadCreated',
    'lead.status_changed': 'leadStatusChanged',
    'lead.lost': 'leadLost',
  };

  triggerOptions: { label: string; value: string }[] = [];
  matchTypeOptions: { label: string; value: ConditionMatchType }[] = [];
  actionTypeOptions: { label: string; value: ActionType }[] = [];

  /** Campos oferecidos às condições de cada gatilho — vêm do backend, que é quem os valida. */
  private catalog = signal<Record<string, CatalogField[]>>({});
  private trigger = signal<string>(TRIGGER_EVENTS[0]);
  private customerTriggers = signal<string[]>([]);
  private messageVariables = signal<Record<string, string[]>>({});

  /** Só gatilhos cujo evento traz um cliente permitem enviar o email "para o cliente". */
  private canNotifyCustomer = computed(() => this.customerTriggers().includes(this.trigger()));

  recipientOptions = computed(() => {
    const options: { label: string; value: ActionRecipient }[] = [
      { label: this.translate.instant('automationRules.recipients.ADDRESS'), value: 'ADDRESS' },
    ];
    if (this.canNotifyCustomer()) {
      options.unshift({ label: this.translate.instant('automationRules.recipients.CUSTOMER'), value: 'CUSTOMER' });
    }
    return options;
  });

  constructor() {
    this.ruleForm.controls.trigger.valueChanges.pipe(takeUntilDestroyed()).subscribe(trigger => {
      this.trigger.set(trigger);
      // Os campos mudam com o gatilho: condições do gatilho anterior deixariam de ter sentido.
      this.ruleForm.controls.conditions.clear();
      // Sem cliente no evento, "enviar ao cliente" deixa de ser possível.
      if (!this.canNotifyCustomer()) {
        this.ruleForm.controls.actions.controls
          .filter(a => a.controls.recipient.value === 'CUSTOMER')
          .forEach(a => a.controls.recipient.setValue('ADDRESS'));
      }
      this.ruleForm.controls.actions.controls.forEach(a => this.applyEmailTemplate(a));
    });
  }

  ngOnInit(): void {
    this.customerSearch$.pipe(debounceTime(300), distinctUntilChanged(),
      switchMap(term => this.customerService.list({ active: true, size: 20, search: term })),
      takeUntilDestroyed(this.destroyRef))
      .subscribe(res => this.mergeCustomers(res.content.map(c => ({ label: c.name, value: c.id }))));
    this.buildOptions();
    this.loadCatalog();
    this.loadRules();
  }

  private loadCatalog(): void {
    this.automationRuleService.catalog().subscribe({
      next: res => { this.catalog.set(res.triggers); this.customerTriggers.set(res.customerRecipientTriggers);
        this.messageVariables.set(res.messageVariables); },
      error: () => this.messageService.add({ severity: 'error', summary: this.translate.instant('automationRules.loadError') }),
    });
  }

  private triggerDomain(): string {
    return this.trigger().split('.')[0];
  }

  private currentFields = computed(() => this.catalog()[this.trigger()] ?? []);

  fieldOptions = computed(() => this.currentFields().map(f => ({
    label: this.translate.instant(`automationRules.fields.${this.triggerDomain()}.${f.key}`), value: f.key,
  })));

  ruleOptions = computed(() => this.rules()
    .filter(r => r.id !== this.activeRule()?.id)
    .map(r => ({ label: r.name, value: r.id })));

  /** Clientes carregados por pesquisa no servidor; os já usados em condições entram para o rótulo aparecer. */
  customerOptions = signal<{ label: string; value: string }[]>([]);
  private customerSearch$ = new Subject<string>();

  searchCustomers(term: string): void {
    this.customerSearch$.next(term ?? '');
  }

  private mergeCustomers(found: { label: string; value: string }[]): void {
    const known = new Map(this.customerOptions().map(o => [o.value, o]));
    found.forEach(o => known.set(o.value, o));
    this.customerOptions.set([...known.values()]);
  }

  /** Lista inicial + nome dos clientes já escolhidos ao editar (o backend só guarda o id). */
  private loadCustomers(selectedIds: string[] = []): void {
    this.customerService.list({ active: true, size: 20 }).subscribe(res =>
      this.mergeCustomers(res.content.map(c => ({ label: c.name, value: c.id }))));
    selectedIds.forEach(id => this.customerService.get(id).subscribe({
      next: c => this.mergeCustomers([{ label: c.name, value: c.id }]),
      error: () => this.mergeCustomers([{ label: id, value: id }]),
    }));
  }

  fieldDef(c: ConditionGroup): CatalogField | undefined {
    return this.currentFields().find(f => f.key === c.controls.field.value);
  }

  operatorOptionsFor(c: ConditionGroup): { label: string; value: ConditionOperator }[] {
    return (this.fieldDef(c)?.operators ?? []).map(op => ({
      label: this.translate.instant(`automationRules.operators.${op}`), value: op,
    }));
  }

  valueOptionsFor(c: ConditionGroup): { label: string; value: string }[] {
    const def = this.fieldDef(c);
    return (def?.options ?? []).map(code => ({
      label: this.translate.instant(`automationRules.enumValues.${this.triggerDomain()}.${def!.key}.${code}`, { defaultValue: code }),
      value: code,
    }));
  }

  /** Trocar de campo invalida operador e valor: cada tipo aceita operadores e valores diferentes. */
  onFieldChange(c: ConditionGroup): void {
    const def = this.fieldDef(c);
    c.patchValue({ operator: def?.operators[0] ?? 'EQUALS', value: '' });
  }

  triggerLabel(event: string): string {
    const key = AutomationRulesComponent.TRIGGER_KEY[event];
    return key ? this.translate.instant(`automationRules.triggers.${key}`) : event;
  }

  actionTypeLabel(type: ActionType): string {
    return this.translate.instant(`automationRules.actionTypes.${type}`);
  }

  targetPlaceholder(type: ActionType): string {
    return this.translate.instant(`automationRules.targetPlaceholders.${type}`);
  }

  ruleConditionsSummary(rule: AutomationRule): string {
    const count = rule.conditions?.length ?? 0;
    if (count === 0) return this.translate.instant('automationRules.alwaysRuns');
    return count === 1
      ? this.translate.instant('automationRules.conditionSingular')
      : this.translate.instant('automationRules.conditionPlural', { count });
  }

  ruleActionsSummary(rule: AutomationRule): string {
    const actions = rule.actions ?? [];
    if (actions.length === 0) return this.translate.instant('automationRules.noActions');
    return actions.map(a => this.actionTypeLabel(a.actionType)).join(', ');
  }

  draftConditionsSummary(): string {
    const count = this.ruleForm.controls.conditions.length;
    if (count === 0) return '';
    const countLabel = count === 1
      ? this.translate.instant('automationRules.conditionSingular')
      : this.translate.instant('automationRules.conditionPlural', { count });
    if (count === 1) return countLabel;
    const connector = this.translate.instant(this.ruleForm.controls.matchType.value === 'ALL' ? 'automationRules.connectorAnd' : 'automationRules.connectorOr');
    return `${countLabel} (${connector})`;
  }

  private buildConditionGroup(c: RuleCondition): ConditionGroup {
    return new FormGroup({
      field: new FormControl(c.field, { nonNullable: true }),
      operator: new FormControl<ConditionOperator>(c.operator, { nonNullable: true }),
      value: new FormControl(c.value, { nonNullable: true }),
    });
  }

  private buildActionGroup(a: RuleAction): ActionGroup {
    return new FormGroup({
      subject: new FormControl(a.subject ?? '', { nonNullable: true }),
      message: new FormControl(a.message ?? '', { nonNullable: true }),
      actionType: new FormControl<ActionType>(a.actionType, { nonNullable: true }),
      recipient: new FormControl<ActionRecipient>(
        a.actionType === 'SEND_EMAIL' && !a.target ? 'CUSTOMER' : 'ADDRESS', { nonNullable: true }),
      target: new FormControl(a.target ?? '', { nonNullable: true }),
    });
  }

  /** Cada tipo de ação usa um destino diferente (ou nenhum): trocar de tipo descarta o destino anterior. */
  onActionTypeChange(a: ActionGroup): void {
    a.patchValue({ recipient: this.defaultRecipient(), target: '', subject: '', message: '' });
    this.applyEmailTemplate(a);
  }

  /** Variáveis que o gatilho atual oferece ao assunto e à mensagem (vêm do backend). */
  messageVariablesForTrigger = computed(() => this.messageVariables()[this.trigger()] ?? []);

  variableLabel(name: string): string {
    return this.translate.instant(`automationRules.variables.${name}`);
  }

  private emailFocus = new Map<ActionGroup, 'subject' | 'message'>();

  focusEmailField(a: ActionGroup, field: 'subject' | 'message'): void {
    this.emailFocus.set(a, field);
  }

  /** Acrescenta {{variável}} ao campo (assunto ou mensagem) onde o utilizador estava. */
  insertVariable(a: ActionGroup, name: string): void {
    const control = a.controls[this.emailFocus.get(a) ?? 'message'];
    control.setValue(`${control.value}{{${name}}}`);
    control.markAsDirty();
  }

  /**
   * Preenche assunto e mensagem com o texto sugerido para o gatilho e o destinatário — mas só se o
   * utilizador ainda não escreveu nada (vazios ou ainda iguais a alguma sugestão): nunca sobrescreve
   * texto próprio ao trocar de destinatário ou de gatilho.
   */
  applyEmailTemplate(a: ActionGroup): void {
    if (a.controls.actionType.value !== 'SEND_EMAIL') return;
    const untouched = (v: string) => !v.trim() || this.suggestedTexts().has(v.trim());
    if (!untouched(a.controls.subject.value) || !untouched(a.controls.message.value)) return;
    const key = AutomationRulesComponent.TRIGGER_KEY[this.trigger()];
    const kind = a.controls.recipient.value === 'CUSTOMER' ? 'customer' : 'internal';
    const pick = (field: 'subject' | 'message') => {
      for (const k of [kind, 'internal']) {
        const path = `automationRules.emailTemplates.${key}.${k}.${field}`;
        const text = this.translate.instant(path);
        if (text && text !== path) return text as string;
      }
      return '';
    };
    a.patchValue({ subject: pick('subject'), message: pick('message') });
  }

  private suggestedTexts(): Set<string> {
    const out = new Set<string>();
    const walk = (node: unknown): void => {
      if (typeof node === 'string') out.add(node.trim());
      else if (node && typeof node === 'object') Object.values(node).forEach(walk);
    };
    walk(this.translate.instant('automationRules.emailTemplates'));
    return out;
  }

  private defaultRecipient(): ActionRecipient {
    return this.canNotifyCustomer() ? 'CUSTOMER' : 'ADDRESS';
  }

  private buildOptions(): void {
    const t = (key: string) => this.translate.instant(key);
    this.triggerOptions = TRIGGER_EVENTS.map(e => ({ label: t(`automationRules.triggers.${AutomationRulesComponent.TRIGGER_KEY[e]}`), value: e }));
    this.matchTypeOptions = ['ALL', 'ANY'].map(v => ({ label: t(`automationRules.matchTypes.${v}`), value: v as ConditionMatchType }));
    this.actionTypeOptions = (['SEND_EMAIL', 'SEND_PUSH', 'WEBHOOK'] as ActionType[])
      .map(v => ({ label: t(`automationRules.actionTypes.${v}`), value: v }));
  }

  loadRules(): void {
    this.loadingRules.set(true);
    this.automationRuleService.listRules().subscribe({
      next: res => { this.rules.set(res.content); this.loadingRules.set(false); },
      error: () => {
        this.loadingRules.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('automationRules.loadError') });
      },
    });
  }

  openNewRule(): void {
    this.ruleForm.reset({ name: '', description: '', trigger: TRIGGER_EVENTS[0], matchType: 'ALL' });
    this.ruleForm.controls.conditions.clear();
    this.ruleForm.controls.actions.clear();
    this.ruleForm.controls.trigger.enable({ emitEvent: false });
    this.loadCustomers();
    this.activeRule.set({ id: '' } as AutomationRule);
    this.ruleDialogVisible.set(true);
  }

  openEditRule(rule: AutomationRule): void {
    this.automationRuleService.getRule(rule.id).subscribe(full => {
      this.ruleForm.reset({
        name: full.name, description: full.description ?? '', trigger: full.triggerEvent, matchType: full.matchType,
      });
      this.ruleForm.controls.conditions.clear();
      full.conditions.forEach(c => this.ruleForm.controls.conditions.push(this.buildConditionGroup(c)));
      this.ruleForm.controls.actions.clear();
      full.actions.forEach(a => this.ruleForm.controls.actions.push(this.buildActionGroup(a)));
      this.ruleForm.controls.trigger.disable({ emitEvent: false });
      this.loadCustomers(full.conditions.filter(c => c.field === 'customerId').map(c => c.value));
      this.activeRule.set(full);
      this.ruleDialogVisible.set(true);
    });
  }

  addCondition(): void {
    const first = this.currentFields()[0];
    this.ruleForm.controls.conditions.push(this.buildConditionGroup({
      field: first?.key ?? '', operator: first?.operators[0] ?? 'EQUALS', value: '',
    }));
  }

  removeCondition(index: number): void {
    this.ruleForm.controls.conditions.removeAt(index);
  }

  addAction(): void {
    const group = this.buildActionGroup({
      actionType: 'SEND_EMAIL', target: this.canNotifyCustomer() ? null : '',
    });
    this.ruleForm.controls.actions.push(group);
    this.applyEmailTemplate(group);
  }

  removeAction(index: number): void {
    this.ruleForm.controls.actions.removeAt(index);
  }

  saveRule(): void {
    const value = this.ruleForm.getRawValue();
    const name = value.name.trim();
    if (!name) {
      this.messageService.add({ severity: 'warn', summary: this.translate.instant('automationRules.nameRequired') });
      return;
    }
    if (value.conditions.some(c => !c.field || !c.value.toString().trim())) {
      this.messageService.add({ severity: 'warn', summary: this.translate.instant('automationRules.conditionIncomplete') });
      return;
    }
    const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    const badAction = value.actions.find(a =>
      (a.actionType === 'SEND_EMAIL' && a.recipient === 'ADDRESS' && !emailPattern.test(a.target.trim()))
      || (a.actionType === 'WEBHOOK' && !/^https?:\/\/\S+$/i.test(a.target.trim())));
    if (!badAction && value.actions.some(a => a.actionType === 'SEND_EMAIL' && (!a.subject.trim() || !a.message.trim()))) {
      this.messageService.add({ severity: 'warn', summary: this.translate.instant('automationRules.emailMessageRequired') });
      return;
    }
    if (badAction) {
      this.messageService.add({ severity: 'warn', summary: this.translate.instant(
        badAction.actionType === 'WEBHOOK' ? 'automationRules.webhookInvalid' : 'automationRules.emailInvalid') });
      return;
    }
    this.saving.set(true);
    const conditions = value.conditions.map(c => ({ ...c, value: c.value.toString().trim() }));
    const actions: RuleAction[] = value.actions.map(a => ({
      actionType: a.actionType,
      target: a.actionType === 'SEND_PUSH' || (a.actionType === 'SEND_EMAIL' && a.recipient === 'CUSTOMER')
        ? null : a.target.trim(),
      subject: a.actionType === 'SEND_EMAIL' ? a.subject.trim() : null,
      message: a.actionType === 'SEND_EMAIL' ? a.message.trim() : null,
    }));
    const existing = this.activeRule();
    const request$ = existing?.id
      ? this.automationRuleService.updateRule(existing.id, {
          name, description: value.description || null,
          matchType: value.matchType, conditions, actions,
        })
      : this.automationRuleService.createRule({
          name, description: value.description || null,
          triggerEvent: value.trigger, matchType: value.matchType, conditions, actions,
        });
    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.ruleDialogVisible.set(false);
        this.activeRule.set(null);
        this.loadRules();
        this.messageService.add({ severity: 'success', summary: this.translate.instant('automationRules.saved') });
      },
      error: (err) => {
        this.saving.set(false);
        this.messageService.add({ severity: 'error', summary: err?.error?.detail ?? this.translate.instant('automationRules.saveError') });
      },
    });
  }

  toggleRuleActive(rule: AutomationRule, active: boolean): void {
    this.automationRuleService.setRuleActive(rule.id, active).subscribe({
      next: () => this.loadRules(),
      error: () => this.loadRules(),
    });
  }

  confirmDeleteRule(rule: AutomationRule): void {
    this.confirmationService.confirm({
      message: this.translate.instant('automationRules.deleteConfirm', { name: rule.name }),
      header: this.translate.instant('automationRules.deleteConfirmTitle'),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.translate.instant('automationRules.deleteConfirmAccept'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => this.deleteRule(rule),
    });
  }

  private deleteRule(rule: AutomationRule): void {
    if (this.deletingRuleId()) return;
    this.deletingRuleId.set(rule.id);
    this.automationRuleService.deleteRule(rule.id).subscribe({
      next: () => {
        this.deletingRuleId.set(null);
        this.loadRules();
        this.messageService.add({ severity: 'success', summary: this.translate.instant('automationRules.deleted') });
      },
      error: (err) => {
        this.deletingRuleId.set(null);
        this.messageService.add({ severity: 'error', summary: err?.error?.detail ?? this.translate.instant('automationRules.deleteError') });
      },
    });
  }

  openHistory(rule: AutomationRule): void {
    this.automationRuleService.executions(rule.id).subscribe(res => {
      this.executions.set(res.content);
      this.historyDialogVisible.set(true);
    });
  }

  openTest(rule: AutomationRule): void {
    this.testingRule.set(rule);
    this.previewAggregateId = '';
    this.previewResult.set(null);
    this.testDrawerVisible.set(true);
  }

  runPreview(): void {
    const rule = this.testingRule();
    if (!rule?.id || !this.previewAggregateId.trim()) return;
    this.automationRuleService.previewRule(rule.id, this.previewAggregateId).subscribe({
      next: res => this.previewResult.set(res),
      error: (err) => this.messageService.add({ severity: 'error', summary: err?.error?.detail ?? this.translate.instant('automationRules.previewError') }),
    });
  }
}
