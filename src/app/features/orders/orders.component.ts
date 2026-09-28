import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, OnInit, computed, effect, inject, signal, viewChildren } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormArray, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { DrawerModule } from 'primeng/drawer';
import { TabsModule } from 'primeng/tabs';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { TextareaModule } from 'primeng/textarea';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SkeletonModule } from 'primeng/skeleton';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, Subject, forkJoin, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, switchMap, tap } from 'rxjs/operators';
import { LaundryFeatureService } from '../../core/services/laundry-feature.service';
import { OrderService, Order, OrderPage, OrderStatus } from '../../core/services/order.service';
import { TenantUserService, TenantDirectoryEntry } from '../../core/services/tenant-user.service';
import { CustomerService, Customer } from '../../core/services/customer.service';
import { ServiceService, PriceType } from '../../core/services/catalog.service';
import { buildInstallmentOptions, paymentConditionLabel, paymentMethodLabel } from '../quotations/quotation-form.utils';
import type { PaymentCondition, PaymentMethod } from '../../core/services/payment-method.service';
import { PaymentMethodService, PAYMENT_CONDITIONS } from '../../core/services/payment-method.service';
import { priceTypeQuantityConfig, priceTypeUnitLabelKey } from '../../shared/utils/price-type.utils';
import { TenantService } from '../../core/services/tenant.service';
import { CustomerQuickCreateComponent } from '../../shared/components/customer-quick-create/customer-quick-create.component';
import { AuthService } from '../../core/auth/auth.service';
import { LocalizedDatePipe } from '../../shared/pipes/localized-date.pipe';
import { DurationMinutesPipe } from '../../shared/pipes/duration-minutes.pipe';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { TagBadgeComponent } from '../../shared/components/tag-badge/tag-badge.component';
import { OrderStatusBadgeComponent } from '../../shared/components/order-status-badge/order-status-badge.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { scheduleDurationMinutes } from '../../shared/utils/schedule-window.util';
import { OrderSummaryTabComponent } from './tabs/order-summary-tab.component';
import { OrderScheduleProviderTabComponent } from './tabs/order-schedule-provider-tab.component';
import { OrderItemsTabComponent } from './tabs/order-items-tab.component';
import { OrderExecutionTabComponent } from './tabs/order-execution-tab.component';
import { OrderHistoryTabComponent } from './tabs/order-history-tab.component';
import { OrderMarginTabComponent } from './tabs/order-margin-tab.component';
import { TableStandardDirective } from '../../shared/directives/table-standard.directive';

type ViewMode = 'board' | 'list' | 'schedule';

/** Ordem visual da máquina de estados (CLAUDE.md §10), agrupada por fase operacional — evita uma
 *  única linha de 9 colunas exigindo scroll horizontal para chegar em "Finalizada"; cada fase é
 *  uma linha curta (1-3 colunas). Suspensa/cancelada ficam num grupo secundário à parte, escondido
 *  por omissão (não removido — só não ocupa espaço permanente por padrão). */
interface BoardPhase {
  key: string;
  labelKey: string;
  descriptionKey: string;
  statuses: OrderStatus[];
}
/** Quem pode cadastrar cliente — mesmo grupo de escrita do CustomerController. */
const CUSTOMER_WRITE_ROLES = ['OWNER', 'ADMIN', 'OPERATOR'];

const BOARD_PHASES: BoardPhase[] = [
  { key: 'preparation', labelKey: 'orders.phasePreparation', descriptionKey: 'orders.phasePreparationDesc',
    statuses: ['CREATED', 'SCHEDULED', 'ASSIGNED'] },
  { key: 'execution', labelKey: 'orders.phaseExecution', descriptionKey: 'orders.phaseExecutionDesc',
    statuses: ['CHECKED_IN', 'IN_PROGRESS', 'AWAITING_RETURN', 'PARTIALLY_DONE'] },
  { key: 'completion', labelKey: 'orders.phaseCompletion', descriptionKey: 'orders.phaseCompletionDesc',
    statuses: ['COMPLETED', 'SIGNED'] },
  { key: 'finalization', labelKey: 'orders.phaseFinalization', descriptionKey: 'orders.phaseFinalizationDesc',
    statuses: ['FINISHED'] },
];
const PRIMARY_STATUSES: OrderStatus[] = BOARD_PHASES.flatMap(p => p.statuses);
const SECONDARY_STATUSES: OrderStatus[] = ['ON_HOLD', 'CANCELLED'];
const SECONDARY_PHASE: BoardPhase = {
  key: 'onhold', labelKey: 'orders.phaseOnHold', descriptionKey: 'orders.phaseOnHoldDesc',
  statuses: SECONDARY_STATUSES,
};
const ALL_STATUSES: OrderStatus[] = [...PRIMARY_STATUSES, ...SECONDARY_STATUSES];

/** Estados a partir dos quais cada ação de rodapé do Drawer fica disponível — espelha 1:1 a
 *  máquina de estados do backend (CLAUDE.md §10), nunca decide sozinho o que é permitido. */
const CANCELLABLE_STATUSES: OrderStatus[] = ['CREATED', 'SCHEDULED', 'ASSIGNED', 'ON_HOLD'];
const HOLDABLE_STATUSES: OrderStatus[] = ['ASSIGNED', 'CHECKED_IN', 'IN_PROGRESS', 'PARTIALLY_DONE'];

function toIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

