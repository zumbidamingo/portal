import { CommonModule, CurrencyPipe, formatDate } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, LOCALE_ID, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SkeletonModule } from 'primeng/skeleton';
import { Subject, catchError, of, switchMap, tap } from 'rxjs';
import {
  AttentionSeverity,
  CommercialAttentionType,
  CommercialCommandCenter,
  CommercialFollowUpRow,
  CommercialPipelineStageKey,
  DashboardPeriod,
  DashboardService,
  KpiMoney,
} from '../../core/services/dashboard.service';
import { KpiCardComponent } from '../../shared/components/kpi-card/kpi-card.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';

interface Destination {
  route: string;
  queryParams?: Record<string, string>;
}

interface SalesBar {
  heightPct: number;
  title: string;
}

const PERIODS: DashboardPeriod[] = ['TODAY', 'THIS_WEEK', 'THIS_MONTH', 'LAST_30_DAYS', 'CUSTOM'];

/** Cada linha de "Precisa da sua atenção" abre a lista que a compõe. */
const ATTENTION_DESTINATION: Record<CommercialAttentionType, Destination> = {
  LEAD_ACTIONS_OVERDUE: { route: '/leads' },
  NEW_LEADS_UNTOUCHED: { route: '/leads' },
  QUOTATIONS_STALE: { route: '/quotations', queryParams: { status: 'SENT' } },
  QUOTATIONS_EXPIRING: { route: '/quotations', queryParams: { status: 'SENT' } },
  DRAFTS_NOT_SENT: { route: '/quotations', queryParams: { status: 'DRAFT' } },
  REACTIVATION_DETECTED: { route: '/retention/funnel' },
};

const STAGE_DESTINATION: Record<CommercialPipelineStageKey, Destination> = {
  NEW_LEADS: { route: '/leads' },
  LEADS_IN_PROGRESS: { route: '/leads' },
  DRAFT: { route: '/quotations', queryParams: { status: 'DRAFT' } },
  SENT: { route: '/quotations', queryParams: { status: 'SENT' } },
  APPROVED: { route: '/quotations', queryParams: { status: 'APPROVED' } },
};

const SEVERITY_DOT: Record<AttentionSeverity, string> = {
  DANGER: 'bg-app-danger',
  WARNING: 'bg-app-warning',
  INFO: 'bg-app-text-tertiary',
};

/**
 * Cockpit de vendas do COMMERCIAL. Três níveis: "Agora" (o que trabalhar hoje: atenção, pipeline,
 * follow-ups), "Desempenho" (KPIs do período contra o anterior, vendas, atividade) e "Análise"
 * (conversão, origem, demanda, clientes, reativação). Todo número vem de
 * `GET /dashboard/commercial/command-center`; sem base, o campo vem nulo e a tela mostra "sem
 * dados" em vez de um zero inventado. Cada bloco leva à lista de registos que o compõe.
 */
