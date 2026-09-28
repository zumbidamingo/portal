import { CommonModule, formatDate } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, LOCALE_ID, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { Subject, catchError, exhaustMap, of, tap, timer } from 'rxjs';
import {
  AttentionSeverity,
  DashboardService,
  OperatorCommandCenter,
  OperatorExceptionType,
  OperatorLiveOrder,
  OperatorPipelineStage,
  OperatorSlaRate,
  OperatorTeamState,
} from '../../core/services/dashboard.service';
import { KpiCardComponent } from '../../shared/components/kpi-card/kpi-card.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';

/** Onde cada número da central leva: uma lista já filtrada, ou o bloco da própria página que o explica. */
interface Destination {
  route?: string;
  queryParams?: Record<string, string>;
  anchor?: string;
}

/** Um número da central que a Operação lê como sinal — pontos de cor no lugar de gráficos. */
type Tone = 'danger' | 'warning' | 'neutral' | 'success';

/** A central é uma torre de controle: atualiza sozinha. Mesmo padrão de polling de `notification.service.ts`. */
const REFRESH_INTERVAL_MS = 60_000;
/** Ocupação a partir da qual o dia já é lido como apertado. */
const TIGHT_OCCUPANCY_PCT = 85;

const EXCEPTION_DESTINATION: Record<OperatorExceptionType, Destination> = {
  LATE_ORDERS: { anchor: 'operator-attention' },
  NO_CHECKIN: { anchor: 'operator-attention' },
  LAUNDRY_OVERDUE: { anchor: 'operator-laundry' },
  ORDERS_ON_HOLD: { route: '/orders', queryParams: { status: 'ON_HOLD' } },
  ORDERS_PARTIALLY_DONE: { route: '/orders', queryParams: { status: 'PARTIALLY_DONE' } },
  ORDERS_UNASSIGNED: { route: '/orders', queryParams: { status: 'SCHEDULED' } },
  DELIVERIES_UNSCHEDULED: { route: '/laundry/pending-delivery' },
  DAYS_OVER_CAPACITY: { anchor: 'operator-capacity' },
  ORDERS_TO_SCHEDULE: { route: '/orders', queryParams: { status: 'CREATED' } },
};

/** Etapa do pipeline → estado que a lista de ordens sabe filtrar (a etapa "a caminho" é uma ordem atribuída). */
const STAGE_STATUS: Record<OperatorPipelineStage, string> = {
  SCHEDULED: 'SCHEDULED',
  EN_ROUTE: 'ASSIGNED',
  CHECKED_IN: 'CHECKED_IN',
  IN_PROGRESS: 'IN_PROGRESS',
  PARTIALLY_DONE: 'PARTIALLY_DONE',
  AWAITING_RETURN: 'AWAITING_RETURN',
  COMPLETED: 'COMPLETED',
  FINISHED: 'FINISHED',
};

const SEVERITY_DOT: Record<AttentionSeverity, string> = {
  DANGER: 'bg-app-danger',
  WARNING: 'bg-app-warning',
  INFO: 'bg-app-text-tertiary',
};

const TEAM_STATE_DOT: Record<OperatorTeamState, string> = {
  IN_SERVICE: 'bg-app-success',
  EN_ROUTE: 'bg-app-accent',
  ON_HOLD: 'bg-app-warning',
  AVAILABLE: 'bg-app-text-tertiary',
  UNAVAILABLE: 'bg-app-border',
};

/**
 * Central de operação do OPERATOR — "o que está acontecendo agora e onde preciso intervir". Três
 * níveis: "Agora" (operação ao vivo + o que pede intervenção), "Risco" (SLA e exceções) e "Fluxo e
 * capacidade" (pipeline, lavandaria, capacidade, equipes). Todo número vem de
 * `GET /dashboard/operator/command-center`; sem base, o campo vem nulo e a tela diz "sem dados" em
 * vez de um zero inventado. Cada alerta leva à ordem, rota, equipe ou item de lavandaria que o
 * origina. Sem faturamento, margem nem métrica comercial — isso vive nos painéis de quem decide
 * sobre eles.
 */