@Component({
  selector: 'app-orders',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    TableModule,
    DialogModule,
    DrawerModule,
    TabsModule,
    SelectModule,
    DatePickerModule,
    TextareaModule,
    InputTextModule,
    InputNumberModule,
    ToastModule,
    CurrencyPipe,
    SkeletonModule,
    LocalizedDatePipe,
    DurationMinutesPipe,
    TranslatePipe,
    PageHeaderComponent,
    CustomerQuickCreateComponent,
    TagBadgeComponent,
    OrderStatusBadgeComponent,
    EmptyStateComponent,
    OrderSummaryTabComponent,
    OrderScheduleProviderTabComponent,
    OrderItemsTabComponent,
    OrderExecutionTabComponent,
    OrderHistoryTabComponent,
    OrderMarginTabComponent,
    TableStandardDirective,
  ],
  providers: [MessageService],
  styles: [`
    /* Ordens que o dashboard apontou (?highlight=): borda que pulsa e some sozinha. */
    .order-highlight {
      outline: 2px solid var(--app-accent);
      outline-offset: -2px;
      animation: order-highlight-fade 8s ease-out forwards;
    }
    @keyframes order-highlight-fade {
      0%, 60% { outline-color: var(--app-accent); }
      100% { outline-color: transparent; }
    }
    .orders-fade-bottom {
      mask-image: linear-gradient(to bottom, black calc(100% - 28px), transparent 100%);
      -webkit-mask-image: linear-gradient(to bottom, black calc(100% - 28px), transparent 100%);
    }
    /* Troca de vista (Quadro/Agenda/Lista): o bloco inteiro nasce/morre a cada @if, então a
       transição não pode ser [class]-based (não há "de" para animar) — entra com fade+slight
       rise no mount, sempre que o bloco aparece. */
    .orders-view-enter {
      animation: orders-view-fade-in 220ms ease-out both;
    }
    @keyframes orders-view-fade-in {
      from { opacity: 0; transform: translateY(4px); }
    }
    @media (prefers-reduced-motion: reduce) {
      .orders-view-enter { animation: none; }
    }
  `],
  template: `
    <p-toast />
    <div class="space-y-4 min-w-0">
      <app-page-header [title]="'orders.title' | translate" [description]="'orders.subtitle' | translate">
        @if (isDispatcher()) {
          <p-button size="small" [label]="'orders.newOrder' | translate" icon="pi pi-plus" severity="primary" (onClick)="openCreateDialog()" />
        }
        <p-button size="small" [label]="'orders.viewBoard' | translate" severity="secondary" [outlined]="view() !== 'board'" (onClick)="setView('board')" />
        <p-button size="small" [label]="'orders.viewSchedule' | translate" severity="secondary" [outlined]="view() !== 'schedule'" (onClick)="setView('schedule')" />
        <p-button size="small" [label]="'orders.viewList' | translate" severity="secondary" [outlined]="view() !== 'list'" (onClick)="setView('list')" />
      </app-page-header>

      <!-- FILTERS — compartilhados pelas três vistas -->
      <div class="flex flex-wrap items-end gap-3">
        <div class="w-48">
          <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'orders.statusFilter' | translate }}</label>
          <p-select [options]="statusOptions()" [(ngModel)]="statusFilter" optionLabel="label" optionValue="value"
                    appendTo="body" fluid [showClear]="true"
                    [placeholder]="'orders.allStatuses' | translate" (onChange)="applyFilters()" />
        </div>
        @if (isDispatcher()) {
          <div class="w-48">
            <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'orders.technicianFilter' | translate }}</label>
            <p-select [options]="technicianOptions()" [(ngModel)]="technicianFilter" optionLabel="label" optionValue="value"
                      appendTo="body" fluid [showClear]="true"
                      [placeholder]="'orders.allTechnicians' | translate" (onChange)="applyFilters()" />
          </div>
        }
        <div class="flex-1 min-w-56">
          <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5" for="orderCustomerSearch">
            {{ 'orders.customerFilter' | translate }}
          </label>
          <input pInputText id="orderCustomerSearch" fluid [(ngModel)]="customerFilter"
                 [placeholder]="'orders.customerSearchFilterPlaceholder' | translate"
                 autocomplete="off" (ngModelChange)="applyFilters()" />
        </div>
        <div class="w-64">
          <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'orders.periodFilter' | translate }}</label>
          <p-datepicker [(ngModel)]="periodRange" selectionMode="range" [readonlyInput]="true"
                        appendTo="body" fluid [showClear]="true" dateFormat="dd/mm/yy"
                        [placeholder]="'orders.allPeriods' | translate" (onSelect)="applyFilters()"
                        (onClear)="applyFilters()" />
        </div>
        @if (hasActiveFilters()) {
          <p-button [label]="'common.clearFilters' | translate" icon="pi pi-filter-slash" [text]="true" size="small"
                    (onClick)="clearFilters()" />
        }
      </div>

      @if (fetchTruncated()) {
        <div class="flex items-center gap-2 rounded-md border border-app-border bg-app-surface-hover px-3 py-2 text-xs text-app-text-secondary">
          <i class="pi pi-info-circle"></i>{{ 'orders.truncationNotice' | translate: { count: BATCH_LIMIT } }}
        </div>
      }

      <!-- BOARD VIEW — Kanban por FASE, não por estado: cada coluna é uma fase operacional
           (Preparação/Execução/Conclusão/Finalização), o cartão traz o estado exato da OS como
           etiqueta. Poucas colunas largas em vez de nove estreitas — sem scroll horizontal para
           chegar em "Finalização", e sem colunas vazias esparramando o quadro. Suspensa/Cancelada
           formam uma fase extra, escondida por omissão (não removida — só opcional). -->
      @if (view() === 'board') {
      <div class="orders-view-enter">
        @if (loading()) {
          <div class="flex flex-wrap items-stretch gap-4">
            @for (c of SKELETON_COLUMNS; track c) {
              <div class="bg-app-surface rounded-md border border-app-border flex-1 min-w-[260px] flex flex-col">
                <div class="px-3 py-2.5 border-b border-app-border"><p-skeleton width="45%" height="1rem"></p-skeleton></div>
                <div class="p-2.5 space-y-2">
                  @for (r of SKELETON_ROWS; track r) {
                    <p-skeleton height="6rem" class="!rounded-lg"></p-skeleton>
                  }
                </div>
              </div>
            }
          </div>
        }
        @if (!loading()) {
        <ng-template #column let-phase>
          <div class="bg-app-surface rounded-md border border-app-border flex-1 min-w-[260px] flex flex-col max-h-[calc(100vh-260px)]">
            <div class="px-3 py-2.5 border-b border-app-border shrink-0">
              <div class="flex justify-between items-center">
                <span class="font-semibold text-app-text text-sm">{{ phase.labelKey | translate }}</span>
                <span class="text-xs bg-app-surface-hover px-2 py-0.5 rounded-full font-medium text-app-text-secondary">
                  {{ ordersByPhase(phase).length }}
                </span>
              </div>
              <div class="text-xs text-app-text-tertiary mt-0.5">{{ phase.descriptionKey | translate }}</div>
            </div>
            <div #columnScroll class="p-2.5 space-y-2 overflow-y-auto flex-1"
                 [class.orders-fade-bottom]="columnFade()[phase.key]"
                 [attr.data-phase]="phase.key" (scroll)="onColumnScroll($event.target, phase.key)">
              @if (ordersByPhase(phase).length === 0) {
                <div class="text-xs text-app-text-tertiary text-center py-6">{{ 'orders.emptyColumn' | translate }}</div>
              }
              @for (o of ordersByPhase(phase); track o.id) {
                <div class="bg-app-bg rounded-lg border border-app-border hover:border-app-accent transition-colors cursor-pointer overflow-hidden"
                     [class.order-highlight]="isHighlighted(o)" [attr.data-order-id]="o.id"
                     (click)="openManage(o)">
                  <div class="p-3">
                    <div class="flex items-center justify-between mb-1.5 gap-2">
                      <span class="text-xs font-mono font-semibold text-app-accent-hover">#{{ o.orderNumber }}</span>
                      <div class="flex items-center gap-1.5">
                        @if (o.executionMode === 'EXTERNAL' && o.status !== 'FINISHED') {
                          <app-tag-badge [value]="(isReturnLeg(o) ? 'orders.returnLegTag' : 'orders.executionMode.EXTERNAL') | translate" severity="primary"></app-tag-badge>
                        }
                        <app-order-status-badge [status]="o.status" [label]="('orders.status.' + o.status) | translate"></app-order-status-badge>
                      </div>
                    </div>
                    @if (hasSibling(o)) {
                      <button type="button" class="flex items-center gap-1 text-[11px] text-app-accent-hover hover:underline mb-1.5"
                              (click)="$event.stopPropagation(); jumpToSibling(o)">
                        <i class="pi pi-sitemap text-[10px]"></i>{{ 'orders.splitSibling' | translate }}
                      </button>
                    }
                    <div class="text-sm font-medium text-app-text mb-1 truncate">{{ customerName(o.customerId) }}</div>
                    <div class="text-xs text-app-text-secondary mb-2 truncate">
                      <i class="pi pi-map-marker text-[10px] mr-1"></i>{{ o.address.street }}
                    </div>
                    @if (o.scheduledStartAt) {
                      <div class="text-xs text-app-text-secondary flex items-center gap-1 mb-1.5">
                        <i class="pi pi-clock"></i>{{ o.scheduledStartAt | localizedDate:'datetime':tenantTimezone() }}
                        <span class="text-app-text-tertiary">({{ scheduleDurationMinutes(o.scheduledStartAt, o.scheduledEndAt!) | durationMinutes }})</span>
                      </div>
                    }
                    <div class="flex items-center justify-between gap-2">
                      @if (o.technicianId || o.technicianIds.length) {
                        <span class="text-xs text-app-text-secondary truncate">{{ getTechnicianDisplay(o) }}</span>
                      } @else if (o.status !== 'CREATED') {
                        <app-tag-badge [value]="'orders.unassigned' | translate" severity="warn"></app-tag-badge>
                      } @else {
                        <span class="text-[11px] text-app-text-tertiary">{{ o.items.length }} {{ 'orders.items' | translate }}</span>
                      }
                      <span class="font-semibold text-app-text text-sm shrink-0">{{ total(o) | currency:o.currencyCode:'symbol':'1.2-2' }}</span>
                    </div>
                  </div>
                  @if (o.status === 'AWAITING_RETURN' && o.returnReady) {
                    <div class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-t"
                         [style.background-color]="'var(--status-green-bg)'"
                         [style.color]="'var(--status-green-fg)'"
                         [style.border-color]="'var(--app-border-subtle)'">
                      <i class="pi pi-check-circle text-[11px]"></i>{{ 'orders.returnReady' | translate }}
                    </div>
                  }
                </div>
              }
            </div>
          </div>
        </ng-template>

        <div class="flex flex-wrap items-stretch gap-4">
          @for (phase of BOARD_PHASES; track phase.key) {
            <ng-container *ngTemplateOutlet="column; context: { $implicit: phase }"></ng-container>
          }
        </div>

        <div class="pt-3">
          <p-button [label]="(showSecondary() ? 'orders.hideSecondaryColumns' : 'orders.showSecondaryColumns') | translate"
                    icon="pi pi-angle-{{ showSecondary() ? 'up' : 'down' }} transition-transform duration-200" [text]="true" size="small"
                    (onClick)="showSecondary.set(!showSecondary())" />
        </div>

        <div class="grid transition-[grid-template-rows] duration-300 ease-in-out"
             [style.grid-template-rows]="showSecondary() ? '1fr' : '0fr'">
          <div class="min-h-0 overflow-hidden">
            <div class="pt-3 w-full transition-opacity duration-200 ease-in-out"
                 [class.opacity-0]="!showSecondary()" [class.opacity-100]="showSecondary()">
              <ng-container *ngTemplateOutlet="column; context: { $implicit: SECONDARY_PHASE }"></ng-container>
            </div>
          </div>
        </div>
        }
      </div>
      }

      <!-- SCHEDULE / AGENDA VIEW -->
      @if (view() === 'schedule') {
      <div class="orders-view-enter">
        @if (loading()) {
          <div class="space-y-4">
            @for (r of SKELETON_ROWS; track r) {
              <p-skeleton height="4rem" class="!rounded-md"></p-skeleton>
            }
          </div>
        }
        @if (!loading()) {
          @if (scheduleDays().length === 0) {
            <app-empty-state icon="pi pi-calendar" [message]="'orders.noSchedule' | translate"></app-empty-state>
          } @else {
          <div class="space-y-4">
            @for (day of scheduleDays(); track day.key) {
              <div class="bg-app-bg rounded-md border border-app-border">
                <div class="px-4 py-2 bg-app-surface border-b border-app-border font-semibold text-sm text-app-text">
                  {{ day.date | localizedDate:'medium':tenantTimezone() }}
                </div>
                <div class="divide-y divide-app-border-subtle">
                  @for (o of day.orders; track o.id) {
                    <div class="px-4 py-3 flex items-center gap-4 hover:bg-app-surface-hover cursor-pointer"
                         [class.order-highlight]="isHighlighted(o)" [attr.data-order-id]="o.id" (click)="openManage(o)">
                      <div class="w-16 font-mono text-xs font-semibold text-app-accent-hover">#{{ o.orderNumber }}</div>
                      <div class="w-32 text-sm font-medium text-app-accent-hover">
                        {{ o.scheduledStartAt | localizedDate:'time':tenantTimezone() }} – {{ o.scheduledEndAt | localizedDate:'time':tenantTimezone() }}
                        <div class="text-[11px] font-normal text-app-text-tertiary">{{ 'common.estimatedDuration' | translate: { duration: (scheduleDurationMinutes(o.scheduledStartAt!, o.scheduledEndAt!) | durationMinutes) } }}</div>
                      </div>
                      <div class="flex-1 min-w-0">
                        <div class="text-sm text-app-text truncate">{{ customerName(o.customerId) }}</div>
                        <div class="text-xs text-app-text-secondary truncate">{{ o.address.street }}, {{ o.address.city }}</div>
                      </div>
                      <div class="text-xs text-app-text-secondary w-32 truncate">{{ getTechnicianDisplay(o) }}</div>
                      <app-order-status-badge [status]="o.status" [label]="('orders.status.' + o.status) | translate"></app-order-status-badge>
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        }
        }
      </div>
      }

      <!-- LIST VIEW -->
      @if (view() === 'list') {
      <div class="orders-view-enter">
        @if (ordersEmpty()) {
          <app-empty-state icon="pi pi-inbox" [message]="'orders.emptyList' | translate"
                            [subtitle]="'orders.emptyListSubtitle' | translate"
                            [actionLabel]="'orders.emptyListAction' | translate" actionRoute="/quotations"></app-empty-state>
        } @else {
        <p-table appTableStandard [value]="orders()" [lazy]="true" (onLazyLoad)="onLazyLoad($event)"
                 [rows]="pageSize" [totalRecords]="totalElements()" [loading]="loading()"
                 [sortField]="listSort?.field" [sortOrder]="listSort?.order ?? -1">
          <ng-template pTemplate="header">
            <tr>
              <th pSortableColumn="orderNumber">{{ 'orders.numberHeader' | translate }}<p-sortIcon field="orderNumber" /></th>
              <th>{{ 'orders.customerHeader' | translate }}</th>
              <th pSortableColumn="status">{{ 'orders.statusHeader' | translate }}<p-sortIcon field="status" /></th>
              <th pSortableColumn="scheduledStartAt">{{ 'orders.scheduledHeader' | translate }}<p-sortIcon field="scheduledStartAt" /></th>
              <th>{{ 'orders.technicianLabel' | translate }}</th>
              <th>{{ 'orders.addressHeader' | translate }}</th>
              <th class="text-right">{{ 'orders.totalHeader' | translate }}</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-o>
            <tr (click)="openManage(o)" class="cursor-pointer" [class.order-highlight]="isHighlighted(o)" [attr.data-order-id]="o.id">
              <td class="font-mono text-xs font-semibold text-app-accent-hover">#{{ o.orderNumber }}</td>
              <td class="text-sm text-app-text font-medium">{{ customerName(o.customerId) }}</td>
              <td><app-order-status-badge [status]="o.status" [label]="('orders.status.' + o.status) | translate"></app-order-status-badge></td>
              <td>
                @if (o.scheduledStartAt) {
                  <div>{{ 'common.estimatedArrival' | translate }}: {{ o.scheduledStartAt | localizedDate:'datetime':tenantTimezone() }}</div>
                  <div class="text-xs text-app-text-tertiary">{{ 'common.estimatedDuration' | translate: { duration: (scheduleDurationMinutes(o.scheduledStartAt, o.scheduledEndAt!) | durationMinutes) } }}</div>
                } @else {
                  {{ 'orders.noSchedule' | translate }}
                }
              </td>
              <td class="text-sm text-app-text-secondary">{{ getTechnicianDisplay(o) }}</td>
              <td>{{ o.address.street }}, {{ o.address.city }}</td>
              <td class="text-right">{{ total(o) | currency:o.currencyCode:'symbol':'1.2-2' }}</td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="7" class="text-center text-app-text-tertiary py-10">
                <i class="pi pi-search text-2xl mb-2 block"></i>
                <p class="text-sm font-medium text-app-text">{{ 'common.noResults' | translate }}</p>
                <p-button [label]="'common.clearFilters' | translate" [text]="true" size="small" class="inline-block mt-2"
                          (onClick)="clearFilters()"></p-button>
              </td>
            </tr>
          </ng-template>
        </p-table>
        }
      </div>
      }
    </div>

    <!-- DRAWER: gerir OS — substitui Detail/Schedule/Assign Dialog. Cabeçalho e rodapé fixos,
         corpo em abas com scroll único do drawer (mesmo desenho de providers.component.ts). -->
    <!-- styleClass, não class: p-drawer renderiza o painel num nó portado para fora do host, então
         class no seletor p-drawer não chega lá — cai no width default (18rem) sem aviso nenhum. -->
    <p-drawer [(visible)]="manageVisible" position="right" [dismissible]="true" [closeOnEscape]="true"
              styleClass="w-full! sm:w-[28rem]! lg:w-[44rem]!">
      <ng-template #header>
        @if (managing(); as o) {
          <div class="flex items-center gap-2 min-w-0">
            <span class="font-semibold text-app-text">#{{ o.orderNumber }}</span>
            <span class="text-app-text-secondary truncate">{{ customerName(o.customerId) }}</span>
            <app-order-status-badge [status]="o.status" [label]="('orders.status.' + o.status) | translate"></app-order-status-badge>
            @if (o.executionMode === 'EXTERNAL' && o.status !== 'FINISHED') {
              <app-tag-badge [value]="(isReturnLeg(o) ? 'orders.returnLegTag' : 'orders.executionMode.EXTERNAL') | translate" severity="primary"></app-tag-badge>
            }
            @if (hasSibling(o)) {
              <button type="button" class="flex items-center gap-1 text-xs text-app-accent-hover hover:underline"
                      (click)="jumpToSibling(o)">
                <i class="pi pi-sitemap text-[10px]"></i>{{ 'orders.splitSibling' | translate }}
              </button>
            }
          </div>
        }
      </ng-template>

      @if (managing(); as o) {
        <div class="pb-4">
          @if (o.status === 'AWAITING_RETURN' && o.returnReady) {
            <div class="flex items-center gap-1.5 mt-3 mb-1 px-3 py-2 rounded-md text-xs font-medium"
                 [style.background-color]="'var(--status-green-bg)'"
                 [style.color]="'var(--status-green-fg)'">
              <i class="pi pi-check-circle"></i>{{ 'orders.returnReady' | translate }}
            </div>
          }
          <p-tabs [value]="manageActiveTab()" (valueChange)="manageActiveTab.set($any($event))">
            <p-tablist class="sticky top-0 bg-app-surface z-10">
              <p-tab value="summary">{{ 'orders.tabSummary' | translate }}</p-tab>
              <p-tab value="schedule">{{ 'orders.tabScheduleProvider' | translate }}</p-tab>
              <p-tab value="items">{{ 'orders.tabItems' | translate }}</p-tab>
              <p-tab value="execution">{{ 'orders.tabExecution' | translate }}</p-tab>
              @if (canSeeMargin()) {
                <p-tab value="margin">{{ 'orders.tabMargin' | translate }}</p-tab>
              }
              <p-tab value="history">{{ 'orders.tabHistory' | translate }}</p-tab>
            </p-tablist>
            <p-tabpanels>
              <p-tabpanel value="summary">
                <app-order-summary-tab [order]="o" [technicians]="technicians()" [tenantTimezone]="tenantTimezone()"
                                       [canViewQuotation]="isDispatcher()" (viewQuotation)="openQuotation(o.id, $event)"
                                       [canWrite]="isDispatcher()" (orderUpdated)="refreshManaging($event)">
                </app-order-summary-tab>
              </p-tabpanel>
              <p-tabpanel value="schedule">
                <app-order-schedule-provider-tab [order]="o" [canWrite]="isDispatcher()" [technicians]="technicians()"
                                                  [tenantTimezone]="tenantTimezone()" (orderUpdated)="refreshManaging($event)">
                </app-order-schedule-provider-tab>
              </p-tabpanel>
              <p-tabpanel value="items">
                <app-order-items-tab [order]="o" [canWrite]="isDispatcher()" (orderUpdated)="refreshManaging($event)"></app-order-items-tab>
              </p-tabpanel>
              <p-tabpanel value="execution">
                <app-order-execution-tab [order]="o" [tenantTimezone]="tenantTimezone()" [canCompare]="canCompareEvidences()"
                                         (orderUpdated)="refreshManaging($event)"></app-order-execution-tab>
              </p-tabpanel>
              @if (canSeeMargin()) {
                <p-tabpanel value="margin">
                  <app-order-margin-tab [order]="o" [tenantTimezone]="tenantTimezone()" (orderUpdated)="refreshManaging($event)"></app-order-margin-tab>
                </p-tabpanel>
              }
              <p-tabpanel value="history">
                <app-order-history-tab [order]="o" [tenantTimezone]="tenantTimezone()" [technicians]="technicians()"></app-order-history-tab>
              </p-tabpanel>
            </p-tabpanels>
          </p-tabs>
        </div>
      }

      <ng-template #footer>
        @if (managing(); as o) {
          <div class="flex flex-wrap justify-end gap-2">
            @if (o.status === 'ASSIGNED') {
              <p-button [label]="'orders.actions.checkIn' | translate" severity="info" (onClick)="action('checkIn')" />
            }
            @if (o.status === 'CHECKED_IN') {
              <p-button [label]="'orders.actions.start' | translate" severity="success" (onClick)="action('start')" />
            }
            @if (o.status === 'IN_PROGRESS') {
              @if (o.executionMode === 'EXTERNAL' && !isReturnLeg(o)) {
                <span class="text-xs text-app-text-tertiary flex items-center gap-1.5">
                  <i class="pi pi-truck"></i>{{ 'orders.actions.awaitingPickupStop' | translate }}
                </span>
              } @else {
                <p-button [label]="'orders.actions.markPartial' | translate" severity="info" (onClick)="action('markPartiallyDone')" />
              }
            }
            @if (o.status === 'PARTIALLY_DONE') {
              <p-button [label]="'orders.actions.resume' | translate" [outlined]="true" (onClick)="action('resume')" />
              <p-button [label]="'orders.actions.complete' | translate" severity="success" (onClick)="action('complete')" />
            }
            @if (o.status === 'COMPLETED') {
              <p-button [label]="'orders.actions.sign' | translate" severity="help" (onClick)="openNote('sign')" />
            }
            @if (o.status === 'SIGNED') {
              <p-button [label]="'orders.actions.finish' | translate" severity="secondary" (onClick)="action('finish')" />
            }
            @if (o.status === 'ON_HOLD' && o.technicianId && isDispatcher()) {
              <p-button [label]="'orders.actions.resume' | translate" severity="success" (onClick)="action('resumeHold')" />
            }
            @if (HOLDABLE.includes(o.status)) {
              <p-button [label]="'orders.actions.hold' | translate" [outlined]="true" severity="warn" (onClick)="openNote('hold')" />
            }
            @if (CANCELLABLE.includes(o.status)) {
              <p-button [label]="'orders.actions.cancel' | translate" severity="danger" [outlined]="true" (onClick)="openNote('cancel')" />
            }
          </div>
        }
      </ng-template>
    </p-drawer>

    <!-- Criação manual de OS avulsa (issue #200) — só despacho. Reactive Forms; cliente e serviços
         reais, sem mock: o preço vem do catálogo no backend, a ordem nasce CREATED para o despacho
         agendar via Drawer, como qualquer outra. -->
    <p-dialog [(visible)]="createVisible" [modal]="true" [style]="{ width: '42rem', maxWidth: '95vw' }"
              [header]="'orders.creationTitle' | translate">
      <form [formGroup]="createForm" class="space-y-5">
        <p class="text-xs text-app-text-secondary leading-relaxed">{{ 'orders.creation.intro' | translate }}</p>

        <div>
          <label class="block text-xs font-semibold text-app-text mb-1.5">
            1. {{ 'orders.creation.customer' | translate }} *
          </label>
          <p-select [options]="formCustomers()" formControlName="customerId" optionLabel="name" optionValue="id"
                    [filter]="true" filterBy="name,taxId" appendTo="body" fluid (onFilter)="onCustomerFilter($event)"
                    [placeholder]="'orders.creation.customerPlaceholder' | translate" [showClear]="true">
            <ng-template #item let-c>
              <div class="flex flex-col py-0.5">
                <span class="text-sm text-app-text">{{ c.name }}</span>
                @if (c.taxId) { <span class="text-xs text-app-text-tertiary">{{ c.taxId }}</span> }
              </div>
            </ng-template>
            <ng-template #emptyfilter>
              <ng-container *ngTemplateOutlet="noCustomerFound" />
            </ng-template>
            <ng-template #empty>
              <ng-container *ngTemplateOutlet="noCustomerFound" />
            </ng-template>
          </p-select>
          <ng-template #noCustomerFound>
            <div class="p-3 text-center space-y-2">
              <p class="text-sm text-app-text-tertiary">
                {{ (customerFilterTerm() ? 'quotations.noCustomerResultsTitle' : 'quotations.noCustomersYetTitle') | translate }}
              </p>
              <p class="text-xs text-app-text-tertiary">{{ 'quotations.noCustomerResultsHint' | translate }}</p>
              @if (canCreateCustomer()) {
                <p-button [label]="'quotations.createCustomerCta' | translate" icon="pi pi-plus" size="small" type="button"
                          (onClick)="openQuickCreateCustomer()" />
              } @else {
                <p class="text-xs text-app-text-tertiary">{{ 'quotations.createCustomerNoAccess' | translate }}</p>
              }
            </div>
          </ng-template>
          @if (formCustomers().length === 0) {
            <p class="text-[11px] text-app-text-tertiary mt-1">{{ 'orders.creation.noCustomers' | translate }}</p>
          }
        </div>

        <div class="space-y-2">
          <label class="block text-xs font-semibold text-app-text">
            2. {{ 'orders.creation.services' | translate }} *
          </label>
          <p class="text-[11px] text-app-text-tertiary">{{ 'orders.creation.servicesHint' | translate }}</p>
          <div formArrayName="items" class="space-y-2">
            @for (row of createForm.controls.items.controls; track row; let i = $index) {
              <div class="flex items-center gap-2" [formGroupName]="$any(i)">
                <div class="flex-1 min-w-0">
                  <p-select [options]="activeServices()" formControlName="serviceId" optionLabel="name" optionValue="id"
                            [filter]="true" filterBy="name" appendTo="body" fluid
                            [placeholder]="'orders.creation.servicePlaceholder' | translate" [showClear]="true"
                            (onChange)="onCreateRowServiceChange(row)" (onClear)="onCreateRowServiceChange(row)">
                    <ng-template #item let-s>
                      <div class="flex items-center justify-between gap-3 py-0.5">
                        <span class="text-sm text-app-text truncate">{{ s.name }}</span>
                        @if (s.price != null) {
                          <span class="text-xs text-app-text-tertiary shrink-0">{{ s.price }} {{ s.currency }}</span>
                        }
                      </div>
                    </ng-template>
                  </p-select>
                </div>
                @if (createRowQuantityConfig(row); as cfg) {
                  @if (cfg.fixed) {
                    <span class="w-28 shrink-0 inline-flex items-center justify-center px-2 h-[2.5rem] text-xs text-app-text-secondary border border-app-border rounded bg-app-surface">
                      {{ 'quotations.fixedQuantityHint' | translate }}
                    </span>
                  } @else {
                    <div class="w-28 shrink-0">
                      <p-inputnumber formControlName="quantity" mode="decimal" [min]="cfg.min" [step]="cfg.step"
                                     [minFractionDigits]="cfg.decimals" [maxFractionDigits]="cfg.decimals"
                                     [suffix]="createRowUnitLabel(row) ? ' ' + createRowUnitLabel(row) : ''"
                                     [placeholder]="'orders.creation.quantityPlaceholder' | translate"
                                     fluid></p-inputnumber>
                    </div>
                  }
                } @else {
                  <div class="w-28 shrink-0">
                    <p-inputnumber formControlName="quantity" mode="decimal" [min]="0.0001" [minFractionDigits]="0"
                                   [maxFractionDigits]="4" [placeholder]="'orders.creation.quantityPlaceholder' | translate"
                                   fluid></p-inputnumber>
                  </div>
                }
                <span class="w-24 shrink-0 text-right text-xs text-app-text-secondary">
                  @if (createLineTotal(row); as lt) { {{ lt.amount | currency:lt.currency:'symbol':'1.2-2' }} }
                </span>
                @if (createForm.controls.items.length > 1) {
                  <p-button icon="pi pi-trash" [text]="true" severity="danger" size="small" type="button"
                            [attr.aria-label]="'orders.creation.removeItem' | translate"
                            (onClick)="removeCreateItem(i)" />
                }
              </div>
            }
          </div>
          <p-button [label]="'orders.creation.addItem' | translate" icon="pi pi-plus" [text]="true" size="small"
                    type="button" (onClick)="addCreateItem()" />
        </div>

        <div class="space-y-2 pt-3 border-t border-app-border text-xs">
          <label class="block text-xs font-semibold text-app-text">
            3. {{ 'quotations.paymentConditionLabel' | translate }}
            <span class="font-normal text-app-text-tertiary">({{ 'orders.creation.optional' | translate }})</span>
          </label>
          <p class="text-[11px] text-app-text-tertiary">{{ 'orders.creation.paymentHint' | translate }}</p>
          <p-select [options]="createPaymentConditionOptions()" formControlName="paymentCondition" optionLabel="label" optionValue="value"
                    (onChange)="onCreatePaymentConditionChange()" (onClear)="onCreatePaymentConditionChange()"
                    appendTo="body" fluid [placeholder]="'quotations.paymentConditionPlaceholder' | translate" [showClear]="true"></p-select>

          @if (createForm.controls.paymentCondition.value) {
            <div>
              <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">
                {{ 'quotations.paymentMethodLabel' | translate }}
              </label>
              <p-select [options]="createPaymentMethodOptions()"
                        formControlName="paymentMethod" optionLabel="label" optionValue="value"
                        (onChange)="createForm.controls.installments.reset(null)"
                        appendTo="body" fluid [placeholder]="'quotations.paymentMethodPlaceholder' | translate" [showClear]="true"></p-select>
              @if (!createPaymentMethodOptions().length) {
                <p class="text-[11px] text-app-danger mt-1">{{ 'quotations.paymentMethodEmptyForCondition' | translate }}</p>
              }
            </div>

            @if (createForm.controls.paymentMethod.value === 'CREDIT_CARD' && createForm.controls.paymentCondition.value === 'DEFERRED') {
              <div>
                <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">
                  {{ 'quotations.installmentsLabel' | translate }}
                </label>
                <p-select [options]="createInstallmentOptions()" formControlName="installments"
                          optionLabel="label" optionValue="value"
                          appendTo="body" fluid [placeholder]="'quotations.installmentsPlaceholder' | translate" [showClear]="true"></p-select>
                @if (!createInstallmentOptions().length) {
                  <p class="text-[11px] text-app-danger mt-1">{{ 'quotations.installmentsNotConfigured' | translate }}</p>
                }
              </div>
            }
          }
        </div>

        @if (createEstimate(); as est) {
          <div class="rounded-lg bg-app-surface border border-app-border px-3 py-2.5 text-xs space-y-1">
            @if (est.interest > 0) {
              <div class="flex justify-between text-app-text-secondary">
                <span>{{ 'orders.creation.interest' | translate }}</span>
                <span>{{ est.interest | currency:est.currency:'symbol':'1.2-2' }}</span>
              </div>
            }
            <div class="flex justify-between text-sm font-semibold text-app-text">
              <span>{{ 'orders.creation.estimatedTotal' | translate }}</span>
              <span>{{ est.total | currency:est.currency:'symbol':'1.2-2' }}</span>
            </div>
            <p class="text-[11px] text-app-text-tertiary">{{ 'orders.creation.estimateNote' | translate }}</p>
          </div>
        }

        <div class="flex items-center justify-end gap-3 pt-1">
          @if (createForm.invalid) {
            <span class="text-[11px] text-app-text-tertiary mr-auto">{{ 'orders.creation.missing' | translate }}</span>
          }
          <p-button [label]="'orders.close' | translate" [text]="true" type="button" (onClick)="closeCreateDialog()" />
          <p-button [label]="'orders.creation.submit' | translate" [disabled]="createForm.invalid" (onClick)="createOrder()" />
        </div>
      </form>
    </p-dialog>

    <app-customer-quick-create [visible]="quickCreateVisible()" (visibleChange)="onQuickCreateVisibilityChange($event)"
                               [prefill]="quickCreatePrefill()"
                               (customerCreated)="onCustomerCreated($event)"></app-customer-quick-create>

    <!-- Confirmação crítica com motivo — não é dialog de gestão, só a nota obrigatória. -->
    <p-dialog [(visible)]="noteDialogOpen"
              [header]="(noteMode === 'cancel' ? 'orders.cancelTitle' : noteMode === 'hold' ? 'orders.holdTitle' : 'orders.signTitle') | translate"
              [modal]="true" [style]="{ width: '420px' }">
      <div class="space-y-3" [formGroup]="noteForm">
        <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">
          {{ (noteMode === 'cancel' ? 'orders.cancelReason' : noteMode === 'hold' ? 'orders.holdNoteLabel' : 'orders.signReason') | translate }}
        </label>
        <textarea pTextarea formControlName="text" rows="3" class="w-full"
                  [placeholder]="(noteMode === 'cancel' ? 'orders.cancelReasonPlaceholder' : noteMode === 'hold' ? 'orders.holdNoteLabel' : 'orders.signReasonPlaceholder') | translate"></textarea>
        <div class="flex justify-end gap-2 pt-2">
          <p-button [label]="'orders.close' | translate" [text]="true" (onClick)="noteDialogOpen = false" />
          <p-button [label]="'orders.confirm' | translate" severity="danger"
                    [disabled]="noteMode !== 'hold' && !noteForm.controls.text.value.trim()" (onClick)="confirmNote()" />
        </div>
      </div>
    </p-dialog>
  `,
})
export class OrdersComponent implements OnInit {
  private orderService = inject(OrderService);
  private tenantUserService = inject(TenantUserService);
  private customerService = inject(CustomerService);
  private serviceService = inject(ServiceService);
  private tenantService = inject(TenantService);
  private authService = inject(AuthService);
  private messageService = inject(MessageService);
  private paymentMethodService = inject(PaymentMethodService);
  private translate = inject(TranslateService);
  private destroyRef = inject(DestroyRef);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly BOARD_PHASES = BOARD_PHASES;
  readonly SECONDARY_PHASE = SECONDARY_PHASE;
  readonly CANCELLABLE = CANCELLABLE_STATUSES;
  readonly scheduleDurationMinutes = scheduleDurationMinutes;
  readonly HOLDABLE = HOLDABLE_STATUSES;
  readonly pageSize = 20;
  /** Teto de registos carregados nas vistas Board/Agenda (sem paginação real) — acima dele um
   *  aviso visível mostra que a listagem foi truncada (issue #205). */
  readonly BATCH_LIMIT = 200;
  readonly SKELETON_COLUMNS = [0, 1, 2, 3];
  readonly SKELETON_ROWS = [0, 1, 2, 3];

