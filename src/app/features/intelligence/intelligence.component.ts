import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { debounceTime } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { TabsModule } from 'primeng/tabs';
import { SelectModule } from 'primeng/select';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ProgressBarModule } from 'primeng/progressbar';
import { ConfirmationService, MessageService } from 'primeng/api';
import {
  AiActionType, AiDecision, AiDecisionStatus, AiPolicy, AiRiskLevel, AiUsage, IntelligenceService,
} from '../../core/services/intelligence.service';
import { AuthService } from '../../core/auth/auth.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { TagBadgeComponent, BadgeSeverity } from '../../shared/components/tag-badge/tag-badge.component';
import { LocalizedDatePipe } from '../../shared/pipes/localized-date.pipe';

type PolicyRow = FormGroup<{
  actionType: FormControl<AiActionType>;
  riskLevel: FormControl<AiRiskLevel>;
  autoExecute: FormControl<boolean>;
}>;

const PUBLIC_TABS = ['queue', 'history'];
const TABS = [...PUBLIC_TABS, 'policies', 'usage'];
const RISK_ORDER: AiRiskLevel[] = ['LOW', 'MEDIUM', 'HIGH'];
const HISTORY_STATUSES: AiDecisionStatus[] =
  ['EXECUTED', 'REJECTED', 'EXPIRED', 'FAILED', 'RECOMMENDED', 'APPROVED'];
const UNLIMITED = -1;

/**
 * Central de ações da IA (issues #129/#131): fila de aprovação com o impacto à vista, histórico de
 * decisões com quem, quando e o quê, política de risco por tipo de ação e consumo de créditos. Só
 * mostra o que o backend devolve — quem pode decidir cada ação (`canDecide`), o risco efetivo e o
 * efeito da política vêm decididos do domínio; aqui não há regra recalculada.
 */