@Component({
  selector: 'app-commercial-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe, ButtonModule, DatePickerModule, SkeletonModule,
    EmptyStateComponent, KpiCardComponent, PageHeaderComponent,
  ],
  template: `
    <div class="dashboard-page space-y-6 max-w-6xl mx-auto" [class.is-refreshing]="refreshing()">
      <app-page-header [title]="'dashboard.commercial.title' | translate" [description]="'dashboard.commercial.subtitle' | translate"></app-page-header>

      <div class="flex flex-wrap items-center gap-2" role="group" [attr.aria-label]="'dashboard.command.period.label' | translate">
        @for (p of periods; track p) {
          <button type="button"
                  class="px-3 py-1.5 rounded-lg text-sm border transition-colors cursor-pointer"
                  [class]="period() === p
                    ? 'bg-app-text text-app-bg border-app-text'
                    : 'bg-app-surface text-app-text-secondary border-app-border hover:text-app-text'"
                  [attr.aria-pressed]="period() === p"
                  (click)="selectPeriod(p)">
            {{ 'dashboard.command.period.' + p | translate }}
          </button>
        }
        @if (period() === 'CUSTOM') {
          <p-datepicker [formControl]="customRange" selectionMode="range" [readonlyInput]="true"
                        dateFormat="dd/mm/yy" appendTo="body" [showIcon]="true"
                        [placeholder]="'dashboard.command.period.customPlaceholder' | translate"
                        (onSelect)="onCustomSelect()" (onClear)="onCustomSelect()"></p-datepicker>
        }
      </div>

      @if (error()) {
        <div class="bg-app-surface border border-app-border rounded-xl p-4 flex items-center gap-3">
          <i class="pi pi-exclamation-circle text-app-danger text-xl" aria-hidden="true"></i>
          <p class="text-sm text-app-danger flex-1">{{ 'dashboard.command.loadError' | translate }}</p>
          <p-button [label]="'dashboard.command.retry' | translate" size="small" [outlined]="true" (click)="reload()"></p-button>
        </div>
      } @else {
        @let d = data();

        <!-- ============ AGORA ============ -->
        <section class="space-y-3">
          <h2 class="text-xs font-semibold text-app-text-tertiary uppercase tracking-wide">
            {{ 'dashboard.command.section.now' | translate }}
          </h2>
          <div class="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div class="lg:col-span-2 dashboard-card">
              <h3 class="text-sm font-medium text-app-text mb-3">{{ 'dashboard.commercial.attention.title' | translate }}</h3>
              @if (loading()) {
                <p-skeleton height="8rem"></p-skeleton>
              } @else if (d && d.attention.length === 0) {
                <app-empty-state compact icon="pi pi-check-circle" iconClass="text-app-success" [message]="'dashboard.commercial.attention.empty' | translate"></app-empty-state>
              } @else if (d) {
                <ul class="divide-y divide-app-border">
                  @for (item of d.attention; track item.type) {
                    <li>
                      <a [routerLink]="attentionDestination(item.type).route"
                         [queryParams]="attentionDestination(item.type).queryParams"
                         class="flex items-center gap-3 py-2.5 hover:bg-app-surface -mx-2 px-2 rounded-lg">
                        <span class="w-2 h-2 rounded-full shrink-0" [class]="severityDot(item.severity)" aria-hidden="true"></span>
                        <span class="text-lg font-medium text-app-text w-8 shrink-0">{{ item.count }}</span>
                        <span class="text-sm text-app-text-secondary flex-1 min-w-0">
                          {{ 'dashboard.commercial.attention.type.' + item.type | translate }}
                        </span>
                        @if (item.amount; as amount) {
                          <span class="text-xs text-app-text-tertiary shrink-0">{{ amount.amount | currency:amount.currency }}</span>
                        }
                        <i class="pi pi-angle-right text-app-text-tertiary text-xs" aria-hidden="true"></i>
                      </a>
                    </li>
                  }
                </ul>
              }
            </div>

            <div class="lg:col-span-3 dashboard-card">
              <h3 class="text-sm font-medium text-app-text">{{ 'dashboard.commercial.pipeline.title' | translate }}</h3>
              <p class="text-xs text-app-text-tertiary mb-3">{{ 'dashboard.commercial.pipeline.subtitle' | translate }}</p>
              @if (loading()) {
                <p-skeleton height="8rem"></p-skeleton>
              } @else if (d) {
                <ul class="space-y-1">
                  @for (stage of pipelineRows(); track stage.stage) {
                    <li>
                      <a [routerLink]="stageDestination(stage.stage).route"
                         [queryParams]="stageDestination(stage.stage).queryParams"
                         class="block hover:bg-app-surface -mx-2 px-2 py-1.5 rounded-lg">
                        <div class="flex items-baseline gap-3 text-sm">
                          <span class="text-app-text-secondary flex-1 min-w-0 truncate">
                            {{ 'dashboard.commercial.pipeline.stage.' + stage.stage | translate }}
                          </span>
                          @if (stage.value; as value) {
                            <span class="text-xs text-app-text-tertiary tabular-nums">{{ value.amount | currency:value.currency }}</span>
                          }
                          <span class="font-medium text-app-text w-8 text-right tabular-nums">{{ stage.count }}</span>
                        </div>
                        <div class="h-1.5 rounded bg-app-surface mt-1">
                          <div class="h-1.5 rounded bg-app-text/70" [style.width.%]="stage.widthPct"></div>
                        </div>
                      </a>
                    </li>
                  }
                </ul>
                <p class="text-xs text-app-text-tertiary mt-3">{{ 'dashboard.commercial.pipeline.approvedHint' | translate }}</p>
              }
            </div>
          </div>

          <div class="dashboard-card">
            <div class="flex flex-wrap items-baseline justify-between gap-2 mb-3">
              <h3 class="text-sm font-medium text-app-text">{{ 'dashboard.commercial.followUps.title' | translate }}</h3>
              @if (d && d.followUps.total > 0) {
                <span class="text-xs text-app-text-tertiary">
                  {{ 'dashboard.commercial.followUps.summary' | translate:{ total: d.followUps.total, overdue: d.followUps.overdue } }}
                </span>
              }
            </div>
            @if (loading()) {
              <p-skeleton height="8rem"></p-skeleton>
            } @else if (d && d.followUps.rows.length === 0) {
              <app-empty-state compact icon="pi pi-check-circle" iconClass="text-app-success" [message]="'dashboard.commercial.followUps.empty' | translate"></app-empty-state>
            } @else if (d) {
              <ul class="divide-y divide-app-border">
                @for (row of d.followUps.rows; track row.refId) {
                  <li class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                    <span class="w-2 h-2 rounded-full shrink-0" [class]="row.overdue ? 'bg-app-danger' : 'bg-app-text-tertiary'" aria-hidden="true"></span>
                    <div class="min-w-0 flex-1 basis-48">
                      <p class="text-sm text-app-text truncate">{{ row.name ?? ('dashboard.commercial.followUps.noName' | translate) }}</p>
                      <p class="text-xs text-app-text-tertiary truncate">
                        {{ 'dashboard.commercial.followUps.kind.' + row.kind | translate }}
                        · {{ row.referenceAt | date:'short' }}
                        @if (row.description) { · {{ row.description }} }
                      </p>
                    </div>
                    @if (row.amount; as amount) {
                      <span class="text-sm text-app-text tabular-nums shrink-0">{{ amount.amount | currency:amount.currency }}</span>
                    }
                    <a class="text-sm font-medium text-app-text underline underline-offset-2 shrink-0"
                       [routerLink]="followUpDestination(row).route"
                       [queryParams]="followUpDestination(row).queryParams">
                      {{ 'dashboard.commercial.followUps.open.' + row.kind | translate }}
                    </a>
                  </li>
                }
              </ul>
              @if (d.followUps.total > d.followUps.rows.length) {
                <p class="text-xs text-app-text-tertiary mt-2">
                  {{ 'dashboard.commercial.followUps.showing' | translate:{ shown: d.followUps.rows.length, total: d.followUps.total } }}
                </p>
              }
            }
          </div>
        </section>

        <!-- ============ DESEMPENHO ============ -->
        <section class="space-y-3">
          <h2 class="text-xs font-semibold text-app-text-tertiary uppercase tracking-wide">
            {{ 'dashboard.command.section.performance' | translate }}
          </h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <a routerLink="/quotations" [queryParams]="{ status: 'APPROVED' }" class="block min-w-0">
              <app-kpi-card [label]="'dashboard.commercial.kpi.sales' | translate" icon="pi-wallet"
                            [money]="d?.kpis?.sales?.current ?? null"
                            [variationPct]="d?.kpis?.sales?.changePct ?? null"
                            variationLabelKey="dashboard.command.vsPrevious" [loading]="loading()"></app-kpi-card>
            </a>
            <a routerLink="/quotations" [queryParams]="{ status: 'SENT' }" class="block min-w-0">
              <app-kpi-card [label]="'dashboard.commercial.kpi.openQuotations' | translate" icon="pi-file-edit"
                            [plainValue]="d ? d.kpis.openQuotations.count : null"
                            [hint]="openQuotationsHint()" [loading]="loading()"></app-kpi-card>
            </a>
            <a routerLink="/quotations" [queryParams]="{ status: 'SENT' }" class="block min-w-0">
              <app-kpi-card [label]="'dashboard.commercial.kpi.pipeline' | translate" icon="pi-filter"
                            [money]="d?.kpis?.pipeline?.value ?? null"
                            [hint]="pipelineHint()" [loading]="loading()"></app-kpi-card>
            </a>
            <app-kpi-card [label]="'dashboard.commercial.kpi.conversion' | translate" icon="pi-percentage"
                          [plainValue]="conversionValue()"
                          [variationPct]="d?.kpis?.conversion?.changePoints ?? null"
                          [variationSuffix]="pointsSuffix()"
                          variationLabelKey="dashboard.command.vsPrevious" [loading]="loading()"></app-kpi-card>
            <app-kpi-card [label]="'dashboard.commercial.kpi.ticket' | translate" icon="pi-ticket"
                          [money]="d?.kpis?.averageTicket?.current ?? null"
                          [variationPct]="d?.kpis?.averageTicket?.changePct ?? null"
                          variationLabelKey="dashboard.command.vsPrevious" [loading]="loading()"></app-kpi-card>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div class="lg:col-span-2 dashboard-card">
              <h3 class="text-sm font-medium text-app-text mb-3">{{ 'dashboard.commercial.sales.title' | translate }}</h3>
              @if (loading()) {
                <p-skeleton height="9rem"></p-skeleton>
              } @else if (salesBars().length === 0) {
                <app-empty-state compact icon="pi pi-chart-bar" [message]="'dashboard.commercial.sales.empty' | translate"></app-empty-state>
              } @else {
                <div class="flex items-end gap-0.5 h-36" role="img" [attr.aria-label]="'dashboard.commercial.sales.title' | translate">
                  @for (bar of salesBars(); track $index) {
                    <div class="flex-1 min-w-0 flex items-end h-full" [title]="bar.title">
                      <div class="w-full rounded-t bg-app-text/80 hover:bg-app-text"
                           [style.height.%]="bar.heightPct" [style.min-height.px]="bar.heightPct > 0 ? 2 : 0"></div>
                    </div>
                  }
                </div>
                <div class="flex justify-between text-[11px] text-app-text-tertiary mt-1.5">
                  <span>{{ salesAxis().first }}</span>
                  <span>{{ salesAxis().last }}</span>
                </div>
              }
            </div>

            <div class="dashboard-card">
              <h3 class="text-sm font-medium text-app-text mb-3">{{ 'dashboard.commercial.activity.title' | translate }}</h3>
              @if (loading()) {
                <p-skeleton height="9rem"></p-skeleton>
              } @else if (d) {
                <dl class="space-y-2.5">
                  @for (row of activityRows(); track row.key) {
                    <div class="flex items-baseline justify-between gap-3">
                      <dt class="text-sm text-app-text-secondary">{{ 'dashboard.commercial.activity.' + row.key | translate }}</dt>
                      <dd class="text-lg font-medium text-app-text tabular-nums">{{ row.value }}</dd>
                    </div>
                  }
                </dl>
              }
            </div>
          </div>
        </section>

        <!-- ============ ANÁLISE ============ -->
        <section class="space-y-3">
          <h2 class="text-xs font-semibold text-app-text-tertiary uppercase tracking-wide">
            {{ 'dashboard.command.section.analysis' | translate }}
          </h2>
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div class="dashboard-card">
              <h3 class="text-sm font-medium text-app-text">{{ 'dashboard.commercial.conversion.title' | translate }}</h3>
              <p class="text-xs text-app-text-tertiary mb-3">{{ 'dashboard.commercial.conversion.subtitle' | translate }}</p>
              @if (loading()) {
                <p-skeleton height="8rem"></p-skeleton>
              } @else if (d && d.conversion.created === 0) {
                <app-empty-state compact icon="pi pi-filter" [message]="'dashboard.commercial.conversion.empty' | translate"></app-empty-state>
              } @else if (d) {
                <dl class="grid grid-cols-3 gap-3">
                  @for (row of conversionRows(); track row.key) {
                    <div>
                      <dt class="text-xs text-app-text-tertiary">{{ 'dashboard.commercial.conversion.' + row.key | translate }}</dt>
                      <dd class="text-lg font-medium text-app-text tabular-nums">{{ row.value }}</dd>
                    </div>
                  }
                </dl>
                @if (d.conversion.byService.length) {
                  <table class="w-full text-sm mt-4 pt-3 border-t border-app-border">
                    <thead>
                      <tr class="text-xs text-app-text-tertiary text-left">
                        <th class="font-normal py-1">{{ 'dashboard.commercial.conversion.byService' | translate }}</th>
                        <th class="font-normal py-1 text-right">{{ 'dashboard.commercial.conversion.sent' | translate }}</th>
                        <th class="font-normal py-1 text-right">{{ 'dashboard.commercial.conversion.approved' | translate }}</th>
                        <th class="font-normal py-1 text-right">%</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-app-border">
                      @for (s of d.conversion.byService; track $index) {
                        <tr>
                          <td class="py-2 pr-2 text-app-text truncate max-w-[10rem]">{{ s.name }}</td>
                          <td class="py-2 text-right text-app-text-secondary tabular-nums">{{ s.sent }}</td>
                          <td class="py-2 text-right text-app-text-secondary tabular-nums">{{ s.approved }}</td>
                          <td class="py-2 text-right text-app-text tabular-nums">{{ s.conversionPct == null ? '—' : s.conversionPct + '%' }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                }
              }
            </div>

            <div class="dashboard-card">
              <h3 class="text-sm font-medium text-app-text">{{ 'dashboard.commercial.sources.title' | translate }}</h3>
              <p class="text-xs text-app-text-tertiary mb-3">{{ 'dashboard.commercial.sources.subtitle' | translate }}</p>
              @if (loading()) {
                <p-skeleton height="8rem"></p-skeleton>
              } @else if (d && d.leadSources.length === 0) {
                <app-empty-state compact icon="pi pi-users" [message]="'dashboard.commercial.sources.empty' | translate"></app-empty-state>
              } @else if (d) {
                <table class="w-full text-sm">
                  <thead>
                    <tr class="text-xs text-app-text-tertiary text-left">
                      <th class="font-normal pb-1"></th>
                      <th class="font-normal pb-1 text-right">{{ 'dashboard.commercial.sources.leads' | translate }}</th>
                      <th class="font-normal pb-1 text-right">{{ 'dashboard.commercial.sources.won' | translate }}</th>
                      <th class="font-normal pb-1 text-right">%</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-app-border">
                    @for (s of d.leadSources; track s.source) {
                      <tr>
                        <td class="py-2 pr-2 text-app-text">{{ 'dashboard.commercial.sources.type.' + s.source | translate }}</td>
                        <td class="py-2 text-right text-app-text-secondary tabular-nums">{{ s.leads }}</td>
                        <td class="py-2 text-right text-app-text-secondary tabular-nums">{{ s.won }}</td>
                        <td class="py-2 text-right text-app-text tabular-nums">{{ s.conversionPct == null ? '—' : s.conversionPct + '%' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              }
            </div>

            <div class="dashboard-card">
              <h3 class="text-sm font-medium text-app-text">{{ 'dashboard.commercial.demand.title' | translate }}</h3>
              <p class="text-xs text-app-text-tertiary mb-3">{{ 'dashboard.commercial.demand.subtitle' | translate }}</p>
              @if (loading()) {
                <p-skeleton height="8rem"></p-skeleton>
              } @else if (d && d.serviceDemand.length === 0) {
                <app-empty-state compact icon="pi pi-list" [message]="'dashboard.commercial.demand.empty' | translate"></app-empty-state>
              } @else if (d) {
                <table class="w-full text-sm">
                  <thead>
                    <tr class="text-xs text-app-text-tertiary text-left">
                      <th class="font-normal pb-1"></th>
                      <th class="font-normal pb-1 text-right">{{ 'dashboard.commercial.demand.quotations' | translate }}</th>
                      <th class="font-normal pb-1 text-right">{{ 'dashboard.commercial.demand.value' | translate }}</th>
                      <th class="font-normal pb-1 text-right">{{ 'dashboard.commercial.demand.change' | translate }}</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-app-border">
                    @for (s of d.serviceDemand; track $index) {
                      <tr>
                        <td class="py-2 pr-2 text-app-text truncate max-w-[10rem]">{{ s.name }}</td>
                        <td class="py-2 text-right text-app-text-secondary tabular-nums">{{ s.quotations }}</td>
                        <td class="py-2 text-right text-app-text tabular-nums">{{ s.value.amount | currency:s.value.currency }}</td>
                        <td class="py-2 text-right tabular-nums"
                            [class]="(s.changePct ?? 0) >= 0 ? 'text-app-success' : 'text-app-danger'">
                          {{ s.changePct == null ? '—' : (s.changePct > 0 ? '+' : '') + s.changePct + '%' }}
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              }
            </div>

            <div class="space-y-4">
              <div class="dashboard-card">
                <h3 class="text-sm font-medium text-app-text">{{ 'dashboard.commercial.customers.title' | translate }}</h3>
                <p class="text-xs text-app-text-tertiary mb-3">{{ 'dashboard.commercial.customers.subtitle' | translate }}</p>
                @if (loading()) {
                  <p-skeleton height="3rem"></p-skeleton>
                } @else if (d && d.customers.newCustomers + d.customers.recurring === 0) {
                  <app-empty-state compact icon="pi pi-users" [message]="'dashboard.commercial.customers.empty' | translate"></app-empty-state>
                } @else if (d) {
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <p class="text-xs text-app-text-tertiary">{{ 'dashboard.commercial.customers.new' | translate }}</p>
                      <p class="text-lg font-medium text-app-text tabular-nums">{{ d.customers.newCustomers }}</p>
                    </div>
                    <div>
                      <p class="text-xs text-app-text-tertiary">{{ 'dashboard.commercial.customers.recurring' | translate }}</p>
                      <p class="text-lg font-medium text-app-text tabular-nums">{{ d.customers.recurring }}</p>
                    </div>
                  </div>
                }
              </div>

              <div class="dashboard-card">
                <div class="flex items-baseline justify-between gap-2 mb-3">
                  <h3 class="text-sm font-medium text-app-text">{{ 'dashboard.commercial.reactivation.title' | translate }}</h3>
                  <a routerLink="/retention/funnel" class="text-xs font-medium text-app-text underline underline-offset-2">
                    {{ 'dashboard.commercial.reactivation.open' | translate }}
                  </a>
                </div>
                @if (loading()) {
                  <p-skeleton height="5rem"></p-skeleton>
                } @else if (d && d.reactivation.detected === 0) {
                  <app-empty-state compact icon="pi pi-inbox" [message]="'dashboard.commercial.reactivation.empty' | translate"></app-empty-state>
                } @else if (d) {
                  <p class="text-sm text-app-text-secondary mb-2">
                    {{ 'dashboard.commercial.reactivation.detected' | translate:{ count: d.reactivation.detected } }}
                  </p>
                  <ul class="divide-y divide-app-border">
                    @for (row of d.reactivation.rows; track row.opportunityId) {
                      <li>
                        <a routerLink="/retention/funnel" class="flex items-center gap-3 py-2 hover:bg-app-surface -mx-2 px-2 rounded-lg">
                          <span class="text-sm text-app-text flex-1 min-w-0 truncate">
                            {{ row.customerName ?? ('dashboard.commercial.followUps.noName' | translate) }}
                          </span>
                          <span class="text-xs text-app-text-tertiary shrink-0">{{ row.dueAt | date:'shortDate' }}</span>
                          <i class="pi pi-angle-right text-app-text-tertiary text-xs" aria-hidden="true"></i>
                        </a>
                      </li>
                    }
                  </ul>
                }
              </div>
            </div>
          </div>
        </section>
      }
    </div>
  `,
})
export class CommercialDashboardComponent implements OnInit {
  private dashboardService = inject(DashboardService);
  private translate = inject(TranslateService);
  private locale = inject(LOCALE_ID);
  private destroyRef = inject(DestroyRef);
  private currency = new CurrencyPipe(this.locale);
  private request$ = new Subject<void>();