@Component({
  selector: 'app-operator-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, TranslatePipe, ButtonModule, SkeletonModule, EmptyStateComponent, KpiCardComponent, PageHeaderComponent],
  template: `
    <div class="space-y-6 max-w-6xl mx-auto">
      <app-page-header [title]="'dashboard.operator.title' | translate" [description]="'dashboard.operator.subtitle' | translate">
        <div class="flex items-center gap-3">
          @if (updatedAt(); as time) {
            <span class="text-xs text-app-text-tertiary">{{ 'dashboard.operator.updatedAt' | translate:{ time: time } }}</span>
          }
          <p-button icon="pi pi-refresh" [rounded]="true" [text]="true" size="small" [loading]="loading()"
                    [attr.aria-label]="'dashboard.operator.refresh' | translate" (click)="reload()"></p-button>
        </div>
      </app-page-header>

      @if (error()) {
        <div class="bg-app-surface border border-app-border rounded-xl p-4 flex items-center gap-3">
          <i class="pi pi-exclamation-circle text-app-danger text-xl" aria-hidden="true"></i>
          <p class="text-sm text-app-danger flex-1">{{ 'dashboard.command.loadError' | translate }}</p>
          <p-button [label]="'dashboard.command.retry' | translate" size="small" [outlined]="true" (click)="reload()"></p-button>
        </div>
      } @else {
        @let d = data();

        <div class="grid grid-cols-2 lg:grid-cols-6 gap-4">
          <a routerLink="/orders" class="block min-w-0">
            <app-kpi-card [label]="'dashboard.operator.kpi.ordersToday' | translate" icon="pi-calendar"
                          [plainValue]="d ? d.kpis.ordersToday.total : null"
                          [hint]="d ? ('dashboard.operator.kpi.ordersTodayHint' | translate:{ count: d.kpis.ordersToday.completed }) : null"
                          [loading]="loading()"></app-kpi-card>
          </a>
          <a routerLink="/orders" [queryParams]="{ status: 'IN_PROGRESS' }" class="block min-w-0">
            <app-kpi-card [label]="'dashboard.operator.kpi.inProgress' | translate" icon="pi-play"
                          [plainValue]="d ? d.kpis.inProgress.orders : null"
                          [hint]="d ? ('dashboard.operator.kpi.inProgressHint' | translate:{ count: d.kpis.inProgress.technicians }) : null"
                          [loading]="loading()"></app-kpi-card>
          </a>
          <button type="button" class="block min-w-0 text-left" (click)="scrollTo('operator-attention')">
            <app-kpi-card [label]="'dashboard.operator.kpi.atRisk' | translate" icon="pi-exclamation-circle"
                          [plainValue]="d ? d.kpis.atRisk : null"
                          [hint]="d && d.kpis.atRisk > 0 ? ('dashboard.operator.kpi.atRiskHint' | translate) : null"
                          [loading]="loading()"></app-kpi-card>
          </button>
          <button type="button" class="block min-w-0 text-left" (click)="scrollTo('operator-sla')">
            <app-kpi-card [label]="'dashboard.operator.kpi.punctuality' | translate" icon="pi-clock"
                          [plainValue]="punctualityValue()"
                          [hint]="punctualityHint()" [loading]="loading()"></app-kpi-card>
          </button>
          <button type="button" class="block min-w-0 text-left" (click)="scrollTo('operator-attention')">
            <app-kpi-card [label]="'dashboard.operator.kpi.late' | translate" icon="pi-stopwatch"
                          [plainValue]="d ? d.kpis.lateOrders.count : null"
                          [hint]="lateHint()" [loading]="loading()"></app-kpi-card>
          </button>
          @if (loading() || d?.kpis?.laundry) {
            <a routerLink="/laundry" class="block min-w-0">
              <app-kpi-card [label]="'dashboard.operator.kpi.laundry' | translate" icon="pi-box"
                            [plainValue]="d?.kpis?.laundry?.inProcess ?? null"
                            [hint]="'dashboard.operator.kpi.laundryHint' | translate" [loading]="loading()"></app-kpi-card>
            </a>
          }
        </div>

        <!-- ============ AGORA ============ -->
        <section class="space-y-3">
          <h2 class="text-xs font-semibold text-app-text-tertiary uppercase tracking-wide">
            {{ 'dashboard.operator.section.now' | translate }}
          </h2>
          <div class="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div class="lg:col-span-3 dashboard-card">
              <div class="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                <h3 class="text-sm font-medium text-app-text">{{ 'dashboard.operator.live.title' | translate }}</h3>
                <label class="flex items-center gap-1.5 text-xs text-app-text-secondary cursor-pointer">
                  <input type="checkbox" [checked]="hideDone()" (change)="hideDone.set(!hideDone())">
                  {{ 'dashboard.operator.live.hideDone' | translate }}
                </label>
              </div>
              @if (loading()) {
                <p-skeleton height="14rem"></p-skeleton>
              } @else if (d) {
                <div class="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-xs text-app-text-secondary">
                  @for (chip of liveSummary(); track chip.key) {
                    <span class="inline-flex items-center gap-1.5">
                      <span class="w-2 h-2 rounded-full" [class]="toneDot(chip.tone)" aria-hidden="true"></span>
                      {{ 'dashboard.operator.live.summary.' + chip.key | translate:{ count: chip.count } }}
                    </span>
                  }
                </div>
                @if (visibleLive().length === 0) {
                  <app-empty-state compact icon="pi pi-calendar" [message]="'dashboard.operator.live.empty' | translate"></app-empty-state>
                } @else {
                  <ul class="divide-y divide-app-border max-h-[26rem] overflow-y-auto">
                    @for (o of visibleLive(); track o.orderId) {
                      <li class="flex items-center gap-3 py-2">
                        <span class="w-11 shrink-0 text-xs text-app-text-tertiary tabular-nums">{{ time(o.scheduledStartAt) }}</span>
                        <a class="min-w-0 flex-1 hover:underline" routerLink="/orders" [queryParams]="{ open: o.orderId }">
                          <span class="text-sm text-app-text">#{{ o.orderNumber }}</span>
                          <span class="text-sm text-app-text-secondary"> · {{ o.description ?? ('dashboard.operator.noDescription' | translate) }}</span>
                        </a>
                        @if (o.technicianId) {
                          <a class="hidden sm:block w-24 truncate text-xs text-app-text-secondary hover:underline"
                             routerLink="/routing" [queryParams]="routeParams(o)">{{ o.technicianName }}</a>
                        } @else {
                          <span class="hidden sm:block w-24 truncate text-xs text-app-text-tertiary">—</span>
                        }
                        <span class="inline-flex items-center gap-1.5 w-44 shrink-0 text-xs"
                              [class]="liveTone(o) === 'danger' ? 'text-app-danger' : 'text-app-text-secondary'">
                          <span class="w-2 h-2 rounded-full shrink-0" [class]="toneDot(liveTone(o))" aria-hidden="true"></span>
                          <span class="truncate">{{ liveLabel(o) }}</span>
                        </span>
                      </li>
                    }
                  </ul>
                }
              }
            </div>

            <div id="operator-attention" class="lg:col-span-2 dashboard-card scroll-mt-4">
              <h3 class="text-sm font-medium text-app-text mb-3">{{ 'dashboard.operator.attention.title' | translate }}</h3>
              @if (loading()) {
                <p-skeleton height="14rem"></p-skeleton>
              } @else if (d && d.attention.lateTotal === 0 && d.attention.atRiskTotal === 0) {
                <app-empty-state compact icon="pi pi-check-circle" iconClass="text-app-success" [message]="'dashboard.operator.attention.empty' | translate"></app-empty-state>
              } @else if (d) {
                @if (d.attention.late.length) {
                  <p class="text-xs font-medium text-app-danger mb-1">
                    {{ 'dashboard.operator.attention.late' | translate:{ count: d.attention.lateTotal } }}
                  </p>
                  <ul class="divide-y divide-app-border mb-4">
                    @for (o of d.attention.late; track o.orderId) {
                      <ng-container *ngTemplateOutlet="attentionRow; context: { $implicit: o, tone: 'danger' }"></ng-container>
                    }
                  </ul>
                }
                @if (d.attention.atRisk.length) {
                  <p class="text-xs font-medium text-app-warning mb-1">
                    {{ 'dashboard.operator.attention.atRisk' | translate:{ count: d.attention.atRiskTotal } }}
                  </p>
                  <ul class="divide-y divide-app-border">
                    @for (o of d.attention.atRisk; track o.orderId) {
                      <ng-container *ngTemplateOutlet="attentionRow; context: { $implicit: o, tone: 'warning' }"></ng-container>
                    }
                  </ul>
                }
                @if (d.attention.lateTotal > d.attention.late.length || d.attention.atRiskTotal > d.attention.atRisk.length) {
                  <p class="text-xs text-app-text-tertiary mt-2">{{ 'dashboard.operator.attention.more' | translate }}</p>
                }
              }
            </div>
          </div>
        </section>

        <ng-template #attentionRow let-o let-tone="tone">
          <li class="py-2.5">
            <div class="flex items-start gap-2.5">
              <span class="w-2 h-2 rounded-full shrink-0 mt-1.5" [class]="toneDot(tone)" aria-hidden="true"></span>
              <div class="min-w-0 flex-1">
                <a class="text-sm text-app-text hover:underline" routerLink="/orders" [queryParams]="{ open: o.orderId }">
                  #{{ o.orderNumber }}@if (o.customerName) { — {{ o.customerName }} }
                </a>
                <p class="text-xs text-app-text-tertiary truncate">
                  {{ o.description ?? ('dashboard.operator.noDescription' | translate) }}
                  · {{ time(o.scheduledStartAt) }}@if (o.technicianName) { · {{ o.technicianName }} }
                </p>
                <p class="text-xs mt-0.5" [class]="tone === 'danger' ? 'text-app-danger' : 'text-app-warning'">
                  @if (o.risk) { {{ 'dashboard.operator.risk.' + o.risk | translate }} } @else { {{ liveLabel(o) }} }
                </p>
              </div>
              @if (o.technicianId) {
                <a class="text-xs text-app-text-secondary underline underline-offset-2 shrink-0"
                   routerLink="/routing" [queryParams]="routeParams(o)">{{ 'dashboard.operator.attention.route' | translate }}</a>
              }
            </div>
          </li>
        </ng-template>

        <!-- ============ RISCO ============ -->
        <section class="space-y-3">
          <h2 class="text-xs font-semibold text-app-text-tertiary uppercase tracking-wide">
            {{ 'dashboard.operator.section.risk' | translate }}
          </h2>
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div id="operator-sla" class="dashboard-card scroll-mt-4">
              <h3 class="text-sm font-medium text-app-text">{{ 'dashboard.operator.sla.title' | translate }}</h3>
              <p class="text-xs text-app-text-tertiary mb-3">
                {{ 'dashboard.operator.sla.subtitle' | translate:{ days: d?.sla?.windowDays ?? 7 } }}
              </p>
              @if (loading()) {
                <p-skeleton height="9rem"></p-skeleton>
              } @else if (d) {
                <ul class="space-y-4">
                  @for (row of slaRows(); track row.key) {
                    <li>
                      <div class="flex items-baseline justify-between gap-3">
                        <span class="text-sm text-app-text-secondary">{{ 'dashboard.operator.sla.' + row.key | translate }}</span>
                        @if (row.rate.ratePct != null) {
                          <span class="text-lg font-medium tabular-nums" [class]="rateTone(row.rate.ratePct)">{{ row.rate.ratePct | number:'1.0-1' }}%</span>
                        } @else {
                          <span class="text-sm text-app-text-tertiary">{{ 'dashboard.kpi.noData' | translate }}</span>
                        }
                      </div>
                      <div class="h-1.5 rounded bg-app-surface mt-1.5">
                        <div class="h-1.5 rounded" [class]="rateBar(row.rate.ratePct)" [style.width.%]="row.rate.ratePct ?? 0"></div>
                      </div>
                      <p class="text-xs text-app-text-tertiary mt-1">
                        {{ 'dashboard.operator.sla.detail' | translate:{ onTime: row.rate.onTime, late: row.rate.late, total: row.rate.measured } }}
                      </p>
                    </li>
                  }
                </ul>
                <p class="text-xs text-app-text-tertiary mt-4 pt-3 border-t border-app-border">{{ 'dashboard.operator.sla.rule' | translate }}</p>
              }
            </div>

            <div class="dashboard-card">
              <h3 class="text-sm font-medium text-app-text">{{ 'dashboard.operator.exceptions.title' | translate }}</h3>
              <p class="text-xs text-app-text-tertiary mb-3">{{ 'dashboard.operator.exceptions.subtitle' | translate }}</p>
              @if (loading()) {
                <p-skeleton height="9rem"></p-skeleton>
              } @else if (d && d.exceptions.length === 0) {
                <app-empty-state compact icon="pi pi-check-circle" iconClass="text-app-success" [message]="'dashboard.operator.exceptions.empty' | translate"></app-empty-state>
              } @else if (d) {
                <ul class="divide-y divide-app-border">
                  @for (item of d.exceptions; track item.type) {
                    @let dest = exceptionDestination(item.type);
                    <li>
                      @if (dest.anchor; as anchor) {
                        <button type="button" class="w-full flex items-center gap-3 py-2.5 hover:bg-app-surface -mx-2 px-2 rounded-lg text-left"
                                (click)="scrollTo(anchor)">
                          <ng-container *ngTemplateOutlet="exceptionBody; context: { $implicit: item }"></ng-container>
                        </button>
                      } @else {
                        <a [routerLink]="dest.route" [queryParams]="dest.queryParams"
                           class="flex items-center gap-3 py-2.5 hover:bg-app-surface -mx-2 px-2 rounded-lg">
                          <ng-container *ngTemplateOutlet="exceptionBody; context: { $implicit: item }"></ng-container>
                        </a>
                      }
                    </li>
                  }
                </ul>
              }
            </div>
          </div>
        </section>

        <ng-template #exceptionBody let-item>
          <span class="w-2 h-2 rounded-full shrink-0" [class]="severityDot(item.severity)" aria-hidden="true"></span>
          <span class="text-lg font-medium text-app-text w-8 shrink-0 tabular-nums">{{ item.count }}</span>
          <span class="text-sm text-app-text-secondary flex-1 min-w-0">{{ 'dashboard.operator.exceptions.type.' + item.type | translate }}</span>
          <i class="pi pi-angle-right text-app-text-tertiary text-xs" aria-hidden="true"></i>
        </ng-template>

        <!-- ============ FLUXO E CAPACIDADE ============ -->
        <section class="space-y-3">
          <h2 class="text-xs font-semibold text-app-text-tertiary uppercase tracking-wide">
            {{ 'dashboard.operator.section.flow' | translate }}
          </h2>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div class="dashboard-card">
              <h3 class="text-sm font-medium text-app-text">{{ 'dashboard.operator.pipeline.title' | translate }}</h3>
              <p class="text-xs text-app-text-tertiary mb-3">{{ 'dashboard.operator.pipeline.subtitle' | translate }}</p>
              @if (loading()) {
                <p-skeleton height="12rem"></p-skeleton>
              } @else if (d) {
                @if (d.pipeline.toSchedule > 0) {
                  <a routerLink="/orders" [queryParams]="{ status: 'CREATED' }"
                     class="flex items-baseline gap-3 text-sm mb-3 pb-3 border-b border-app-border hover:bg-app-surface -mx-2 px-2 rounded-lg">
                    <span class="flex-1 text-app-text-secondary">{{ 'dashboard.operator.pipeline.toSchedule' | translate }}</span>
                    <span class="font-medium text-app-text tabular-nums">{{ d.pipeline.toSchedule }}</span>
                  </a>
                }
                <ul class="space-y-1">
                  @for (stage of pipelineRows(); track stage.stage) {
                    <li>
                      <a routerLink="/orders" [queryParams]="{ status: stage.status }"
                         class="block hover:bg-app-surface -mx-2 px-2 py-1.5 rounded-lg">
                        <div class="flex items-baseline gap-3 text-sm">
                          <span class="text-app-text-secondary flex-1 min-w-0 truncate">{{ 'dashboard.operator.pipeline.stage.' + stage.stage | translate }}</span>
                          @if (stage.late > 0) {
                            <span class="text-xs text-app-danger">{{ 'dashboard.operator.pipeline.late' | translate:{ count: stage.late } }}</span>
                          }
                          <span class="font-medium text-app-text w-8 text-right tabular-nums">{{ stage.count }}</span>
                        </div>
                        <div class="h-1.5 rounded bg-app-surface mt-1">
                          <div class="h-1.5 rounded" [class]="stage.late > 0 ? 'bg-app-danger/70' : 'bg-app-text/70'" [style.width.%]="stage.widthPct"></div>
                        </div>
                      </a>
                    </li>
                  }
                </ul>
              }
            </div>

            <div id="operator-capacity" class="dashboard-card scroll-mt-4">
              <h3 class="text-sm font-medium text-app-text">{{ 'dashboard.operator.capacity.title' | translate }}</h3>
              <p class="text-xs text-app-text-tertiary mb-3">{{ 'dashboard.operator.capacity.subtitle' | translate }}</p>
              @if (loading()) {
                <p-skeleton height="12rem"></p-skeleton>
              } @else if (d) {
                <ul class="space-y-3.5">
                  @for (day of capacityRows(); track day.date) {
                    <li>
                      <div class="flex items-baseline gap-3 text-sm">
                        <span class="text-app-text w-24 shrink-0 capitalize">{{ day.label }}</span>
                        <span class="text-xs text-app-text-tertiary flex-1 min-w-0 truncate">{{ day.detail }}</span>
                        @if (day.occupancyPct != null) {
                          <span class="font-medium tabular-nums" [class]="day.over ? 'text-app-danger' : 'text-app-text'">{{ day.occupancyPct }}%</span>
                        } @else {
                          <span class="text-xs text-app-text-tertiary">{{ 'dashboard.operator.capacity.noTeam' | translate }}</span>
                        }
                      </div>
                      <div class="h-1.5 rounded bg-app-surface mt-1.5">
                        <div class="h-1.5 rounded" [class]="day.over ? 'bg-app-danger' : day.tight ? 'bg-app-warning' : 'bg-app-text/70'"
                             [style.width.%]="day.barPct"></div>
                      </div>
                      @if (day.over) {
                        <p class="text-xs text-app-danger mt-1">{{ 'dashboard.operator.capacity.over' | translate }}</p>
                      }
                    </li>
                  }
                </ul>
              }
            </div>
          </div>

          @if (loading() || d?.laundry) {
            <div id="operator-laundry" class="dashboard-card scroll-mt-4">
              <div class="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                <h3 class="text-sm font-medium text-app-text">{{ 'dashboard.operator.laundry.title' | translate }}</h3>
                <a routerLink="/laundry" class="text-xs text-app-text-secondary underline underline-offset-2">
                  {{ 'dashboard.operator.laundry.open' | translate }}
                </a>
              </div>
              @if (loading()) {
                <p-skeleton height="12rem"></p-skeleton>
              } @else if (d?.laundry; as l) {
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  @for (stage of l.stages; track stage.status) {
                    <a routerLink="/laundry" [queryParams]="{ status: stage.status }"
                       class="bg-app-surface border border-app-border rounded-lg p-3 hover:border-app-text-tertiary">
                      <p class="text-xs text-app-text-tertiary">{{ 'dashboard.operator.laundry.stage.' + stage.status | translate }}</p>
                      <p class="text-2xl font-medium text-app-text tabular-nums">{{ stage.count }}</p>
                      @if (stage.overdue > 0) {
                        <p class="text-xs text-app-danger">{{ 'dashboard.operator.laundry.overdueCount' | translate:{ count: stage.overdue } }}</p>
                      }
                    </a>
                  }
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-5">
                  <div>
                    <div class="flex items-baseline justify-between gap-3 mb-2">
                      <h4 class="text-xs font-semibold text-app-text-tertiary uppercase tracking-wide">{{ 'dashboard.operator.laundry.sla' | translate }}</h4>
                      @if (l.sla.ratePct != null) {
                        <span class="text-sm font-medium tabular-nums" [class]="rateTone(l.sla.ratePct)">
                          {{ 'dashboard.operator.laundry.slaRate' | translate:{ rate: l.sla.ratePct } }}
                        </span>
                      } @else {
                        <span class="text-xs text-app-text-tertiary">{{ 'dashboard.kpi.noData' | translate }}</span>
                      }
                    </div>
                    <p class="text-xs text-app-text-tertiary mb-2">
                      {{ 'dashboard.operator.laundry.slaRule' | translate:{ days: l.sla.turnaroundDays } }}
                    </p>
                    @if (l.overdueItems.length === 0) {
                      <app-empty-state compact icon="pi pi-check-circle" iconClass="text-app-success" [message]="'dashboard.operator.laundry.noOverdue' | translate"></app-empty-state>
                    } @else {
                      <ul class="divide-y divide-app-border">
                        @for (item of l.overdueItems; track item.itemId) {
                          <li>
                            <a routerLink="/laundry" [queryParams]="{ order: item.orderId }"
                               class="flex items-center gap-3 py-2 hover:bg-app-surface -mx-2 px-2 rounded-lg">
                              <span class="w-2 h-2 rounded-full bg-app-danger shrink-0" aria-hidden="true"></span>
                              <div class="min-w-0 flex-1">
                                <p class="text-sm text-app-text truncate">
                                  <span class="font-mono text-xs">{{ item.code }}</span>
                                  @if (item.description) { · {{ item.description }} }
                                </p>
                                @if (item.customerName) {
                                  <p class="text-xs text-app-text-tertiary truncate">{{ item.customerName }}</p>
                                }
                              </div>
                              <span class="text-xs text-app-danger shrink-0 text-right">
                                {{ 'dashboard.operator.laundry.overdueRow' | translate:{ days: item.daysInLaundry, limit: l.sla.turnaroundDays } }}
                              </span>
                            </a>
                          </li>
                        }
                      </ul>
                    }
                  </div>

                  <div>
                    <div class="flex items-baseline justify-between gap-3 mb-2">
                      <h4 class="text-xs font-semibold text-app-text-tertiary uppercase tracking-wide">{{ 'dashboard.operator.laundry.deliveries' | translate }}</h4>
                      <span class="text-xs text-app-text-secondary">
                        {{ 'dashboard.operator.laundry.deliveriesSummary' | translate:{ released: l.deliveries.released, ready: l.deliveries.ready } }}
                      </span>
                    </div>
                    @if (l.deliveries.upcoming.length === 0) {
                      <p class="text-sm text-app-text-secondary">{{ 'dashboard.operator.laundry.noDeliveries' | translate }}</p>
                    } @else {
                      <ul class="divide-y divide-app-border">
                        @for (row of l.deliveries.upcoming; track row.itemId) {
                          <li>
                            <a routerLink="/orders" [queryParams]="deliveryParams(row.orderId, row.scheduledFor)"
                               class="flex items-center gap-3 py-2 hover:bg-app-surface -mx-2 px-2 rounded-lg">
                              <div class="min-w-0 flex-1">
                                <p class="text-sm text-app-text truncate">
                                  {{ row.customerName ?? ('dashboard.operator.noCustomer' | translate) }}
                                </p>
                                <p class="text-xs text-app-text-tertiary truncate">
                                  <span class="font-mono">{{ row.code }}</span>@if (row.description) { · {{ row.description }} }
                                  @if (row.waitingSince) { · {{ 'dashboard.operator.laundry.readyFor' | translate:{ time: waiting(row.waitingSince) } }} }
                                </p>
                              </div>
                              @if (row.scheduledFor) {
                                <span class="text-xs text-app-text shrink-0">{{ row.scheduledFor | date:'short' }}</span>
                              } @else {
                                <span class="text-xs text-app-warning shrink-0">{{ 'dashboard.operator.laundry.unscheduled' | translate }}</span>
                              }
                            </a>
                          </li>
                        }
                      </ul>
                      @if (l.deliveries.released > l.deliveries.upcoming.length) {
                        <a routerLink="/laundry/pending-delivery" class="block text-xs text-app-text-secondary underline underline-offset-2 mt-2">
                          {{ 'dashboard.operator.laundry.allDeliveries' | translate }}
                        </a>
                      }
                    }
                  </div>
                </div>
              }
            </div>
          }

          <div class="dashboard-card">
            <h3 class="text-sm font-medium text-app-text mb-3">{{ 'dashboard.operator.team.title' | translate }}</h3>
            @if (loading()) {
              <p-skeleton height="8rem"></p-skeleton>
            } @else if (d && d.team.length === 0) {
              <app-empty-state compact icon="pi pi-users" [message]="'dashboard.operator.team.empty' | translate"></app-empty-state>
            } @else if (d) {
              <ul class="divide-y divide-app-border">
                @for (m of d.team; track m.technicianId) {
                  <li class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                    <span class="w-2 h-2 rounded-full shrink-0" [class]="teamDot(m.state)" aria-hidden="true"></span>
                    <a class="text-sm text-app-text hover:underline min-w-0 basis-32 flex-1 truncate"
                       routerLink="/routing" [queryParams]="{ technician: m.technicianId, date: d.date }">{{ m.name }}</a>
                    <span class="text-xs text-app-text-secondary w-32 shrink-0">{{ 'dashboard.operator.team.state.' + m.state | translate }}</span>
                    <span class="text-xs text-app-text-tertiary w-24 shrink-0 tabular-nums">
                      {{ 'dashboard.operator.team.progress' | translate:{ done: m.completed, total: m.orders } }}
                    </span>
                    <span class="text-xs text-app-text-secondary w-36 shrink-0 truncate">
                      @if (m.currentOrderId) {
                        <a class="underline underline-offset-2" routerLink="/orders" [queryParams]="{ open: m.currentOrderId }">#{{ m.currentOrderNumber }}</a>
                      }
                      @if (m.nextAt) {
                        @if (m.currentOrderId) { · }
                        {{ 'dashboard.operator.team.next' | translate:{ time: time(m.nextAt) } }}
                      }
                    </span>
                  </li>
                }
              </ul>
            }
          </div>
        </section>
      }
    </div>
  `,
})
export class OperatorDashboardComponent implements OnInit {
  private dashboardService = inject(DashboardService);
  private translate = inject(TranslateService);
  private locale = inject(LOCALE_ID);
  private destroyRef = inject(DestroyRef);
  private request$ = new Subject<void>();