  /** Divs de scroll das colunas do board — mesmo `#columnScroll` reaproveitado pelo
   *  `ngTemplateOutlet` em cada fase (primárias + secundária), por isso vem em lista. */
  private columnScrollRefs = viewChildren<ElementRef<HTMLDivElement>>('columnScroll');
  /** Fade no fim de cada coluna, por chave de fase — só true quando há mais cartões abaixo do
   *  scroll visível; some perto do fundo real para não cobrir o último cartão (mesmo desenho de
   *  {@link RoutingComponent}). */
  columnFade = signal<Record<string, boolean>>({});

  orders = signal<Order[]>([]);
  /** Ordens apontadas pelo dashboard (`?highlight=id,id`) — a borda some sozinha após {@link HIGHLIGHT_MS}. */
  private highlightIds = signal<ReadonlySet<string>>(new Set());
  private static readonly HIGHLIGHT_MS = 8000;
  totalElements = signal(0);
  loading = signal(false);
  /** Só relevante na vista de lista: onboarding, distinto de "sem resultados para o filtro". */
  ordersEmpty = computed(() => !this.loading() && this.totalElements() === 0 && !this.hasActiveFilters());
  /** Board/Agenda carregam tudo num teto fixo (BATCH_LIMIT) — quando o tenant tem mais do que o
   *  teto, a vista fica truncada e precisa de aviso visível (issue #205). */
  fetchTruncated = computed(() => this.view() !== 'list' && this.totalElements() > this.BATCH_LIMIT);
  view = signal<ViewMode>('board');
  showSecondary = signal(false);
  tenantTimezone = signal<string | null>(null);