  readonly periods = PERIODS;

  period = signal<DashboardPeriod>('THIS_MONTH');
  customRange = new FormControl<Date[] | null>(null);

  data = signal<CommercialCommandCenter | null>(null);
  loading = signal(true);
  /** Recarga por troca de período: mantém o conteúdo anterior, esmaecido, em vez de voltar ao esqueleto. */
  refreshing = signal(false);
  error = signal(false);

  conversionValue = computed<string | null>(() => {
    const rate = this.data()?.kpis.conversion.current;
    return rate === null || rate === undefined ? null : `${rate}%`;
  });

  openQuotationsHint = computed<string | null>(() => {
    const open = this.data()?.kpis.openQuotations;
    if (!open || open.count === 0) return null;
    return this.translate.instant('dashboard.commercial.kpi.openHint', { drafts: open.drafts, sent: open.sent });
  });

  pipelineHint = computed<string | null>(() => {
    const pipeline = this.data()?.kpis.pipeline;
    if (!pipeline || pipeline.count === 0) return null;
    return this.translate.instant('dashboard.commercial.kpi.pipelineHint', { count: pipeline.count });
  });

  pipelineRows = computed(() => {
    const stages = this.data()?.pipeline ?? [];
    const max = Math.max(...stages.map(s => s.count), 0);
    return stages.map(s => ({ ...s, widthPct: max > 0 ? Math.round((s.count / max) * 100) : 0 }));
  });