  data = signal<OperatorCommandCenter | null>(null);
  loading = signal(true);
  error = signal(false);
  hideDone = signal(false);

  updatedAt = computed(() => {
    const at = this.data()?.generatedAt;
    return at ? this.time(at) : null;
  });

  punctualityValue = computed<string | null>(() => {
    const rate = this.data()?.kpis.punctuality.ratePct;
    return rate === null || rate === undefined ? null : `${rate}%`;
  });

  punctualityHint = computed<string | null>(() => {
    const p = this.data()?.kpis.punctuality;
    if (!p || p.total === 0) return null;
    return this.translate.instant('dashboard.operator.kpi.punctualityHint', { onTime: p.onTime, total: p.total, days: p.windowDays });
  });

  lateHint = computed<string | null>(() => {
    const late = this.data()?.kpis.lateOrders;
    if (!late || late.count === 0 || late.maxDelayMinutes == null) return null;
    return this.translate.instant('dashboard.operator.kpi.lateHint', { minutes: late.maxDelayMinutes });
  });

  visibleLive = computed(() => {
    const live = this.data()?.liveOrders ?? [];
    return this.hideDone() ? live.filter(o => o.liveState !== 'DONE') : live;
  });

  /** "🟢 7 concluídas · 🔵 8 em andamento · 🟡 7 agendadas · 🔴 2 atrasadas" — só o que existe. */
  liveSummary = computed<{ key: string; count: number; tone: Tone }[]>(() => {
    const live = this.data()?.liveOrders ?? [];
    const count = (...states: string[]) => live.filter(o => states.includes(o.liveState)).length;
    return [
      { key: 'done', count: count('DONE'), tone: 'success' as Tone },
      { key: 'inService', count: count('IN_SERVICE'), tone: 'neutral' as Tone },
      { key: 'scheduled', count: count('EN_ROUTE', 'NOT_STARTED', 'UNASSIGNED'), tone: 'warning' as Tone },
      { key: 'late', count: count('LATE'), tone: 'danger' as Tone },
    ].filter(chip => chip.count > 0);
  });