  manageVisible = signal(false);
  managing = signal<Order | null>(null);
  manageActiveTab = signal('summary');

  /** Resultado financeiro da OS — mesmos perfis que o backend autoriza em GET /orders/{id}/margin. */
  canSeeMargin = computed(() => ['OWNER', 'ADMIN', 'OPERATOR', 'FINANCE'].includes(this.authService.userRole() ?? ''));
  /** Mesmos perfis que o backend aceita em OrderEvidenceController (leitura e escrita de evidências). */
  canCompareEvidences = computed(() =>
    ['OWNER', 'ADMIN', 'OPERATOR', 'TECHNICIAN'].includes(this.authService.userRole() ?? ''));
  isDispatcher = computed(() => !['TECHNICIAN', 'LAUNDRY'].includes(this.authService.userRole() ?? ''));

  statusFilter: OrderStatus | null = null;
  technicianFilter: string | null = null;
  customerFilter: string | null = null;
  periodRange: Date[] | null = null;
  private page = 0;
  /** Ordenação escolhida na vista de lista (colunas `pSortableColumn`) — servida ao backend como
   *  `sort=<campo>,asc|desc`; `null` usa o default de servidor (`createdAt DESC`). */
  listSort: { field: string; order: 1 | -1 } | null = null;
  private filterChange$ = new Subject<void>();

