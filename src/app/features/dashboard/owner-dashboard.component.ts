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
  AttentionType,
  CommandCenterAttention,
  DashboardPeriod,
  DashboardService,
  KpiMoney,
  OwnerCommandCenter,
  OwnerDashboard,
  PlanQuota,
  TodayOperationGroup,
} from '../../core/services/dashboard.service';
import { KpiCardComponent } from '../../shared/components/kpi-card/kpi-card.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { OnboardingResumeCardComponent } from '../onboarding/onboarding-resume-card.component';
import { ActivationChecklistComponent } from './activation-checklist.component';

interface PlanUsageRow {
  labelKey: string;
  quota: PlanQuota;
}

interface RevenueBar {
  heightPct: number;
  title: string;
}

const PERIODS: DashboardPeriod[] = ['TODAY', 'THIS_WEEK', 'THIS_MONTH', 'LAST_30_DAYS', 'CUSTOM'];

const ATTENTION_ROUTE: Record<AttentionType, string> = {
  OVERDUE_INVOICES: '/financial/invoices',
  QUOTATIONS_AWAITING_RESPONSE: '/quotations',
  LATE_ORDERS: '/orders',
  ORDERS_TO_SCHEDULE: '/orders',
  ORDERS_TO_ASSIGN: '/orders',
  FINISHED_TO_INVOICE: '/financial/invoices',
};

const ATTENTION_QUERY: Partial<Record<AttentionType, Record<string, string>>> = {
  ORDERS_TO_SCHEDULE: { status: 'CREATED' },
  ORDERS_TO_ASSIGN: { status: 'SCHEDULED' },
};

const SEVERITY_DOT: Record<AttentionSeverity, string> = {
  DANGER: 'bg-app-danger',
  WARNING: 'bg-app-warning',
  INFO: 'bg-app-text-tertiary',
};

const GROUP_DOT: Record<TodayOperationGroup, string> = {
  COMPLETED: 'bg-app-success',
  IN_PROGRESS: 'bg-app-text',
  SCHEDULED: 'bg-app-text-tertiary',
  ISSUE: 'bg-app-danger',
};

const GROUP_ORDER: TodayOperationGroup[] = ['COMPLETED', 'IN_PROGRESS', 'SCHEDULED', 'ISSUE'];

/**
 * Painel de comando de OWNER/ADMIN. Três níveis: "Agora" (o que precisa de atenção e como está o
 * dia), "Desempenho" (KPIs do período contra o período anterior) e "Análise" (funil, serviços,
 * uso do plano). Todo número vem de `GET /dashboard/owner/command-center` — sem base, o campo
 * vem nulo e a tela mostra "Sem dados ainda" em vez de um zero inventado.
 */