  activityRows = computed(() => {
    const activity = this.data()?.activity;
    if (!activity) return [];
    return [
      { key: 'leadsCreated', value: activity.leadsCreated },
      { key: 'interactions', value: activity.interactions },
      { key: 'quotationsSent', value: activity.quotationsSent },
      { key: 'quotationsApproved', value: activity.quotationsApproved },
    ];
  });

  conversionRows = computed(() => {
    const conversion = this.data()?.conversion;
    if (!conversion) return [];
    return [
      { key: 'created', value: conversion.created },
      { key: 'sent', value: conversion.sent },
      { key: 'approved', value: conversion.approved },
      { key: 'declined', value: conversion.declined },
      { key: 'expired', value: conversion.expired },
      { key: 'awaiting', value: conversion.awaiting },
    ];
  });

  salesBars = computed<SalesBar[]>(() => {
    const d = this.data();
    if (!d) return [];
    const max = Math.max(...d.salesSeries.map(p => p.amount.amount), 0);
    if (max <= 0) return [];
    const pattern = d.salesSeriesGranularity === 'MONTH' ? 'MMM/yy' : 'dd/MM';
    return d.salesSeries.map(p => ({
      heightPct: (p.amount.amount / max) * 100,
      title: `${formatDate(p.date, pattern, this.locale)}: ${this.money(p.amount)}`,
    }));
  });