  private laundryFeature = inject(LaundryFeatureService);
  /** "Aguardando devolução" só existe no fluxo de lavanderia — sem ele o filtro não a oferece. */
  statusOptions = computed(() => ALL_STATUSES
    .filter(s => s !== 'AWAITING_RETURN' || this.laundryFeature.active())
    .map(s => ({ value: s, label: this.translate.instant('orders.status.' + s) })));
  technicians = signal<TenantDirectoryEntry[]>([]);
  technicianOptions = computed(() =>
    this.technicians().filter(u => u.role === 'TECHNICIAN')
      .map(u => ({ value: u.id, label: u.name })));

  private customers = signal<Customer[]>([]);
  private customerNames = computed(() => new Map(this.customers().map(c => [c.id, c.name])));

  scheduleDays = computed(() => {
    const groups = new Map<string, { key: string; date: string; orders: Order[] }>();
    for (const o of this.orders()) {
      if (!o.scheduledStartAt || o.status === 'CANCELLED') continue;
      const key = o.scheduledStartAt.slice(0, 10);
      if (!groups.has(key)) groups.set(key, { key, date: o.scheduledStartAt, orders: [] });
      groups.get(key)!.orders.push(o);
    }
    return [...groups.values()]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map(g => ({ ...g, orders: g.orders.sort((a, b) => (a.scheduledStartAt ?? '').localeCompare(b.scheduledStartAt ?? '')) }));
  });

