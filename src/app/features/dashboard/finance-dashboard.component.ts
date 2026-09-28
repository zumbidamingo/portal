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
  DashboardPeriod,
  DashboardService,
  FinanceAttentionType,
  FinanceCommandCenter,
  KpiMoney,
} from '../../core/services/dashboard.service';
import { KpiCardComponent } from '../../shared/components/kpi-card/kpi-card.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';

interface Destination {
  route: string;
  queryParams?: Record<string, string>;
}

interface SeriesBar {
  invoicedPct: number;
  receivedPct: number;
  title: string;
}

const PERIODS: DashboardPeriod[] = ['TODAY', 'THIS_WEEK', 'THIS_MONTH', 'LAST_30_DAYS', 'CUSTOM'];

/** Cada linha de "Precisa da sua atenção" abre a tela que a resolve. */
const ATTENTION_DESTINATION: Record<FinanceAttentionType, Destination> = {
  OVERDUE_INVOICES: { route: '/financial/invoices' },
  DUE_TODAY: { route: '/financial/invoices' },
  FINISHED_TO_INVOICE: { route: '/financial/invoices' },
  COMMISSIONS_TO_CALCULATE: { route: '/financial/commissions' },
  COMMISSIONS_NEEDS_REVIEW: { route: '/financial/commissions' },
};

const SEVERITY_DOT: Record<AttentionSeverity, string> = {
  DANGER: 'bg-app-danger',
  WARNING: 'bg-app-warning',
  INFO: 'bg-app-text-tertiary',
};

/**
 * Central financeira do FINANCE: faturado, recebido, em aberto, vencido, a faturar e comissões.
 * Todo número vem de `GET /dashboard/finance/command-center`; sem base, o campo vem nulo e a tela
 * mostra "sem dados" em vez de um zero inventado. Os KPIs de posição (a receber, atraso, a
 * faturar, comissões) são "hoje" e não mudam com o período; faturado e recebido sim. Valores
 * chegam na moeda operacional do tenant — nunca a `billingCurrency` do Stripe (CLAUDE.md §7A).
 */