  slaRows = computed<{ key: string; rate: OperatorSlaRate }[]>(() => {
    const sla = this.data()?.sla;
    return sla ? [
      { key: 'arrival', rate: sla.arrival },
      { key: 'start', rate: sla.start },
      { key: 'completion', rate: sla.completion },
    ] : [];
  });

  pipelineRows = computed(() => {
    const stages = this.data()?.pipeline.stages ?? [];
    const max = Math.max(...stages.map(s => s.count), 0);
    return stages.map(s => ({ ...s, status: STAGE_STATUS[s.stage], widthPct: max > 0 ? Math.round((s.count / max) * 100) : 0 }));
  });

  capacityRows = computed(() => {
    return (this.data()?.capacity ?? []).map((day, index) => {
      const occupancy = day.occupancyPct ?? null;
      return {
        date: day.date,
        label: index === 0 ? this.translate.instant('dashboard.operator.capacity.today')
          : index === 1 ? this.translate.instant('dashboard.operator.capacity.tomorrow')
          : formatDate(day.date, 'EEE dd/MM', this.locale),
        detail: this.translate.instant('dashboard.operator.capacity.detail', {
          orders: day.orders,
          planned: this.hours(day.plannedMinutes),
          capacity: day.capacityMinutes == null ? '—' : this.hours(day.capacityMinutes),
        }),
        occupancyPct: occupancy,
        over: occupancy !== null && occupancy > 100,
        tight: occupancy !== null && occupancy >= TIGHT_OCCUPANCY_PCT,
        barPct: Math.min(100, occupancy ?? 0),
      };
    });
  });