  // --- cancel/hold/sign: única confirmação que continua Dialog, com motivo obrigatório ---
  noteDialogOpen = false;
  noteMode: 'cancel' | 'hold' | 'sign' = 'cancel';
  readonly noteForm = new FormGroup({
    text: new FormControl('', { nonNullable: true }),
  });

  // --- OS avulsa (issue #200): criação manual, só despacho ---
  createVisible = false;
  readonly createForm = new FormGroup({
    customerId: new FormControl<string | null>(null, Validators.required),
    items: new FormArray([this.createItemRow()]),
    paymentCondition: new FormControl<string | null>(null),
    paymentMethod: new FormControl<string | null>(null),
    installments: new FormControl<number | null>(null),
  });
  formCustomers = signal<Customer[]>([]);
  customerFilterTerm = signal('');
  quickCreateVisible = signal(false);
  quickCreatePrefill = signal<{ name?: string; taxId?: string } | null>(null);
  private createDialogWasOpenBeforeQuickCreate = false;
  readonly canCreateCustomer = computed(() => CUSTOMER_WRITE_ROLES.includes(this.authService.userRole() ?? ''));
  activeServices = signal<{ id: string; name: string; price: number | null; currency: string | null; priceType: PriceType }[]>([]);
  paymentConditions = signal<{ condition: string; method: string; enabled: boolean }[]>([]);
  paymentMethods = signal<{ condition: string; method: string; enabled: boolean }[]>([]);
  installmentPlan = signal<{ minInstallments: number; maxInstallments: number; interestPercentage: number }[]>([]);

  constructor() {
    effect(() => {
      this.orders();
      this.showSecondary();
      this.view();
      queueMicrotask(() => this.updateAllColumnFades());
    });
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.updateAllColumnFades();
  }

  onColumnScroll(target: EventTarget | null, phaseKey: string): void {
    this.updateColumnFade(target as HTMLDivElement, phaseKey);
  }

  private updateAllColumnFades(): void {
    for (const ref of this.columnScrollRefs()) {
      const el = ref.nativeElement;
      const phaseKey = el.dataset['phase'];
      if (phaseKey) this.updateColumnFade(el, phaseKey);
    }
  }

  private updateColumnFade(el: HTMLDivElement | null, phaseKey: string): void {
    if (!el) return;
    const hasOverflow = el.scrollHeight > el.clientHeight + 1;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
    this.columnFade.update(state => ({ ...state, [phaseKey]: hasOverflow && !atBottom }));
  }

  ngOnInit(): void {
    this.tenantService.getMe().subscribe({
      next: t => { if (t.timezone) this.tenantTimezone.set(t.timezone); },
      error: () => {},
    });
    if (this.isDispatcher()) {
      this.tenantUserService.directory().subscribe({ next: u => this.technicians.set(u), error: () => {} });
      // Corre em paralelo com load() — se este responder primeiro, resolveMissingCustomers já
      // terá buscado e anexado o cliente que faltava. .set() aqui apagaria esse anexo; merge por
      // id preserva ambos (mesmo raciocínio de QuotationsComponent#ngOnInit).
      this.customerService.list({ size: 100 }).subscribe({
        next: c => this.customers.update(current => {
          const merged = new Map(current.map(x => [x.id, x]));
          c.content.forEach(x => merged.set(x.id, x));
          return [...merged.values()];
        }),
        error: () => {},
      });
    } else {
      // Técnico/lavandaria não gerem a lista de técnicos, mas ainda precisam do próprio nome
      // resolvido no cabeçalho do Drawer e nos cartões — a própria conta chega pelo authService.
      this.tenantUserService.directory().subscribe({ next: u => this.technicians.set(u), error: () => {} });
    }
    // A central de operação abre a lista já filtrada (ex.: ?status=ON_HOLD), para o número clicado
    // e os registos vistos serem os mesmos.
    const requestedStatus = this.route.snapshot.queryParamMap.get('status') as OrderStatus | null;
    if (requestedStatus && ALL_STATUSES.includes(requestedStatus)) {
      this.statusFilter = requestedStatus;
    }
    this.wireFilters();
    this.readHighlightParam();
    this.load();
    this.openFromQueryParam();
  }

  private highlightRevealed = false;

  private readHighlightParam(): void {
    const raw = this.route.snapshot.queryParamMap.get('highlight');
    if (!raw) return;
    this.highlightIds.set(new Set(raw.split(',').filter(Boolean)));
    this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
    setTimeout(() => this.highlightIds.set(new Set()), OrdersComponent.HIGHLIGHT_MS);
  }

  isHighlighted(o: Order): boolean {
    return this.highlightIds().has(o.id);
  }