@Component({
  selector: 'app-owner-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe, ButtonModule, DatePickerModule, SkeletonModule,
    EmptyStateComponent, KpiCardComponent, PageHeaderComponent, OnboardingResumeCardComponent, ActivationChecklistComponent,
  ],
  template: `
    <div class="dashboard-page space-y-6 max-w-6xl mx-auto" [class.is-refreshing]="refreshing()">
      <app-page-header [title]="'dashboard.command.title' | translate" [description]="'dashboard.command.subtitle' | translate"></app-page-header>

      <app-onboarding-resume-card></app-onboarding-resume-card>
      <app-activation-checklist></app-activation-checklist>

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
              <h3 class="text-sm font-medium text-app-text mb-3">{{ 'dashboard.command.attention.title' | translate }}</h3>
              @if (loading()) {
                <p-skeleton height="8rem"></p-skeleton>
              } @else if (d && d.attention.length === 0) {
                <app-empty-state compact icon="pi pi-check-circle" iconClass="text-app-success" [message]="'dashboard.command.attention.empty' | translate"></app-empty-state>
              } @else if (d) {
                <ul class="divide-y divide-app-border">
                  @for (item of d.attention; track item.type) {
                    <li>
                      <a [routerLink]="attentionRoute(item.type)" [queryParams]="attentionQuery(item)"
                         class="flex items-center gap-3 py-2.5 hover:bg-app-surface -mx-2 px-2 rounded-lg">
                        <span class="w-2 h-2 rounded-full shrink-0" [class]="severityDot(item.severity)" aria-hidden="true"></span>
                        <span class="text-lg font-medium text-app-text w-8 shrink-0">{{ item.count }}</span>
                        <span class="text-sm text-app-text-secondary flex-1 min-w-0">
                          {{ 'dashboard.command.attention.type.' + item.type | translate }}
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
              <div class="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                <h3 class="text-sm font-medium text-app-text">{{ 'dashboard.command.today.title' | translate }}</h3>
                @if (d) {
                  <span class="text-xs text-app-text-tertiary">
                    {{ d.today.total }} {{ 'dashboard.command.today.count' | translate }}
                  </span>
                }
              </div>
              @if (loading()) {
                <p-skeleton height="8rem"></p-skeleton>
              } @else if (d && d.today.total === 0) {
                <app-empty-state compact icon="pi pi-calendar" [message]="'dashboard.command.today.empty' | translate"></app-empty-state>
              } @else if (d) {
                <div class="flex flex-wrap gap-x-4 gap-y-1 mb-3">
                  @for (g of groupOrder; track g) {
                    <span class="inline-flex items-center gap-1.5 text-xs text-app-text-secondary">
                      <span class="w-2 h-2 rounded-full" [class]="groupDot(g)" aria-hidden="true"></span>
                      {{ d.today.byGroup[g] }} {{ 'dashboard.command.today.group.' + g | translate }}
                    </span>
                  }
                </div>
                <ul class="divide-y divide-app-border">
                  @for (o of d.today.orders; track o.orderId) {
                    <li>
                      <a routerLink="/orders" [queryParams]="{ open: o.orderId }"
                         class="flex items-center gap-3 py-2 hover:bg-app-surface -mx-2 px-2 rounded-lg">
                        <span class="w-2 h-2 rounded-full shrink-0" [class]="groupDot(o.group)" aria-hidden="true"></span>
                        <span class="text-xs text-app-text-tertiary w-11 shrink-0 tabular-nums">{{ o.scheduledStartAt | date:'HH:mm' }}</span>
                        <span class="text-sm text-app-text w-28 shrink-0 truncate">
                          {{ o.technicianName ?? ('dashboard.command.today.unassigned' | translate) }}
                        </span>
                        <span class="text-sm text-app-text-secondary flex-1 min-w-0 truncate">
                          <span class="text-app-text-tertiary tabular-nums">#{{ o.orderNumber }}</span> {{ o.description }}
                        </span>
                        <span class="text-xs shrink-0" [class]="o.issue ? 'text-app-danger font-medium' : 'text-app-text-tertiary'">
                          {{ o.issue ? ('dashboard.command.today.issue.' + o.issue | translate) : ('dashboard.command.today.group.' + o.group | translate) }}
                        </span>
                      </a>
                    </li>
                  }
                </ul>
                @if (d.today.total > d.today.orders.length) {
                  <p class="text-xs text-app-text-tertiary mt-2">
                    {{ 'dashboard.command.today.showing' | translate:{ shown: d.today.orders.length, total: d.today.total } }}
                  </p>
                }
              }
            </div>
          </div>
        </section>

        <!-- ============ DESEMPENHO ============ -->
        <section class="space-y-3">
          <h2 class="text-xs font-semibold text-app-text-tertiary uppercase tracking-wide">
            {{ 'dashboard.command.section.performance' | translate }}
          </h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <app-kpi-card [label]="'dashboard.command.kpi.revenue' | translate" icon="pi-wallet"
                          [money]="d?.kpis?.revenue?.current ?? null"
                          [variationPct]="d?.kpis?.revenue?.changePct ?? null"
                          variationLabelKey="dashboard.command.vsPrevious" [loading]="loading()"></app-kpi-card>
            <app-kpi-card [label]="'dashboard.command.kpi.completed' | translate" icon="pi-check-square"
                          [plainValue]="d ? d.kpis.completedOrders.current : null"
                          [variationPct]="d?.kpis?.completedOrders?.changePct ?? null"
                          variationLabelKey="dashboard.command.vsPrevious" [loading]="loading()"></app-kpi-card>
            <app-kpi-card [label]="'dashboard.command.kpi.ticket' | translate" icon="pi-ticket"
                          [money]="d?.kpis?.averageTicket?.current ?? null"
                          [variationPct]="d?.kpis?.averageTicket?.changePct ?? null"
                          variationLabelKey="dashboard.command.vsPrevious" [loading]="loading()"></app-kpi-card>
            <app-kpi-card [label]="'dashboard.command.kpi.conversion' | translate" icon="pi-percentage"
                          [plainValue]="conversionValue()"
                          [variationPct]="d?.kpis?.conversion?.changePoints ?? null"
                          [variationSuffix]="pointsSuffix()"
                          variationLabelKey="dashboard.command.vsPrevious" [loading]="loading()"></app-kpi-card>
            <app-kpi-card [label]="'dashboard.command.kpi.receivable' | translate" icon="pi-inbox"
                          [money]="d?.kpis?.receivable?.total ?? null"
                          [hint]="receivableHint()" [loading]="loading()"></app-kpi-card>
          </div>

          <div class="dashboard-card">
            <h3 class="text-sm font-medium text-app-text mb-3">{{ 'dashboard.command.revenue.title' | translate }}</h3>
            @if (loading()) {
              <p-skeleton height="9rem"></p-skeleton>
            } @else if (revenueBars().length === 0) {
              <app-empty-state compact icon="pi pi-chart-bar" [message]="'dashboard.command.revenue.empty' | translate"></app-empty-state>
            } @else {
              <div class="flex gap-2 pt-6" role="img" [attr.aria-label]="'dashboard.command.revenue.title' | translate">
                <div class="relative h-40 w-14 shrink-0 text-[11px] text-app-text-tertiary tabular-nums" aria-hidden="true">
                  @for (tick of revenueScale().ticks; track tick.pct) {
                    <span class="absolute right-0 -translate-y-1/2" [style.bottom.%]="tick.pct">{{ tick.label }}</span>
                  }
                </div>
                <div class="relative h-40 flex-1 min-w-0">
                  @for (tick of revenueScale().ticks; track tick.pct) {
                    <div class="absolute inset-x-0 border-t" [class]="tick.pct === 0 ? 'border-app-border' : 'border-dashed border-app-border'"
                         [style.bottom.%]="tick.pct" aria-hidden="true"></div>
                  }
                  <div class="absolute inset-0 flex items-end gap-1">
                    @for (bar of revenueBars(); track $index) {
                      <div class="group flex-1 min-w-0 h-full flex items-end justify-center" [title]="bar.title">
                        <div class="w-full max-w-8 rounded-t transition-colors"
                             [class]="bar.heightPct > 0 ? 'bg-app-accent group-hover:opacity-80' : 'bg-app-border'"
                             [style.height.%]="bar.heightPct" [style.min-height.px]="bar.heightPct > 0 ? 3 : 2"></div>
                      </div>
                    }
                  </div>
                </div>
              </div>
              <div class="flex justify-between text-[11px] text-app-text-tertiary mt-1.5 pl-16">
                <span>{{ revenueAxis().first }}</span>
                <span>{{ revenueAxis().last }}</span>
              </div>
            }
          </div>
        </section>

        <!-- ============ ANÁLISE ============ -->
        <section class="space-y-3">
          <h2 class="text-xs font-semibold text-app-text-tertiary uppercase tracking-wide">
            {{ 'dashboard.command.section.analysis' | translate }}
          </h2>
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div class="dashboard-card">
              <h3 class="text-sm font-medium text-app-text">{{ 'dashboard.command.funnel.title' | translate }}</h3>
              <p class="text-xs text-app-text-tertiary mb-3">{{ 'dashboard.command.funnel.subtitle' | translate }}</p>
              @if (loading()) {
                <p-skeleton height="8rem"></p-skeleton>
              } @else if (d && d.funnel.created === 0) {
                <app-empty-state compact icon="pi pi-filter" [message]="'dashboard.command.funnel.empty' | translate"></app-empty-state>
              } @else if (d) {
                <div class="space-y-2">
                  @for (step of funnelSteps(); track step.key) {
                    <div>
                      <div class="flex justify-between text-xs text-app-text-secondary mb-0.5">
                        <span>{{ 'dashboard.command.funnel.' + step.key | translate }}</span>
                        <span class="font-medium text-app-text">{{ step.value }}</span>
                      </div>
                      <div class="h-2 rounded bg-app-surface">
                        <div class="h-2 rounded bg-app-text/70" [style.width.%]="step.widthPct"></div>
                      </div>
                    </div>
                  }
                </div>
                <div class="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-app-border">
                  <div>
                    <p class="text-xs text-app-text-tertiary">{{ 'dashboard.command.funnel.openValue' | translate }}</p>
                    <p class="text-sm font-medium text-app-text">{{ d.funnel.openValue.amount | currency:d.funnel.openValue.currency }}</p>
                  </div>
                  <div>
                    <p class="text-xs text-app-text-tertiary">{{ 'dashboard.command.funnel.wonValue' | translate }}</p>
                    <p class="text-sm font-medium text-app-text">{{ d.funnel.wonValue.amount | currency:d.funnel.wonValue.currency }}</p>
                  </div>
                </div>
              }
            </div>

            <div class="dashboard-card">
              <h3 class="text-sm font-medium text-app-text">{{ 'dashboard.command.services.title' | translate }}</h3>
              <p class="text-xs text-app-text-tertiary mb-3">{{ 'dashboard.command.services.subtitle' | translate }}</p>
              @if (loading()) {
                <p-skeleton height="8rem"></p-skeleton>
              } @else if (d && d.topServices.length === 0) {
                <app-empty-state compact icon="pi pi-list" [message]="'dashboard.command.services.empty' | translate"></app-empty-state>
              } @else if (d) {
                <table class="w-full text-sm">
                  <thead>
                    <tr class="text-xs text-app-text-tertiary text-left">
                      <th class="font-normal pb-1"></th>
                      <th class="font-normal pb-1 text-right">{{ 'dashboard.command.services.quantity' | translate }}</th>
                      <th class="font-normal pb-1 text-right">{{ 'dashboard.command.services.revenue' | translate }}</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-app-border">
                    @for (s of d.topServices; track $index) {
                      <tr>
                        <td class="py-2 pr-2 text-app-text truncate max-w-[12rem]">{{ s.name }}</td>
                        <td class="py-2 text-right text-app-text-secondary tabular-nums">{{ s.quantity | number:'1.0-2' }}</td>
                        <td class="py-2 text-right text-app-text tabular-nums">{{ s.revenue.amount | currency:s.revenue.currency }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              }
            </div>
          </div>

          @if (planUsageRows().length) {
            <div class="pt-2">
              <h3 class="text-xs font-semibold text-app-text-tertiary uppercase tracking-wide mb-3">
                {{ 'dashboard.owner.planUsage' | translate }}
              </h3>
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
                @for (row of planUsageRows(); track row.labelKey) {
                  <div class="bg-app-bg border border-app-border rounded-xl p-4">
                    <p class="text-xs text-app-text-tertiary mb-1">{{ row.labelKey | translate }}</p>
                    <p class="text-lg font-bold text-app-text">
                      {{ row.quota.used }}
                      <span class="text-sm font-normal text-app-text-tertiary">
                        / {{ row.quota.limit === -1 ? ('dashboard.owner.unlimited' | translate) : row.quota.limit }}
                      </span>
                    </p>
                  </div>
                }
              </div>
            </div>
          }
        </section>
      }
    </div>
  `,
})
export class OwnerDashboardComponent implements OnInit {
  private dashboardService = inject(DashboardService);
  private translate = inject(TranslateService);
  private locale = inject(LOCALE_ID);
  private destroyRef = inject(DestroyRef);
  private currency = new CurrencyPipe(this.locale);
  private request$ = new Subject<void>();