@Component({
  selector: 'app-intelligence',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe, DecimalPipe, ButtonModule, TableModule,
    TabsModule, SelectModule, ToggleSwitchModule, ProgressBarModule, PageHeaderComponent, EmptyStateComponent,
    TagBadgeComponent, LocalizedDatePipe],
  template: `
    <app-page-header [title]="'intelligence.title' | translate" [description]="'intelligence.subtitle' | translate">
    </app-page-header>

    @if (usage(); as u) {
      @if (u.creditsLimit === 0) {
        <div class="mb-6 flex items-center justify-between gap-4 rounded-xl border border-app-border bg-app-bg p-4">
          <div class="flex items-start gap-3">
            <i class="pi pi-lock text-app-text-tertiary text-lg mt-0.5" aria-hidden="true"></i>
            <p class="text-sm text-app-text">{{ 'intelligence.closedPlan' | translate }}</p>
          </div>
          <p-button [label]="'intelligence.seePlans' | translate" size="small" routerLink="/subscription" />
        </div>
      } @else if (u.exhausted) {
        <div class="mb-6 flex items-start gap-3 rounded-xl border border-app-border bg-app-bg p-4">
          <i class="pi pi-exclamation-triangle text-app-warning text-lg mt-0.5" aria-hidden="true"></i>
          <p class="text-sm text-app-text">{{ 'intelligence.creditsExhausted' | translate }}</p>
        </div>
      }
    }

    <p-tabs [value]="activeTab()" (valueChange)="onTabChange($event)">
      <p-tablist>
        <p-tab value="queue">
          {{ 'intelligence.tabQueue' | translate }}
          @if (pendingCount() > 0) {
            <span class="ml-2 rounded-full bg-app-warning/20 px-2 py-0.5 text-xs font-medium text-app-text">{{ pendingCount() }}</span>
          }
        </p-tab>
        <p-tab value="history">{{ 'intelligence.tabHistory' | translate }}</p-tab>
        @if (isManager()) {
          <p-tab value="policies">{{ 'intelligence.tabPolicies' | translate }}</p-tab>
          <p-tab value="usage">{{ 'intelligence.tabUsage' | translate }}</p-tab>
        }
      </p-tablist>

      <p-tabpanels>
        <p-tabpanel value="queue">
          <div class="space-y-4 pt-4">
            @if (queueLoaded() && queue().length === 0) {
              <app-empty-state icon="pi pi-check-circle" [message]="'intelligence.queueEmpty' | translate"
                               [subtitle]="'intelligence.queueEmptySubtitle' | translate"></app-empty-state>
            }
            @for (d of queue(); track d.id) {
              <article class="rounded-xl border border-app-border bg-app-bg p-5 space-y-3">
                <header class="flex flex-wrap items-center gap-2">
                  <app-tag-badge [value]="('intelligence.agent.' + d.agent) | translate" severity="secondary"></app-tag-badge>
                  @if (d.actionType) {
                    <app-tag-badge [value]="('intelligence.action.' + d.actionType) | translate" severity="info"></app-tag-badge>
                  }
                  <app-tag-badge [value]="('intelligence.risk.' + d.riskLevel) | translate" [severity]="riskSeverity(d.riskLevel)"></app-tag-badge>
                  <span class="ml-auto text-xs text-app-text-tertiary">
                    {{ 'intelligence.expiresAt' | translate }}: {{ d.expiresAt | localizedDate: 'datetime' }}
                  </span>
                </header>

                <p class="text-sm font-medium text-app-text">{{ d.recommendation }}</p>
                @if (d.reason) {
                  <p class="text-sm text-app-text-secondary">{{ d.reason }}</p>
                }
                @if (d.estimatedImpact) {
                  <p class="rounded-lg bg-app-surface px-3 py-2 text-sm text-app-text">
                    <span class="font-medium">{{ 'intelligence.impact' | translate }}:</span> {{ d.estimatedImpact }}
                  </p>
                }
                <div class="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-app-text-tertiary">
                  @if (d.confidence !== null) {
                    <span>{{ 'intelligence.confidence' | translate }}: {{ d.confidence * 100 | number: '1.0-0' }}%</span>
                  }
                  <span>{{ 'intelligence.createdAt' | translate }}: {{ d.createdAt | localizedDate: 'datetime' }}</span>
                </div>

                <footer class="flex flex-wrap justify-end gap-2 pt-1">
                  @if (d.canDecide) {
                    <p-button [label]="'intelligence.reject' | translate" severity="secondary" [outlined]="true" size="small"
                              [loading]="busyId() === d.id" (onClick)="confirmReject(d)" />
                    <p-button [label]="'intelligence.approve' | translate" size="small" [loading]="busyId() === d.id"
                              (onClick)="confirmApprove(d)" />
                  } @else {
                    <span class="text-xs text-app-text-tertiary">{{ 'intelligence.cannotDecide' | translate }}</span>
                  }
                </footer>
              </article>
            }
          </div>
        </p-tabpanel>

        <p-tabpanel value="history">
          <div class="space-y-4 pt-4">
            <div class="flex items-center gap-3">
              <p-select [formControl]="historyStatus" [options]="historyOptions()" optionLabel="label" optionValue="value"
                        [showClear]="true" appendTo="body" [placeholder]="'intelligence.allStatuses' | translate" class="w-64"
                        (onChange)="reloadHistory()" (onClear)="reloadHistory()" />
            </div>
            <p-table [value]="history()" [lazy]="true" [paginator]="true" [rows]="pageSize" [totalRecords]="historyTotal()"
                     [loading]="historyLoading()" styleClass="p-datatable-sm" (onLazyLoad)="loadHistory($event)">
              <ng-template pTemplate="header">
                <tr>
                  <th>{{ 'intelligence.createdAt' | translate }}</th>
                  <th>{{ 'intelligence.colAgent' | translate }}</th>
                  <th>{{ 'intelligence.recommendation' | translate }}</th>
                  <th>{{ 'intelligence.colStatus' | translate }}</th>
                  <th>{{ 'intelligence.decidedAt' | translate }}</th>
                </tr>
              </ng-template>
              <ng-template pTemplate="body" let-d>
                <tr>
                  <td class="whitespace-nowrap">{{ d.createdAt | localizedDate: 'datetime' }}</td>
                  <td>
                    {{ ('intelligence.agent.' + d.agent) | translate }}
                    @if (d.actionType) {
                      <span class="block text-xs text-app-text-tertiary">{{ ('intelligence.action.' + d.actionType) | translate }}</span>
                    }
                  </td>
                  <td class="max-w-md">
                    <span class="block text-sm text-app-text">{{ d.recommendation }}</span>
                    @if (d.failureReason) {
                      <span class="block text-xs text-app-danger">{{ d.failureReason }}</span>
                    }
                  </td>
                  <td><app-tag-badge [value]="('intelligence.status.' + d.status) | translate" [severity]="statusSeverity(d.status)"></app-tag-badge></td>
                  <td class="whitespace-nowrap text-xs text-app-text-secondary">
                    @if (d.decidedAt) {
                      {{ d.decidedAt | localizedDate: 'datetime' }}
                      <span class="block">{{ (d.autoExecuted ? 'intelligence.byPolicy' : 'intelligence.byPerson') | translate }}</span>
                    } @else {
                      —
                    }
                  </td>
                </tr>
              </ng-template>
              <ng-template pTemplate="emptymessage">
                <tr><td colspan="5" class="text-center text-app-text-tertiary py-8">{{ 'intelligence.historyEmpty' | translate }}</td></tr>
              </ng-template>
            </p-table>
          </div>
        </p-tabpanel>

        @if (isManager()) {
          <p-tabpanel value="policies">
            <div class="space-y-4 pt-4">
              <p class="text-sm text-app-text-secondary max-w-3xl">{{ 'intelligence.policiesHelp' | translate }}</p>
              <p-table [value]="policyForms.controls" styleClass="p-datatable-sm">
                <ng-template pTemplate="header">
                  <tr>
                    <th>{{ 'intelligence.colAction' | translate }}</th>
                    <th>{{ 'intelligence.colBaseRisk' | translate }}</th>
                    <th>{{ 'intelligence.colRisk' | translate }}</th>
                    <th>{{ 'intelligence.colAutoExecute' | translate }}</th>
                    <th>{{ 'intelligence.colEffect' | translate }}</th>
                  </tr>
                </ng-template>
                <ng-template pTemplate="body" let-row let-i="rowIndex">
                  <tr [formGroup]="row">
                    <td class="font-medium text-app-text">{{ ('intelligence.action.' + row.controls.actionType.value) | translate }}</td>
                    <td><app-tag-badge [value]="('intelligence.risk.' + policies()[i].defaultRisk) | translate" [severity]="riskSeverity(policies()[i].defaultRisk)"></app-tag-badge></td>
                    <td>
                      <p-select formControlName="riskLevel" [options]="riskOptions(policies()[i].defaultRisk)" optionLabel="label"
                                optionValue="value" appendTo="body" class="w-40" [readonly]="!isOwner()" />
                    </td>
                    <td><p-toggleswitch formControlName="autoExecute" [readonly]="!isOwner()" /></td>
                    <td class="text-sm text-app-text-secondary">
                      {{ (policies()[i].effectiveAutoExecute ? 'intelligence.effectAuto' : 'intelligence.effectApproval') | translate }}
                    </td>
                  </tr>
                </ng-template>
              </p-table>
              @if (!isOwner()) {
                <p class="text-xs text-app-text-tertiary">{{ 'intelligence.policiesOwnerOnly' | translate }}</p>
              }
            </div>
          </p-tabpanel>

          <p-tabpanel value="usage">
            <div class="space-y-6 pt-4">
              @if (usage(); as u) {
                <section class="rounded-xl border border-app-border bg-app-bg p-5 space-y-3 max-w-2xl">
                  <h3 class="text-xs font-semibold text-app-text-tertiary uppercase tracking-wide">{{ 'intelligence.credits' | translate }}</h3>
                  @if (u.creditsLimit === 0) {
                    <p class="text-sm text-app-text-secondary">{{ 'intelligence.closedPlan' | translate }}</p>
                  } @else {
                    <p class="text-2xl font-semibold text-app-text">
                      {{ u.creditsUsed | number: '1.0-0' }}
                      <span class="text-sm font-normal text-app-text-tertiary">
                        / {{ u.creditsLimit === unlimited ? ('intelligence.unlimited' | translate) : (u.creditsLimit | number: '1.0-0') }}
                      </span>
                    </p>
                    @if (u.creditsLimit !== unlimited) {
                      <p-progressbar [value]="creditsPercent()" [showValue]="false" [style]="{ height: '0.5rem' }" />
                    }
                    <p class="text-xs text-app-text-tertiary">
                      {{ 'intelligence.cycleSince' | translate }} {{ u.windowStart | localizedDate }}
                    </p>
                  }
                  @if (!u.modelAvailable) {
                    <p class="text-xs text-app-text-tertiary">{{ 'intelligence.modelOffline' | translate }}</p>
                  }
                </section>

                @if (u.byAgent.length > 0) {
                  <p-table [value]="u.byAgent" styleClass="p-datatable-sm">
                    <ng-template pTemplate="header">
                      <tr>
                        <th>{{ 'intelligence.colAgent' | translate }}</th>
                        <th class="text-right">{{ 'intelligence.colCalls' | translate }}</th>
                        <th class="text-right">{{ 'intelligence.colTokens' | translate }}</th>
                        <th class="text-right">{{ 'intelligence.colCredits' | translate }}</th>
                      </tr>
                    </ng-template>
                    <ng-template pTemplate="body" let-a>
                      <tr>
                        <td>{{ ('intelligence.agent.' + a.agent) | translate }}</td>
                        <td class="text-right">{{ a.calls | number }}</td>
                        <td class="text-right">{{ a.inputTokens + a.outputTokens | number }}</td>
                        <td class="text-right">{{ a.credits | number }}</td>
                      </tr>
                    </ng-template>
                  </p-table>
                } @else {
                  <app-empty-state icon="pi pi-chart-bar" [message]="'intelligence.usageEmpty' | translate"></app-empty-state>
                }
              }
            </div>
          </p-tabpanel>
        }
      </p-tabpanels>
    </p-tabs>
  `,
})
export class IntelligenceComponent implements OnInit {
  private readonly service = inject(IntelligenceService);
  private readonly auth = inject(AuthService);
  private readonly translate = inject(TranslateService);
  private readonly messages = inject(MessageService);
  private readonly confirmation = inject(ConfirmationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly pageSize = 20;
  readonly unlimited = UNLIMITED;

  activeTab = signal<string>('queue');
  queue = signal<AiDecision[]>([]);
  queueLoaded = signal(false);
  pendingCount = signal(0);
  history = signal<AiDecision[]>([]);
  historyTotal = signal(0);
  historyLoading = signal(false);
  policies = signal<AiPolicy[]>([]);
  usage = signal<AiUsage | null>(null);
  busyId = signal<string | null>(null);

  historyStatus = new FormControl<AiDecisionStatus | null>(null);
  policyForms = new FormArray<PolicyRow>([]);

  isManager = computed(() => ['OWNER', 'ADMIN'].includes(this.auth.userRole() ?? ''));
  isOwner = computed(() => this.auth.userRole() === 'OWNER');

  creditsPercent = computed(() => {
    const u = this.usage();
    return u && u.creditsLimit > 0 ? Math.min(100, Math.round((u.creditsUsed / u.creditsLimit) * 100)) : 0;
  });

  historyOptions = computed(() => HISTORY_STATUSES.map(s => ({
    value: s, label: this.translate.instant('intelligence.status.' + s),
  })));

  ngOnInit() {
    const tab = this.route.snapshot.queryParamMap.get('tab') ?? '';
    const allowed = this.isManager() ? TABS : PUBLIC_TABS;
    if (allowed.includes(tab)) this.activeTab.set(tab);
    this.loadQueue();
    if (this.isManager()) {
      this.loadPolicies();
      this.loadUsage();
    }
  }

  onTabChange(value: string | number | undefined) {
    const tab = String(value ?? 'queue');
    this.activeTab.set(tab);
    this.router.navigate([], { queryParams: { tab }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  riskOptions(base: AiRiskLevel) {
    return RISK_ORDER.filter(r => RISK_ORDER.indexOf(r) >= RISK_ORDER.indexOf(base))
      .map(r => ({ value: r, label: this.translate.instant('intelligence.risk.' + r) }));
  }

  riskSeverity(risk: AiRiskLevel): BadgeSeverity {
    return risk === 'HIGH' ? 'danger' : risk === 'MEDIUM' ? 'warn' : 'success';
  }

  statusSeverity(status: AiDecisionStatus): BadgeSeverity {
    switch (status) {
      case 'EXECUTED': return 'success';
      case 'FAILED': return 'danger';
      case 'REJECTED': case 'EXPIRED': return 'secondary';
      case 'PENDING_APPROVAL': return 'warn';
      default: return 'info';
    }
  }

  loadQueue() {
    this.service.listDecisions('PENDING_APPROVAL', 0, 50).subscribe({
      next: page => {
        this.queue.set(page.content);
        this.pendingCount.set(page.page.totalElements);
        this.queueLoaded.set(true);
      },
      error: () => this.fail('intelligence.loadError'),
    });
  }

  loadHistory(event: TableLazyLoadEvent) {
    const page = Math.floor((event.first ?? 0) / (event.rows ?? this.pageSize));
    this.fetchHistory(page);
  }

  reloadHistory() {
    this.fetchHistory(0);
  }

  private fetchHistory(page: number) {
    this.historyLoading.set(true);
    this.service.listDecisions(this.historyStatus.value, page, this.pageSize).subscribe({
      next: result => {
        this.history.set(result.content);
        this.historyTotal.set(result.page.totalElements);
        this.historyLoading.set(false);
      },
      error: () => {
        this.historyLoading.set(false);
        this.fail('intelligence.loadError');
      },
    });
  }

  private loadPolicies() {
    this.service.listPolicies().subscribe({
      next: policies => {
        this.policies.set(policies);
        this.policyForms.clear();
        policies.forEach((p, index) => {
          const row: PolicyRow = new FormGroup({
            actionType: new FormControl(p.actionType, { nonNullable: true }),
            riskLevel: new FormControl<AiRiskLevel>(p.effectiveRisk, { nonNullable: true }),
            autoExecute: new FormControl(p.effectiveAutoExecute, { nonNullable: true }),
          });
          row.valueChanges.pipe(debounceTime(300)).subscribe(() => this.savePolicy(row, index));
          this.policyForms.push(row);
        });
      },
      error: () => this.fail('intelligence.loadError'),
    });
  }

  private loadUsage() {
    this.service.usage().subscribe({
      next: u => this.usage.set(u),
      error: () => this.fail('intelligence.loadError'),
    });
  }

  savePolicy(row: PolicyRow, index: number) {
    const value = row.getRawValue();
    this.busyId.set(value.actionType);
    this.service.setPolicy(value.actionType, value.riskLevel, value.autoExecute).subscribe({
      next: saved => {
        this.policies.update(list => list.map((p, i) => (i === index ? saved : p)));
        // emitEvent:false — o reset não pode disparar outro salvamento
        row.reset(
          { actionType: saved.actionType, riskLevel: saved.effectiveRisk, autoExecute: saved.effectiveAutoExecute },
          { emitEvent: false },
        );
        this.busyId.set(null);
        this.messages.add({ severity: 'success', summary: this.translate.instant('intelligence.policySaved') });
      },
      error: () => {
        const previous = this.policies()[index];
        row.reset(
          { actionType: previous.actionType, riskLevel: previous.effectiveRisk, autoExecute: previous.effectiveAutoExecute },
          { emitEvent: false },
        );
        this.busyId.set(null);
        this.fail('intelligence.policyError');
      },
    });
  }

  confirmApprove(d: AiDecision) {
    this.confirmation.confirm({
      header: this.translate.instant('intelligence.approve'),
      message: this.translate.instant('intelligence.approveConfirm'),
      icon: 'pi pi-check-circle',
      acceptLabel: this.translate.instant('intelligence.approve'),
      rejectLabel: this.translate.instant('common.cancel'),
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => this.approve(d),
    });
  }

  confirmReject(d: AiDecision) {
    this.confirmation.confirm({
      header: this.translate.instant('intelligence.reject'),
      message: this.translate.instant('intelligence.rejectConfirm'),
      icon: 'pi pi-times-circle',
      acceptLabel: this.translate.instant('intelligence.reject'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => this.reject(d),
    });
  }

  private approve(d: AiDecision) {
    this.busyId.set(d.id);
    this.service.approve(d.id).subscribe({
      next: result => {
        this.busyId.set(null);
        this.messages.add(result.executed
          ? { severity: 'success', summary: this.translate.instant('intelligence.approved'), detail: result.message ?? undefined }
          : { severity: 'warn', summary: this.translate.instant('intelligence.approvedButFailed'), detail: result.message ?? undefined });
        this.refresh();
      },
      error: () => {
        this.busyId.set(null);
        this.fail('intelligence.decideError');
        this.refresh();
      },
    });
  }

  private reject(d: AiDecision) {
    this.busyId.set(d.id);
    this.service.reject(d.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.messages.add({ severity: 'success', summary: this.translate.instant('intelligence.rejected') });
        this.refresh();
      },
      error: () => {
        this.busyId.set(null);
        this.fail('intelligence.decideError');
        this.refresh();
      },
    });
  }

  private refresh() {
    this.loadQueue();
    this.reloadHistory();
    if (this.isManager()) this.loadUsage();
  }

  private fail(key: string) {
    this.messages.add({ severity: 'error', summary: this.translate.instant(key) });
  }

}