  /** Primeira carga com destaque: ordem apontada que ficou fora do recorte (página/filtro) é buscada
   *  por id e entra na lista, para o dono ver todas; depois rola até a primeira. Corre uma só vez. */
  private revealHighlighted(): void {
    const wanted = this.highlightIds();
    if (!wanted.size || this.highlightRevealed) return;
    this.highlightRevealed = true;
    const present = new Set(this.orders().map(o => o.id));
    const missing = [...wanted].filter(id => !present.has(id));
    const scroll = () => setTimeout(() =>
      document.querySelector('[data-order-id].order-highlight')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    if (!missing.length) {
      scroll();
      return;
    }
    forkJoin(missing.map(id => this.orderService.get(id).pipe(catchError(() => of(null))))).subscribe(fetched => {
      const found = fetched.filter((o): o is Order => o !== null);
      this.orders.update(list => [...found, ...list]);
      this.resolveMissingCustomers(found);
      scroll();
    });
  }

  /** Chegada por link direto (`?open=<orderId>`) — abre o Drawer sem depender da paginação da
   *  vista atual, mesmo padrão de providers.component.ts. `?tab=` opcional escolhe a aba (usado
   *  pela Lavanderia pra cair direto em "Agendamento" — ver laundry-pending-delivery.component). */
  private openFromQueryParam(): void {
    const id = this.route.snapshot.queryParamMap.get('open');
    if (!id) return;
    const tab = this.route.snapshot.queryParamMap.get('tab');
    this.orderService.get(id).subscribe({
      next: order => {
        this.openManage(order);
        if (tab) this.manageActiveTab.set(tab);
        this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
      },
      error: () => {},
    });
  }

  /** Estado/técnico/cliente/período disparam aqui; debounce+distinctUntilChanged evitam requests
   *  supérfluos, switchMap cancela a busca anterior quando uma nova é iniciada. */
  private wireFilters(): void {
    const sub = this.filterChange$.pipe(
      debounceTime(300),
      map(() => this.filterKey()),
      distinctUntilChanged(),
      tap(() => { this.page = 0; this.loading.set(true); }),
      switchMap(() => this.fetchOrders$().pipe(
        catchError(() => {
          this.messageService.add({ severity: 'error', summary: this.translate.instant('orders.loadError') });
          return of(null);
        }),
      )),
    ).subscribe(result => {
      this.loading.set(false);
      if (result) {
        this.orders.set(result.content);
        this.totalElements.set(result.page.totalElements);
      }
    });
    this.destroyRef.onDestroy(() => sub.unsubscribe());
  }

  private filterKey(): string {
    const p = this.queryParams();
    return [p.status ?? '', p.technicianId ?? '', p.customerName ?? '', p.start ?? '', p.end ?? ''].join('|');
  }

  setView(v: ViewMode): void {
    if (this.view() === v) return;
    this.view.set(v);
    if (v !== 'list') this.loadAll();
  }

  /** Disparado a cada seleção/período — alimenta o pipeline reativo em {@link wireFilters}. */
  applyFilters(): void {
    this.filterChange$.next();
  }

  hasActiveFilters(): boolean {
    return this.statusFilter !== null || this.technicianFilter !== null || this.customerFilter !== null || !!this.periodRange;
  }

  clearFilters(): void {
    this.statusFilter = null;
    this.technicianFilter = null;
    this.customerFilter = null;
    this.periodRange = null;
    this.applyFilters();
  }

  onLazyLoad(event: TableLazyLoadEvent): void {
    this.page = Math.floor((event.first ?? 0) / this.pageSize);
    const field = Array.isArray(event.sortField) ? event.sortField[0] : event.sortField;
    this.listSort = field ? { field, order: event.sortOrder === 1 ? 1 : -1 } : null;
    this.load();
  }

  private queryParams() {
    return {
      status: this.statusFilter ?? undefined,
      technicianId: this.technicianFilter ?? undefined,
      customerName: this.customerFilter ?? undefined,
      start: this.periodRange?.[0] ? toIsoDate(this.periodRange[0]) : undefined,
      end: this.periodRange?.[1] ? toIsoDate(this.periodRange[1]) : (this.periodRange?.[0] ? toIsoDate(this.periodRange[0]) : undefined),
    };
  }

  private fetchOrders$(): Observable<OrderPage> {
    // A vista de quadro/agenda mostra tudo o que caiba num teto operacional razoável; a
    // paginação real (página/tamanho geridos pelo servidor) só se aplica à vista de lista.
    const usingList = this.view() === 'list';
    return this.orderService.list({
      ...this.queryParams(),
      page: usingList ? this.page : 0,
      size: usingList ? this.pageSize : this.BATCH_LIMIT,
      sort: usingList && this.listSort ? `${this.listSort.field},${this.listSort.order === 1 ? 'asc' : 'desc'}` : undefined,
    });
  }

  load(): void {
    this.loading.set(true);
    this.fetchOrders$().subscribe({
      next: res => {
        this.orders.set(res.content);
        this.totalElements.set(res.page.totalElements);
        this.loading.set(false);
        this.resolveMissingCustomers(res.content);
        this.revealHighlighted();
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('orders.loadError') });
      },
    });
  }

  /** Pré-carga em ngOnInit traz só os 100 primeiros clientes ativos por nome — ordem cujo
   *  cliente ficou fora desse recorte (mais clientes cadastrados depois, ou inativo) mostrava
   *  "#xxxxxxxx" em vez do nome no cartão/tabela/cabeçalho do Drawer. Busca sob demanda os que
   *  faltam, mesmo padrão de {@link QuotationsComponent#resolveMissingCustomers}. */
  private resolveMissingCustomers(orders: Order[]): void {
    // Técnico e lavandaria não leem clientes (CustomerController.READ_ROLES): pedir só devolve 403.
    if (!this.isDispatcher()) return;
    const known = this.customerNames();
    const missingIds = [...new Set(orders.map(o => o.customerId).filter(id => !known.has(id)))];
    if (!missingIds.length) return;
    forkJoin(missingIds.map(id => this.customerService.get(id))).subscribe(fetched => {
      this.customers.update(list => [...list, ...fetched]);
    });
  }

  private loadAll(): void {
    this.load();
  }

  ordersByPhase(phase: BoardPhase): Order[] {
    return this.orders().filter(o => phase.statuses.includes(o.status));
  }

  /** Melhor esforço a partir do que já está carregado em memória (split de ordem por orçamento):
   *  acusa "tem ordem irmã" quando outra ordem visível partilha o mesmo orçamento — não é uma
   *  verdade absoluta fora da janela atualmente carregada (ex.: outra página da vista de lista),
   *  só um sinal visual; {@link jumpToSibling} confirma com o servidor ao ser clicado. */
  hasSibling(o: Order): boolean {
    if (!o.quotationId) return false;
    return this.orders().some(other => other.id !== o.id && other.quotationId === o.quotationId);
  }

  /** Mesma regra de {@code Order#isReturnLeg} no backend (issue coleta/devolução): uma ordem
   *  EXTERNAL já passou (ou está) por AWAITING_RETURN quando a paragem que a espera é a visita de
   *  devolução, não a coleta — mesmo continuando EXTERNAL do início ao fim, a etiqueta tem de
   *  acompanhar a fase real. */
  isReturnLeg(o: Order): boolean {
    return o.status === 'AWAITING_RETURN' || o.transitions.some(t => t.toStatus === 'AWAITING_RETURN');
  }

  /** Busca as ordens do mesmo orçamento no servidor (não confia só na janela em memória) e abre a
   *  outra. Um orçamento gera no máximo uma ordem por modo de execução (mais uma segunda visita
   *  quando o grupo foi dividido por split de atendimento) — coleta e devolução vivem na mesma
   *  ordem (issue coleta/devolução), nunca uma ordem separada. */
  jumpToSibling(o: Order): void {
    if (!o.quotationId) return;
    this.orderService.siblingsByQuotation(o.quotationId).subscribe({
      next: page => {
        const sibling = page.content.find(s => s.id !== o.id);
        if (sibling) this.openManage(sibling);
      },
      error: () => {},
    });
  }

  total(o: Order): number {
    return o.items.reduce((acc, i) => acc + i.lineTotal, 0);
  }

  customerName(customerId: string): string {
    return this.customerNames().get(customerId) ?? '#' + customerId.slice(0, 8);
  }

  technicianName(userId: string | null): string {
    if (!userId) return '—';
    return this.technicians().find(u => u.id === userId)?.name ?? '#' + userId.slice(0, 8);
  }

  getTechnicianDisplay(order: Order): string {
    if (!order.technicianIds || order.technicianIds.length === 0) return '—';
    if (order.technicianIds.length === 1) {
      return this.technicianName(order.technicianIds[0]);
    }
    return order.technicianIds.map(id => {
      const tech = this.technicians().find(u => u.id === id);
      const name = tech?.name ?? ('#' + id.slice(0, 8));
      return name.split(' ').map(n => n[0]).join('').toUpperCase();
    }).join(', ');
  }

  getTechnicianDisplayFull(order: Order): string {
    if (!order.technicianIds || order.technicianIds.length === 0) return '—';
    return order.technicianIds.map(id => this.technicianName(id)).join(', ');
  }

  openManage(o: Order): void {
    this.managing.set(o);
    this.manageActiveTab.set('summary');
    this.manageVisible.set(true);
  }

  /** Sai para /quotations/:id, mas primeiro marca a ordem aberta em `?open=` (replaceUrl, sem
   *  entrada extra no histórico) — o "voltar" do navegador cai em `/orders?open=<id>`, que
   *  {@link openFromQueryParam} reconhece e reabre o Drawer nesta mesma ordem. */
  openQuotation(orderId: string, quotationId: string): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { open: orderId }, replaceUrl: true })
      .then(() => this.router.navigate(['/quotations', quotationId]));
  }

  /** Devolvido por qualquer aba depois de uma mutação — atualiza o Drawer e a linha/cartão
   *  correspondente na listagem em memória, sem recarregar tudo do servidor. */
  refreshManaging(updated: Order): void {
    this.managing.set(updated);
    this.orders.update(list => list.map(o => (o.id === updated.id ? updated : o)));
  }

  openNote(mode: 'cancel' | 'hold' | 'sign'): void {
    this.noteMode = mode;
    this.noteForm.reset({ text: '' });
    this.noteDialogOpen = true;
  }

  /** Abre o dialog de OS avulsa com catálogo e clientes reais carregados na hora — a lista de
   *  clientes em {@link customers} serve para resolver nomes do quadro e pode estar restrita por
   *  recorte de listagem; o formulário usa a sua própria busca, fresca e completa. */
  openCreateDialog(): void {
    this.customerService.list({ active: true, size: 200, sort: 'name,asc' }).subscribe({
      next: c => this.formCustomers.set(c.content),
      error: () => this.formCustomers.set([]),
    });
    this.serviceService.list({ active: true, size: 200, sort: 'name,asc' }).subscribe({
      next: s => this.activeServices.set(s.content.map(x => ({ id: x.id, name: x.name, price: x.price, currency: x.currency, priceType: x.priceType }))),
      error: () => this.activeServices.set([]),
    });
    this.paymentMethodService.listEnabled().subscribe({
      next: settings => {
        this.paymentConditions.set([...new Map(settings.map(s => [s.condition, s])).values()].map(s => ({
          condition: s.condition,
          method: '',
          enabled: s.enabled
        })));
        this.paymentMethods.set(settings);
      },
      error: () => {
        this.paymentConditions.set([]);
        this.paymentMethods.set([]);
      }
    });
    this.paymentMethodService.getCreditCardInstallmentPlan().subscribe({
      next: plan => this.installmentPlan.set(plan.tiers),
      error: () => this.installmentPlan.set([])
    });
    this.createForm.controls.customerId.reset(null);
    this.createForm.controls.paymentCondition.reset(null);
    this.createForm.controls.paymentMethod.reset(null);
    this.createForm.controls.installments.reset(null);
    this.createForm.controls.items.clear();
    this.createForm.controls.items.push(this.createItemRow());
    this.createVisible = true;
  }

  closeCreateDialog(): void {
    this.createVisible = false;
  }

  /** Cliente digitado no filtro do seletor — alimenta o cadastro rápido quando nada é encontrado. */
  onCustomerFilter(event: { filter?: string | null }): void {
    this.customerFilterTerm.set((event.filter ?? '').trim());
  }

  openQuickCreateCustomer(): void {
    const term = this.customerFilterTerm();
    const looksLikeTaxId = (term.match(/\d/g)?.length ?? 0) >= 8;
    this.quickCreatePrefill.set(term ? (looksLikeTaxId ? { taxId: term } : { name: term }) : null);
    this.createDialogWasOpenBeforeQuickCreate = true;
    this.createVisible = false;
    this.quickCreateVisible.set(true);
  }

  /** Drawer fechou (criou ou cancelou) — devolve o diálogo de OS, que continua preenchido. */
  onQuickCreateVisibilityChange(visible: boolean): void {
    this.quickCreateVisible.set(visible);
    if (!visible && this.createDialogWasOpenBeforeQuickCreate) {
      this.createDialogWasOpenBeforeQuickCreate = false;
      this.createVisible = true;
    }
  }

  onCustomerCreated(customer: Customer): void {
    this.formCustomers.update(list => [customer, ...list]);
    this.customers.update(list => [customer, ...list]);
    this.createForm.controls.customerId.setValue(customer.id);
  }

  private createItemRow(): FormGroup {
    return new FormGroup({
      serviceId: new FormControl<string | null>(null, Validators.required),
      quantity: new FormControl<number>(1, { nonNullable: true, validators: [Validators.required, Validators.min(0.0001)] }),
    });
  }

  addCreateItem(): void {
    this.createForm.controls.items.push(this.createItemRow());
  }

  removeCreateItem(index: number): void {
    this.createForm.controls.items.removeAt(index);
  }

  /** Serviço selecionado da linha, para resolver a configuração de quantidade pelo `priceType`
   *  do catálogo — mesma regra do orçamento (CLAUDE.md, issue #39): preço fixo não escala. */
  private createRowService(row: FormGroup) {
    const serviceId = (row.get('serviceId') as FormControl<string | null>).value;
    return this.activeServices().find(s => s.id === serviceId) ?? null;
  }

  createRowQuantityConfig(row: FormGroup) {
    const svc = this.createRowService(row);
    return svc ? priceTypeQuantityConfig(svc.priceType) : null;
  }

  createRowUnitLabel(row: FormGroup): string {
    const svc = this.createRowService(row);
    if (!svc) return '';
    const key = priceTypeUnitLabelKey(svc.priceType);
    return key ? this.translate.instant(key) : '';
  }

  /** Ao trocar o serviço da linha, a quantidade tem de voltar ao mínimo válido do novo
   *  `priceType` — senão um valor digitado para m²/hora sobra ao trocar para um serviço de
   *  preço fixo (ou vice-versa). */
  onCreateRowServiceChange(row: FormGroup): void {
    const cfg = this.createRowQuantityConfig(row);
    (row.get('quantity') as FormControl<number>).setValue(cfg && !cfg.fixed ? cfg.min : 1);
  }

  createPaymentConditionOptions(): { label: string; value: PaymentCondition }[] {
    return (['UPFRONT', 'DEFERRED'] as PaymentCondition[])
      .map(value => ({ value, label: paymentConditionLabel(this.translate, value) }));
  }

  createPaymentMethodOptions(): { label: string; value: PaymentMethod }[] {
    const condition = this.createForm.controls.paymentCondition.value;
    return this.paymentMethods()
      .filter(m => m.condition === condition && m.enabled)
      .map(m => ({ value: m.method as PaymentMethod, label: paymentMethodLabel(this.translate, m.method as PaymentMethod) }));
  }

  createInstallmentOptions() {
    return buildInstallmentOptions({ tiers: this.installmentPlan() as never, gaps: [] }, this.translate);
  }

  /** Trocar a condição invalida forma de pagamento e parcelas escolhidas para a anterior. */
  onCreatePaymentConditionChange(): void {
    this.createForm.controls.paymentMethod.reset(null);
    this.createForm.controls.installments.reset(null);
  }

  /** Subtotal da linha a partir do preço do catálogo — só exibição; o valor final é do backend. */
  createLineTotal(row: FormGroup): { amount: number; currency: string } | null {
    const svc = this.createRowService(row);
    if (!svc || svc.price == null || !svc.currency) return null;
    const qty = (row.get('quantity') as FormControl<number>).value ?? 0;
    const fixed = priceTypeQuantityConfig(svc.priceType).fixed;
    return { amount: svc.price * (fixed ? 1 : qty), currency: svc.currency };
  }

  createEstimate(): { total: number; interest: number; currency: string } | null {
    let subtotal = 0;
    let currency: string | null = null;
    for (const row of this.createForm.controls.items.controls as FormGroup[]) {
      const line = this.createLineTotal(row);
      if (!line) continue;
      subtotal += line.amount;
      currency ??= line.currency;
    }
    if (!currency) return null;
    const n = this.createForm.controls.installments.value;
    const pct = n != null ? this.installmentPlan().find(t => n >= t.minInstallments && n <= t.maxInstallments)?.interestPercentage ?? 0 : 0;
    const interest = subtotal * pct;
    return { total: subtotal + interest, interest, currency };
  }

  createOrder(): void {
    const raw = this.createForm.getRawValue() as {
      customerId: string | null;
      items: { serviceId: string | null; quantity: number }[];
      paymentCondition: string | null;
      paymentMethod: string | null;
      installments: number | null;
    };
    const items = raw.items
      .filter(i => i.serviceId && i.quantity != null && i.quantity > 0)
      .map(i => {
        const svc = this.activeServices().find(s => s.id === i.serviceId);
        const fixed = svc ? priceTypeQuantityConfig(svc.priceType).fixed : false;
        return { serviceId: i.serviceId!, quantity: fixed ? 1 : i.quantity! };
      });
    if (!raw.customerId) return;
    if (!items.length) {
      this.messageService.add({ severity: 'warn', summary: this.translate.instant('orders.creation.emptyItems') });
      return;
    }
    this.orderService.create({
      customerId: raw.customerId,
      items,
      paymentCondition: raw.paymentCondition || undefined,
      paymentMethod: raw.paymentMethod || undefined,
      installments: raw.installments || undefined,
    }).subscribe({
      next: created => {
        this.createVisible = false;
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('orders.creation.created', { number: created.orderNumber }),
        });
        this.load();
      },
      error: err => this.showError(err),
    });
  }

  confirmNote(): void {
    const o = this.managing();
    if (!o) return;
    const text = this.noteForm.getRawValue().text.trim();
    const mode = this.noteMode;
    const call = mode === 'cancel'
      ? this.orderService.cancel(o.id, text)
      : mode === 'hold'
        ? this.orderService.hold(o.id, text || undefined)
        : this.orderService.sign(o.id, text);
    call.subscribe({
      next: updated => {
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant(
            mode === 'cancel' ? 'orders.cancelled' : mode === 'hold' ? 'orders.heldTitle' : 'orders.signedTitle'),
        });
        this.noteDialogOpen = false;
        this.refreshManaging(updated);
      },
      error: err => this.showError(err),
    });
  }

  action(type: 'checkIn' | 'start' | 'markPartiallyDone' | 'resume' | 'resumeHold' | 'complete' | 'finish'): void {
    const o = this.managing();
    if (!o) return;

    let obs;
    if (type === 'checkIn') obs = this.orderService.checkIn(o.id);
    else if (type === 'start') obs = this.orderService.start(o.id);
    else if (type === 'markPartiallyDone') obs = this.orderService.markPartiallyDone(o.id);
    else if (type === 'resume') obs = this.orderService.resume(o.id);
    else if (type === 'resumeHold') obs = this.orderService.assign(o.id, o.technicianId!);
    else if (type === 'complete') obs = this.orderService.complete(o.id);
    else obs = this.orderService.finish(o.id);

    obs.subscribe({
      next: updated => {
        this.messageService.add({ severity: 'success', summary: this.translate.instant('orders.statusUpdated') });
        this.refreshManaging(updated);
      },
      error: err => this.showError(err),
    });
  }

  private showError(err: HttpErrorResponse): void {
    const code = (err.error as { code?: string; errorCode?: string } | null)?.code
      ?? (err.error as { code?: string; errorCode?: string } | null)?.errorCode;
    if (code === 'ORDER_TECHNICIAN_SCHEDULE_CONFLICT') {
      this.messageService.add({
        severity: 'warn',
        summary: this.translate.instant('orders.conflictTitle'),
        detail: this.translate.instant('orders.conflictDetail'),
      });
      return;
    }
    const key = `orders.errors.${code}`;
    const translated = this.translate.instant(key);
    this.messageService.add({
      severity: 'error',
      summary: this.translate.instant('orders.transitionError'),
      detail: translated !== key ? translated : ((err.error as { detail?: string } | null)?.detail || undefined),
    });
  }
}