  readonly periods = PERIODS;
  readonly groupOrder = GROUP_ORDER;

  period = signal<DashboardPeriod>('THIS_MONTH');
  customRange = new FormControl<Date[] | null>(null);

  data = signal<OwnerCommandCenter | null>(null);
  planUsage = signal<OwnerDashboard['planUsage'] | null>(null);
  loading = signal(true);
  /** Recarga por troca de período: mantém o conteúdo anterior, esmaecido, em vez de voltar ao esqueleto. */
  refreshing = signal(false);
  error = signal(false);

  planUsageRows = computed<PlanUsageRow[]>(() => {
    const usage = this.planUsage();
    if (!usage) return [];
    return [
      { labelKey: 'dashboard.owner.planUsageAdmin', quota: usage.adminUsers },
      { labelKey: 'dashboard.owner.planUsageField', quota: usage.fieldUsers },
      { labelKey: 'dashboard.owner.planUsageOrders', quota: usage.orders },
    ];
  });

  conversionValue = computed<string | null>(() => {
    const rate = this.data()?.kpis.conversion.current;
    return rate === null || rate === undefined ? null : `${rate}%`;
  });

  receivableHint = computed<string | null>(() => {
    const receivable = this.data()?.kpis.receivable;
    if (!receivable || receivable.overdueCount === 0) return null;
    return `${this.money(receivable.overdue)} ${this.translate.instant('dashboard.command.kpi.overdue')}`;
  });