  salesAxis = computed(() => {
    const d = this.data();
    if (!d || d.salesSeries.length === 0) return { first: '', last: '' };
    const pattern = d.salesSeriesGranularity === 'MONTH' ? 'MMM/yy' : 'dd/MM';
    return {
      first: formatDate(d.salesSeries[0].date, pattern, this.locale),
      last: formatDate(d.salesSeries[d.salesSeries.length - 1].date, pattern, this.locale),
    };
  });

  constructor() {
    this.request$.pipe(
      tap(() => {
        const hasData = this.data() !== null;
        this.loading.set(!hasData);
        this.refreshing.set(hasData);
        this.error.set(false);
      }),
      switchMap(() => {
        const { from, to } = this.customDates();
        return this.dashboardService.getCommercialCommandCenter(this.period(), from, to).pipe(
          catchError(() => {
            this.error.set(true);
            return of(null);
          }),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(result => {
      this.loading.set(false);
      this.refreshing.set(false);
      if (result) this.data.set(result);
    });
  }

  ngOnInit() {
    this.reload();
  }

  reload() {
    this.request$.next();
  }

  selectPeriod(period: DashboardPeriod) {
    this.period.set(period);
    if (period !== 'CUSTOM') this.reload();
    else this.onCustomSelect();
  }

  /** Só consulta com o intervalo completo (início e fim escolhidos). */
  onCustomSelect() {
    const { from, to } = this.customDates();
    if (from && to) this.reload();
  }

  attentionDestination(type: CommercialAttentionType): Destination {
    return ATTENTION_DESTINATION[type];
  }

  stageDestination(stage: CommercialPipelineStageKey): Destination {
    return STAGE_DESTINATION[stage];
  }

  followUpDestination(row: CommercialFollowUpRow): Destination {
    return row.kind === 'QUOTATION_SENT' ? { route: `/quotations/${row.refId}` } : { route: '/leads' };
  }

  severityDot(severity: AttentionSeverity): string {
    return SEVERITY_DOT[severity];
  }

  pointsSuffix(): string {
    return ` ${this.translate.instant('dashboard.command.points')}`;
  }

  private money(value: KpiMoney): string {
    return this.currency.transform(value.amount, value.currency) ?? '';
  }

  private customDates(): { from?: string; to?: string } {
    const range = this.customRange.value;
    if (this.period() !== 'CUSTOM' || !range?.[0] || !range?.[1]) return {};
    return { from: this.isoDate(range[0]), to: this.isoDate(range[1]) };
  }

  private isoDate(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
}