@Component({
  selector: 'app-finance-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe, ButtonModule, DatePickerModule, SkeletonModule,
    EmptyStateComponent, KpiCardComponent, PageHeaderComponent,
  ],
  template: `
    <div class="dashboard-page space-y-6 max-w-6xl mx-auto" [class.is-refreshing]="refreshing()">
      <app-page-header [title]="'dashboard.finance.title' | translate" [description]="'dashboard.finance.subtitle' | translate"></app-page-header>

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

        <!-- ============ KPIs ============ -->
        <section class="space-y-3">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <a routerLink="/financial/invoices" class="block min-w-0">
              <app-kpi-card [label]="'dashboard.finance.kpi.invoiced' | translate" icon="pi-file"
                            [money]="d?.kpis?.invoiced?.current ?? null"
                            [variationPct]="d?.kpis?.invoiced?.changePct ?? null"
                            variationLabelKey="dashboard.command.vsPrevious" [loading]="loading()"></app-kpi-card>
            </a>
            <a routerLink="/financial/payments" class="block min-w-0">
              <app-kpi-card [label]="'dashboard.finance.kpi.received' | translate" icon="pi-wallet"
                            [money]="d?.kpis?.received?.current ?? null"
                            [variationPct]="d?.kpis?.received?.changePct ?? null"
                            variationLabelKey="dashboard.command.vsPrevious" [loading]="loading()"></app-kpi-card>
            </a>
            <a routerLink="/financial/invoices" class="block min-w-0">
              <app-kpi-card [label]="'dashboard.finance.kpi.receivable' | translate" icon="pi-inbox"
                            [money]="d?.kpis?.receivable?.amount ?? null"
                            [hint]="countHint('dashboard.finance.kpi.receivableHint', d?.kpis?.receivable?.count)"
                            [loading]="loading()"></app-kpi-card>
            </a>
            <a routerLink="/financial/invoices" class="block min-w-0">
              <app-kpi-card [label]="'dashboard.finance.kpi.overdue' | translate" icon="pi-exclamation-triangle"
                            [money]="d?.kpis?.overdue?.amount ?? null"
                            [hint]="countHint('dashboard.finance.kpi.overdueHint', d?.kpis?.overdue?.count)"
                            [loading]="loading()"></app-kpi-card>
            </a>
            <a routerLink="/financial/invoices" class="block min-w-0">
              <app-kpi-card [label]="'dashboard.finance.kpi.toInvoice' | translate" icon="pi-clock"
                            [money]="d?.kpis?.toInvoice?.amount ?? null"
                            [hint]="countHint('dashboard.finance.kpi.toInvoiceHint', d?.kpis?.toInvoice?.count)"
                            [loading]="loading()"></app-kpi-card>
            </a>
            <a routerLink="/financial/commissions" class="block min-w-0">
              <app-kpi-card [label]="'dashboard.finance.kpi.commissions' | translate" icon="pi-users"
                            [money]="d?.kpis?.commissionsToPay?.amount ?? null"
                            [hint]="countHint('dashboard.finance.kpi.commissionsHint', d?.kpis?.commissionsToPay?.count)"
                            [loading]="loading()"></app-kpi-card>
            </a>
          </div>
          <p class="text-xs text-app-text-tertiary">{{ 'dashboard.finance.kpi.positionNote' | translate }}</p>
        </section>

        <!-- ============ AGORA ============ -->
        <section class="space-y-3">
          <h2 class="text-xs font-semibold text-app-text-tertiary uppercase tracking-wide">
            {{ 'dashboard.command.section.now' | translate }}
          </h2>
          <div class="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div class="lg:col-span-2 dashboard-card">
              <h3 class="text-sm font-medium text-app-text mb-3">{{ 'dashboard.finance.attention.title' | translate }}</h3>
              @if (loading()) {
                <p-skeleton height="8rem"></p-skeleton>
              } @else if (d && d.attention.length === 0) {
                <app-empty-state compact icon="pi pi-check-circle" iconClass="text-app-success" [message]="'dashboard.finance.attention.empty' | translate"></app-empty-state>
              } @else if (d) {
                <ul class="divide-y divide-app-border">
                  @for (item of d.attention; track item.type) {
                    <li>
                      <a [routerLink]="attentionDestination(item.type).route"
                         class="flex items-center gap-3 py-2.5 hover:bg-app-surface -mx-2 px-2 rounded-lg">
                        <span class="w-2 h-2 rounded-full shrink-0" [class]="severityDot(item.severity)" aria-hidden="true"></span>
                        <span class="text-lg font-medium text-app-text w-8 shrink-0 tabular-nums">{{ item.count }}</span>
                        <span class="text-sm text-app-text-secondary flex-1 min-w-0">
                          {{ 'dashboard.finance.attention.type.' + item.type | translate }}
                        </span>
                        @if (item.amount; as amount) {
                          <span class="text-xs text-app-text-tertiary shrink-0 tabular-nums">{{ amount.amount | currency:amount.currency }}</span>
                        }
                        <i class="pi pi-angle-right text-app-text-tertiary text-xs" aria-hidden="true"></i>
                      </a>
                    </li>
                  }
                </ul>
              }
            </div>

            <div class="lg:col-span-3 dashboard-card">
              <h3 class="text-sm font-medium text-app-text">{{ 'dashboard.finance.receivables.title' | translate }}</h3>
              <p class="text-xs text-app-text-tertiary mb-3">{{ 'dashboard.finance.receivables.subtitle' | translate }}</p>
              @if (loading()) {
                <p-skeleton height="8rem"></p-skeleton>
              } @else if (d) {
                <dl class="grid grid-cols-2 gap-x-6 gap-y-2.5">
                  @for (row of receivableRows(); track row.key) {
                    <div class="flex items-baseline justify-between gap-3" [class.col-span-2]="row.wide">
                      <dt class="text-sm" [class]="row.danger ? 'text-app-danger' : 'text-app-text-secondary'">
                        {{ 'dashboard.finance.receivables.' + row.key | translate }}
                      </dt>
                      <dd class="text-sm font-medium text-app-text tabular-nums">{{ row.value.amount | currency:row.value.currency }}</dd>
                    </div>
                  }
                </dl>
              }
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div class="lg:col-span-3 dashboard-card">
              <div class="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                <h3 class="text-sm font-medium text-app-text">{{ 'dashboard.finance.overdue.title' | translate }}</h3>
                @if (d && d.kpis.overdue.count > d.overdueInvoices.length) {
                  <span class="text-xs text-app-text-tertiary">
                    {{ 'dashboard.finance.showing' | translate:{ shown: d.overdueInvoices.length, total: d.kpis.overdue.count } }}
                  </span>
                }
              </div>
              @if (loading()) {
                <p-skeleton height="8rem"></p-skeleton>
              } @else if (d && d.overdueInvoices.length === 0) {
                <app-empty-state compact icon="pi pi-check-circle" iconClass="text-app-success" [message]="'dashboard.finance.overdue.empty' | translate"></app-empty-state>
              } @else if (d) {
                <ul class="divide-y divide-app-border">
                  @for (row of d.overdueInvoices; track row.invoiceId) {
                    <li class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                      <div class="min-w-0 flex-1 basis-48">
                        <p class="text-sm text-app-text truncate">
                          {{ row.customerName ?? ('dashboard.finance.noName' | translate) }}
                        </p>
                        <p class="text-xs text-app-text-tertiary truncate">
                          {{ 'dashboard.finance.overdue.invoice' | translate:{ number: row.invoiceNumber } }}
                          · {{ 'dashboard.finance.overdue.days' | translate:{ count: row.daysOverdue } }}
                        </p>
                      </div>
                      <span class="text-sm text-app-text tabular-nums shrink-0">{{ row.outstanding.amount | currency:row.outstanding.currency }}</span>
                      <a class="text-sm font-medium text-app-text underline underline-offset-2 shrink-0" routerLink="/financial/invoices">
                        {{ 'dashboard.finance.overdue.open' | translate }}
                      </a>
                    </li>
                  }
                </ul>
              }
            </div>

            <div class="lg:col-span-2 dashboard-card">
              <h3 class="text-sm font-medium text-app-text">{{ 'dashboard.finance.aging.title' | translate }}</h3>
              <p class="text-xs text-app-text-tertiary mb-3">{{ 'dashboard.finance.aging.subtitle' | translate }}</p>
              @if (loading()) {
                <p-skeleton height="8rem"></p-skeleton>
              } @else if (d) {
                <ul class="space-y-2.5">
                  @for (bucket of agingRows(); track bucket.range) {
                    <li>
                      <div class="flex items-baseline gap-3 text-sm">
                        <span class="text-app-text-secondary flex-1 min-w-0">{{ 'dashboard.finance.aging.range.' + bucket.range | translate }}</span>
                        <span class="text-xs text-app-text-tertiary tabular-nums">{{ bucket.count }}</span>
                        <span class="font-medium text-app-text tabular-nums">{{ bucket.amount.amount | currency:bucket.amount.currency }}</span>
                      </div>
                      <div class="h-1.5 rounded bg-app-surface mt-1">
                        <div class="h-1.5 rounded bg-app-danger/70" [style.width.%]="bucket.widthPct"></div>
                      </div>
                    </li>
                  }
                </ul>
              }
            </div>
          </div>
        </section>

        <!-- ============ DESEMPENHO ============ -->
        <section class="space-y-3">
          <h2 class="text-xs font-semibold text-app-text-tertiary uppercase tracking-wide">
            {{ 'dashboard.command.section.performance' | translate }}
          </h2>
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div class="lg:col-span-2 dashboard-card">
              <div class="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                <h3 class="text-sm font-medium text-app-text">{{ 'dashboard.finance.series.title' | translate }}</h3>
                <div class="flex items-center gap-3 text-xs text-app-text-tertiary">
                  <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm bg-app-text/80"></span>{{ 'dashboard.finance.series.invoiced' | translate }}</span>
                  <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm bg-app-success"></span>{{ 'dashboard.finance.series.received' | translate }}</span>
                </div>
              </div>
              @if (loading()) {
                <p-skeleton height="9rem"></p-skeleton>
              } @else if (seriesBars().length === 0) {
                <app-empty-state compact icon="pi pi-chart-bar" [message]="'dashboard.finance.series.empty' | translate"></app-empty-state>
              } @else {
                <div class="flex gap-2 pt-3" role="img" [attr.aria-label]="'dashboard.finance.series.title' | translate">
                  <div class="relative w-12 h-36 shrink-0 text-[11px] text-app-text-tertiary tabular-nums" aria-hidden="true">
                    @for (tick of seriesYTicks(); track tick.pct) {
                      <span class="absolute right-0 -translate-y-1/2 leading-none" [style.bottom.%]="tick.pct">{{ tick.label }}</span>
                    }
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="relative h-36 border-b border-l border-app-border">
                      @for (tick of seriesYTicks(); track tick.pct) {
                        @if (tick.pct > 0) {
                          <div class="absolute inset-x-0 border-t border-dashed border-app-border/70" [style.bottom.%]="tick.pct" aria-hidden="true"></div>
                        }
                      }
                      <div class="relative flex items-end gap-0.5 h-full">
                        @for (bar of seriesBars(); track $index) {
                          <div class="flex-1 min-w-0 flex items-end gap-px h-full" [title]="bar.title">
                            <div class="flex-1 rounded-t bg-app-text/80"
                                 [style.height.%]="bar.invoicedPct" [style.min-height.px]="bar.invoicedPct > 0 ? 2 : 0"></div>
                            <div class="flex-1 rounded-t bg-app-success"
                                 [style.height.%]="bar.receivedPct" [style.min-height.px]="bar.receivedPct > 0 ? 2 : 0"></div>
                          </div>
                        }
                      </div>
                    </div>
                    <div class="relative h-4 mt-1.5 text-[11px] text-app-text-tertiary" aria-hidden="true">
                      @for (tick of seriesXTicks(); track tick.leftPct) {
                        <span class="absolute -translate-x-1/2 whitespace-nowrap" [style.left.%]="tick.leftPct">{{ tick.label }}</span>
                      }
                    </div>
                  </div>
                </div>
              }
            </div>

            <div class="dashboard-card">
              <h3 class="text-sm font-medium text-app-text mb-3">{{ 'dashboard.finance.methods.title' | translate }}</h3>
              @if (loading()) {
                <p-skeleton height="9rem"></p-skeleton>
              } @else if (d && d.paymentMethods.length === 0) {
                <app-empty-state compact icon="pi pi-list" [message]="'dashboard.finance.methods.empty' | translate"></app-empty-state>
              } @else if (d) {
                <ul class="space-y-2.5">
                  @for (m of d.paymentMethods; track m.method) {
                    <li>
                      <div class="flex items-baseline gap-3 text-sm">
                        <span class="text-app-text-secondary flex-1 min-w-0 truncate">{{ 'dashboard.finance.methods.method.' + m.method | translate }}</span>
                        @if (m.sharePct !== null && m.sharePct !== undefined) {
                          <span class="text-xs text-app-text-tertiary tabular-nums">{{ m.sharePct }}%</span>
                        }
                        <span class="font-medium text-app-text tabular-nums">{{ m.amount.amount | currency:m.amount.currency }}</span>
                      </div>
                      <div class="h-1.5 rounded bg-app-surface mt-1">
                        <div class="h-1.5 rounded bg-app-success/70" [style.width.%]="m.sharePct ?? 0"></div>
                      </div>
                    </li>
                  }
                </ul>
              }
            </div>
          </div>
        </section>

        <!-- ============ FLUXO E PENDÊNCIAS ============ -->
        <section class="space-y-3">
          <h2 class="text-xs font-semibold text-app-text-tertiary uppercase tracking-wide">
            {{ 'dashboard.finance.section.flow' | translate }}
          </h2>
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div class="dashboard-card">
              <div class="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                <h3 class="text-sm font-medium text-app-text">{{ 'dashboard.finance.toInvoice.title' | translate }}</h3>
                @if (d && d.toInvoice.count > d.toInvoice.orders.length) {
                  <span class="text-xs text-app-text-tertiary">
                    {{ 'dashboard.finance.showing' | translate:{ shown: d.toInvoice.orders.length, total: d.toInvoice.count } }}
                  </span>
                }
              </div>
              @if (loading()) {
                <p-skeleton height="8rem"></p-skeleton>
              } @else if (d && d.toInvoice.orders.length === 0) {
                <app-empty-state compact icon="pi pi-check-circle" iconClass="text-app-success" [message]="'dashboard.finance.toInvoice.empty' | translate"></app-empty-state>
              } @else if (d) {
                <ul class="divide-y divide-app-border">
                  @for (row of d.toInvoice.orders; track row.orderId) {
                    <li class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                      <div class="min-w-0 flex-1 basis-40">
                        <p class="text-sm text-app-text truncate">{{ row.customerName ?? ('dashboard.finance.noName' | translate) }}</p>
                        <p class="text-xs text-app-text-tertiary truncate">
                          #{{ row.orderNumber }}@if (row.description) { · {{ row.description }} }
                        </p>
                      </div>
                      <span class="text-sm text-app-text tabular-nums shrink-0">{{ row.amount.amount | currency:row.amount.currency }}</span>
                      <a class="text-sm font-medium text-app-text underline underline-offset-2 shrink-0"
                         routerLink="/orders" [queryParams]="{ open: row.orderId }">
                        {{ 'dashboard.finance.toInvoice.open' | translate }}
                      </a>
                    </li>
                  }
                </ul>
                <a routerLink="/financial/invoices" class="inline-block mt-3 text-sm font-medium text-app-text underline underline-offset-2">
                  {{ 'dashboard.finance.toInvoice.issue' | translate }}
                </a>
              }
            </div>

            <div class="dashboard-card">
              <div class="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                <h3 class="text-sm font-medium text-app-text">{{ 'dashboard.finance.upcoming.title' | translate }}</h3>
                @if (upcomingTotal(); as total) {
                  <span class="text-xs text-app-text-tertiary tabular-nums">
                    {{ 'dashboard.finance.upcoming.total' | translate:{ amount: total } }}
                  </span>
                }
              </div>
              @if (loading()) {
                <p-skeleton height="8rem"></p-skeleton>
              } @else if (d) {
                <ul class="divide-y divide-app-border">
                  @for (day of d.upcoming; track day.date; let i = $index) {
                    <li class="flex items-baseline justify-between gap-3 py-2">
                      <span class="text-sm text-app-text-secondary">
                        @if (i === 0) { {{ 'dashboard.finance.upcoming.today' | translate }} }
                        @else if (i === 1) { {{ 'dashboard.finance.upcoming.tomorrow' | translate }} }
                        @else { {{ dayLabel(day.date) }} }
                      </span>
                      <span class="text-xs text-app-text-tertiary tabular-nums">
                        @if (day.invoiceCount > 0) { {{ 'dashboard.finance.upcoming.invoices' | translate:{ count: day.invoiceCount } }} }
                      </span>
                      <span class="text-sm font-medium tabular-nums" [class]="day.amount.amount > 0 ? 'text-app-text' : 'text-app-text-tertiary'">
                        {{ day.amount.amount | currency:day.amount.currency }}
                      </span>
                    </li>
                  }
                </ul>
              }
            </div>
          </div>

          <div class="dashboard-card">
            <div class="flex flex-wrap items-baseline justify-between gap-2 mb-3">
              <h3 class="text-sm font-medium text-app-text">{{ 'dashboard.finance.commissions.title' | translate }}</h3>
              <a routerLink="/financial/commissions" class="text-sm font-medium text-app-text underline underline-offset-2">
                {{ 'dashboard.finance.commissions.open' | translate }}
              </a>
            </div>
            @if (loading()) {
              <p-skeleton height="8rem"></p-skeleton>
            } @else if (d) {
              <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <dl class="space-y-2.5">
                  <div class="flex items-baseline justify-between gap-3">
                    <dt class="text-sm text-app-text-secondary">{{ 'dashboard.finance.commissions.toPay' | translate }}</dt>
                    <dd class="text-sm font-medium text-app-text tabular-nums">{{ d.commissions.toPay.amount | currency:d.commissions.toPay.currency }}</dd>
                  </div>
                  <div class="flex items-baseline justify-between gap-3">
                    <dt class="text-sm text-app-text-secondary">{{ 'dashboard.finance.commissions.toCalculate' | translate }}</dt>
                    <dd class="text-sm font-medium text-app-text tabular-nums">{{ d.commissions.toCalculateCount }}</dd>
                  </div>
                  <div class="flex items-baseline justify-between gap-3">
                    <dt class="text-sm text-app-text-secondary">{{ 'dashboard.finance.commissions.needsReview' | translate }}</dt>
                    <dd class="text-sm font-medium text-app-text tabular-nums">{{ d.commissions.needsReviewCount }}</dd>
                  </div>
                  <div class="flex items-baseline justify-between gap-3">
                    <dt class="text-sm text-app-text-secondary">{{ 'dashboard.finance.commissions.paidInPeriod' | translate }}</dt>
                    <dd class="text-sm font-medium text-app-text tabular-nums">{{ d.commissions.paidInPeriod.amount | currency:d.commissions.paidInPeriod.currency }}</dd>
                  </div>
                </dl>
                <div class="lg:col-span-2">
                  @if (d.commissions.byProvider.length === 0) {
                    <app-empty-state compact icon="pi pi-percentage" [message]="'dashboard.finance.commissions.empty' | translate"></app-empty-state>
                  } @else {
                    <ul class="divide-y divide-app-border">
                      @for (row of d.commissions.byProvider; track row.providerId) {
                        <li class="flex items-baseline gap-3 py-2">
                          <span class="text-sm text-app-text flex-1 min-w-0 truncate">{{ row.providerName ?? ('dashboard.finance.noName' | translate) }}</span>
                          <span class="text-xs text-app-text-tertiary tabular-nums">{{ 'dashboard.finance.commissions.orders' | translate:{ count: row.orderCount } }}</span>
                          <span class="text-sm font-medium text-app-text tabular-nums">{{ row.amount.amount | currency:row.amount.currency }}</span>
                        </li>
                      }
                    </ul>
                  }
                </div>
              </div>
            }
          </div>
        </section>
      }
    </div>
  `,
})
export class FinanceDashboardComponent implements OnInit {
  private dashboardService = inject(DashboardService);
  private translate = inject(TranslateService);
  private locale = inject(LOCALE_ID);
  private destroyRef = inject(DestroyRef);
  private currency = new CurrencyPipe(this.locale);
  private request$ = new Subject<void>();