  funnelSteps = computed(() => {
    const funnel = this.data()?.funnel;
    if (!funnel || funnel.created === 0) return [];
    const width = (v: number) => Math.round((v / funnel.created) * 100);
    return [
      { key: 'created', value: funnel.created, widthPct: 100 },
      { key: 'sent', value: funnel.sent, widthPct: width(funnel.sent) },
      { key: 'awaiting', value: funnel.awaiting, widthPct: width(funnel.awaiting) },
      { key: 'approved', value: funnel.approved, widthPct: width(funnel.approved) },
    ];
  });

  /** Teto "redondo" do eixo (1, 2, 5 × 10ⁿ) com base no maior ponto; barras e linhas de grade usam a mesma escala. */
  revenueScale = computed(() => {
    const d = this.data();
    const peak = d ? Math.max(...d.revenueSeries.map(p => p.amount.amount), 0) : 0;
    if (!d || peak <= 0) return { max: 0, ticks: [] as { pct: number; label: string }[] };
    const magnitude = 10 ** Math.floor(Math.log10(peak));
    const max = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map(m => m * magnitude).find(v => v >= peak) ?? peak;
    const fmt = new Intl.NumberFormat(this.locale, {
      style: 'currency', currency: d.revenueSeries[0].amount.currency, notation: 'compact', maximumFractionDigits: 1,
    });
    return { max, ticks: [0, 50, 100].map(pct => ({ pct, label: fmt.format((max * pct) / 100) })) };
  });