  constructor() {
    this.request$.pipe(
      tap(() => this.error.set(false)),
      // `exhaustMap`: uma resposta lenta não empilha pedidos por cima do polling.
      exhaustMap(() => this.dashboardService.getOperatorCommandCenter().pipe(
        catchError(() => {
          this.error.set(true);
          return of(null);
        }),
      )),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(result => {
      this.loading.set(false);
      if (result) this.data.set(result);
    });
    timer(REFRESH_INTERVAL_MS, REFRESH_INTERVAL_MS).pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.request$.next());
  }

  ngOnInit() {
    this.reload();
  }

  reload() {
    this.loading.set(this.data() === null);
    this.request$.next();
  }

  scrollTo(anchor: string) {
    document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  exceptionDestination(type: OperatorExceptionType): Destination {
    return EXCEPTION_DESTINATION[type];
  }

  severityDot(severity: AttentionSeverity): string {
    return SEVERITY_DOT[severity];
  }

  teamDot(state: OperatorTeamState): string {
    return TEAM_STATE_DOT[state];
  }

  toneDot(tone: Tone): string {
    return { danger: 'bg-app-danger', warning: 'bg-app-warning', success: 'bg-app-success', neutral: 'bg-app-text-tertiary' }[tone];
  }

  liveTone(o: OperatorLiveOrder): Tone {
    if (o.liveState === 'LATE') return 'danger';
    if (o.risk || o.liveState === 'ON_HOLD') return 'warning';
    if (o.liveState === 'DONE') return 'success';
    return 'neutral';
  }

  /** O estado já com o número que o torna útil: "Em andamento · 42 min", "A caminho · chegada prevista 10:18". */
  liveLabel(o: OperatorLiveOrder): string {
    const key = 'dashboard.operator.live.state.' + o.liveState;
    if (o.liveState === 'EN_ROUTE' && o.expectedArrivalAt) {
      return this.translate.instant(key + 'Eta', { time: this.time(o.expectedArrivalAt) });
    }
    if ((o.liveState === 'IN_SERVICE' || o.liveState === 'LATE') && o.minutes != null) {
      return this.translate.instant(key + 'Minutes', { minutes: o.minutes });
    }
    return this.translate.instant(key);
  }

  rateTone(pct: number | null | undefined): string {
    if (pct == null) return 'text-app-text-tertiary';
    return pct >= 90 ? 'text-app-success' : pct >= 75 ? 'text-app-warning' : 'text-app-danger';
  }

  rateBar(pct: number | null | undefined): string {
    if (pct == null) return 'bg-app-border';
    return pct >= 90 ? 'bg-app-success' : pct >= 75 ? 'bg-app-warning' : 'bg-app-danger';
  }

  /** A rota do técnico no dia do atendimento (a tela de rotas usa o id do usuário). */
  routeParams(o: OperatorLiveOrder): Record<string, string> {
    return { technician: o.technicianId!, date: formatDate(o.scheduledStartAt, 'yyyy-MM-dd', this.locale) };
  }

  /** Item sem entrega marcada cai direto na aba de agendamento da ordem; marcado, abre a ordem. */
  deliveryParams(orderId: string, scheduledFor?: string | null): Record<string, string> {
    return scheduledFor ? { open: orderId } : { open: orderId, tab: 'schedule' };
  }

  time(iso: string): string {
    return formatDate(iso, 'HH:mm', this.locale);
  }

  /** Tempo de espera em horas (menos de um dia) ou dias. */
  waiting(iso: string): string {
    const hours = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000));
    return hours < 24
      ? this.translate.instant('dashboard.operator.laundry.hours', { count: hours })
      : this.translate.instant('dashboard.operator.laundry.days', { count: Math.floor(hours / 24) });
  }

  private hours(minutes: number): string {
    const value = Math.round(minutes / 6) / 10;
    return `${value.toLocaleString(this.locale)}h`;
  }
}