  readonly periods = PERIODS;

  period = signal<DashboardPeriod>('THIS_MONTH');
  customRange = new FormControl<Date[] | null>(null);

  data = signal<FinanceCommandCenter | null>(null);
  loading = signal(true);
  /** Recarga por troca de período: mantém o conteúdo anterior, esmaecido, em vez de voltar ao esqueleto. */
  refreshing = signal(false);
  error = signal(false);

  receivableRows = computed(() => {
    const r = this.data()?.receivables;
    if (!r) return [];
    return [
      { key: 'notDue', value: r.notDue, danger: false, wide: false },
      { key: 'overdue', value: r.overdue, danger: true, wide: false },
      { key: 'today', value: r.today, danger: false, wide: false },
      { key: 'next7Days', value: r.next7Days, danger: false, wide: false },
      { key: 'days8To30', value: r.days8To30, danger: false, wide: false },
      { key: 'over30Days', value: r.over30Days, danger: false, wide: false },
      ...(r.noDueDate.amount > 0 ? [{ key: 'noDueDate', value: r.noDueDate, danger: false, wide: true }] : []),
    ];
  });

  agingRows = computed(() => {
    const buckets = this.data()?.aging ?? [];
    const max = Math.max(...buckets.map(b => b.amount.amount), 0);
    return buckets.map(b => ({ ...b, widthPct: max > 0 ? Math.round((b.amount.amount / max) * 100) : 0 }));
  });