  revenueBars = computed<RevenueBar[]>(() => {
    const d = this.data();
    if (!d) return [];
    const max = this.revenueScale().max;
    if (max <= 0) return [];
    const pattern = d.revenueSeriesGranularity === 'MONTH' ? 'MMM/yy' : 'dd/MM';
    return d.revenueSeries.map(p => ({
      heightPct: (p.amount.amount / max) * 100,
      title: `${formatDate(p.date, pattern, this.locale)}: ${this.money(p.amount)}`,
    }));
  });

  revenueAxis = computed(() => {
    const d = this.data();
    if (!d || d.revenueSeries.length === 0) return { first: '', last: '' };
    const pattern = d.revenueSeriesGranularity === 'MONTH' ? 'MMM/yy' : 'dd/MM';
    const first = d.revenueSeries[0].date;
    const last = d.revenueSeries[d.revenueSeries.length - 1].date;
    return { first: formatDate(first, pattern, this.locale), last: formatDate(last, pattern, this.locale) };
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
        return this.dashboardService.getOwnerCommandCenter(this.period(), from, to).pipe(
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
    // Uso do plano é secundário e não depende do período; se falhar, a seção simplesmente não aparece.
    this.dashboardService.getSummary<OwnerDashboard>().subscribe({
      next: summary => this.planUsage.set(summary.planUsage),
      error: () => this.planUsage.set(null),
    });
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

  attentionRoute(type: AttentionType): string {
    return ATTENTION_ROUTE[type];
  }

  /** Filtro que reproduz o alerta na lista (atrasadas não têm um só estado, ficam sem) e destaque das ordens. */
  attentionQuery(item: CommandCenterAttention): Record<string, string> {
    const query: Record<string, string> = { ...ATTENTION_QUERY[item.type] };
    if (item.orderIds.length) query['highlight'] = item.orderIds.join(',');
    return query;
  }

  severityDot(severity: AttentionSeverity): string {
    return SEVERITY_DOT[severity];
  }

  groupDot(group: TodayOperationGroup): string {
    return GROUP_DOT[group];
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