  upcomingTotal = computed<string | null>(() => {
    const days = this.data()?.upcoming ?? [];
    if (days.length === 0) return null;
    const total = days.reduce((sum, day) => sum + day.amount.amount, 0);
    return total > 0 ? this.money({ amount: total, currency: days[0].amount.currency }) : null;
  });

  /** Teto do eixo Y arredondado para 1/2/5 × 10ⁿ — ticks redondos em vez de o maior valor cru. */
  private niceMax = computed(() => {
    const d = this.data();
    if (!d) return 0;
    const max = Math.max(...d.series.map(p => Math.max(p.invoiced.amount, p.received.amount)), 0);
    if (max <= 0) return 0;
    const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
    const step = [1, 2, 5, 10].find(m => max <= m * magnitude)!;
    return step * magnitude;
  });

  seriesBars = computed<SeriesBar[]>(() => {
    const d = this.data();
    const max = this.niceMax();
    if (!d || max <= 0) return [];
    const pattern = d.seriesGranularity === 'MONTH' ? 'MMM/yy' : 'dd/MM';
    return d.series.map(p => ({
      invoicedPct: (p.invoiced.amount / max) * 100,
      receivedPct: (p.received.amount / max) * 100,
      title: `${formatDate(p.date, pattern, this.locale)} — ${this.translate.instant('dashboard.finance.series.invoiced')}: `
        + `${this.money(p.invoiced)} · ${this.translate.instant('dashboard.finance.series.received')}: ${this.money(p.received)}`,
    }));
  });

  /** Eixo Y: 0 na base e o teto no topo, com linhas de grade nos quartos intermédios. */
  seriesYTicks = computed(() => {
    const d = this.data();
    const max = this.niceMax();
    if (!d || d.series.length === 0 || max <= 0) return [];
    const currency = d.series[0].invoiced.currency;
    const compact = new Intl.NumberFormat(this.locale, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 });
    return [1, 0.75, 0.5, 0.25, 0].map(fraction => ({ pct: fraction * 100, label: compact.format(max * fraction) }));
  });

  /** Eixo X: até 6 datas espaçadas por igual, alinhadas ao centro do grupo de barras. */
  seriesXTicks = computed(() => {
    const d = this.data();
    if (!d || d.series.length === 0) return [];
    const pattern = d.seriesGranularity === 'MONTH' ? 'MMM/yy' : 'dd/MM';
    const count = d.series.length;
    const wanted = Math.min(count, 6);
    const indexes = new Set<number>();
    for (let i = 0; i < wanted; i++) indexes.add(wanted === 1 ? 0 : Math.round((i * (count - 1)) / (wanted - 1)));
    return [...indexes].map(i => ({
      leftPct: ((i + 0.5) / count) * 100,
      label: formatDate(d.series[i].date, pattern, this.locale),
    }));
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
        return this.dashboardService.getFinanceCommandCenter(this.period(), from, to).pipe(
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

  attentionDestination(type: FinanceAttentionType): Destination {
    return ATTENTION_DESTINATION[type];
  }

  severityDot(severity: AttentionSeverity): string {
    return SEVERITY_DOT[severity];
  }

  countHint(key: string, count: number | undefined): string | null {
    if (count === undefined || count === 0) return null;
    return this.translate.instant(key, { count });
  }

  dayLabel(date: string): string {
    return formatDate(date, 'EEE dd/MM', this.locale);
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
