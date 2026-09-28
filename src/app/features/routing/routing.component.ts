import { ChangeDetectionStrategy, Component, ElementRef, HostListener, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { SelectButtonModule } from 'primeng/selectbutton';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { RouteService, RouteDto } from '../../core/services/route.service';
import { OrderService, Order, ExecutionMode } from '../../core/services/order.service';
import { ProviderService, PROVIDER_COLOR_HEX } from '../../core/services/provider.service';
import { CustomerService, Customer } from '../../core/services/customer.service';
import { TenantUserService, TenantDirectoryEntry } from '../../core/services/tenant-user.service';
import { TenantService } from '../../core/services/tenant.service';
import { AuthService } from '../../core/auth/auth.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';

import { RoutingDateNavComponent } from './routing-date-nav.component';
import { RoutingSummaryBarComponent } from './routing-summary-bar.component';
import { RoutingTechnicianListComponent } from './routing-technician-list.component';
import { RoutingStopListComponent } from './routing-stop-list.component';
import { RoutingMapComponent } from './routing-map.component';
import { DaySummary, EnrichedStop, TechnicianRow, resolveTechnicianColor, stopExecutionMode } from './routing-models';
import { isSameTenantDay, shiftIsoDate, todayIsoDate } from './routing-date.util';
import { formatLocalizedDate } from '../../shared/i18n/date-locale';

/**
 * Painel operacional de Rotas (redesenho UX): abre em "hoje", mostra quem está na rua sem exigir
 * seleção prévia de técnico+data, e só aprofunda numa rota quando o usuário escolhe um técnico —
 * ou "Todos os técnicos" para a visão consolidada no mapa. Estado de data/técnico/paradas fica no
 * shell; os subcomponentes (`routing-*`) são apresentacionais, comunicam por `input()`/`output()`.
 */
@Component({
  selector: 'app-routing',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, FormsModule, ButtonModule, SelectButtonModule, ConfirmDialogModule, ToastModule, TranslatePipe,
    PageHeaderComponent, RoutingDateNavComponent, RoutingSummaryBarComponent,
    RoutingTechnicianListComponent, RoutingStopListComponent, RoutingMapComponent,
  ],
  providers: [MessageService, ConfirmationService],
  styles: [`
    .routing-fade-bottom {
      mask-image: linear-gradient(to bottom, black calc(100% - 28px), transparent 100%);
      -webkit-mask-image: linear-gradient(to bottom, black calc(100% - 28px), transparent 100%);
    }
  `],
  template: `
    <p-toast />
    <p-confirmDialog [style]="{ width: '26rem' }" />
    <!-- Mapa em tela cheia: ocupa toda a área útil ao lado da sidebar e abaixo da topbar; cabeçalho,
         resumo e lista de técnicos/paradas flutuam por cima dele. -->
    <div class="absolute inset-0 z-0">
      <app-routing-map class="block h-full w-full" [routes]="visibleRoutes()" [stops]="visibleStops()"
          [selectedStopId]="selectedStopId()" [loading]="loading()" [companyLocation]="companyLocation()"
          [colorByTechnicianId]="providerColorByUserId()"
          (stopSelected)="selectStop($event)" />
    </div>

    <div class="absolute inset-0 z-10 pointer-events-none flex flex-col items-start gap-3 p-3 sm:p-4 min-w-0">
      <div class="pointer-events-auto w-full rounded-lg border border-app-border bg-app-bg/70 backdrop-blur px-4 pt-3 pb-1 shadow-md">
        <app-page-header class="block [&>div]:!mb-2" [title]="'routing.title' | translate" [description]="'routing.subtitle' | translate">
          <app-routing-date-nav [date]="selectedDate()" (dateChange)="onDateChange($event)" />
          @if (isDispatcher()) {
            <p-button [label]="'routing.generateDay' | translate" icon="pi pi-calendar-plus" size="small"
                      [loading]="generatingDay()" (onClick)="confirmGenerateDay()" />
          }
        </app-page-header>
      </div>

      @if (error()) {
        <div class="pointer-events-auto border border-app-danger/30 bg-app-bg rounded-md p-4 flex items-center justify-between gap-3 shadow-md">
          <span class="text-sm text-app-danger">{{ 'routing.loadError' | translate }}</span>
          <p-button [label]="'common.retry' | translate" size="small" [text]="true" (onClick)="loadDay()" />
        </div>
      } @else {
        <div class="pointer-events-auto w-full rounded-lg border border-app-border bg-app-bg/70 backdrop-blur px-4 py-2 shadow-md">
          @if (selectedTechnicianId() === 'ALL') {
            <div class="flex items-center justify-between flex-wrap gap-2">
              <app-routing-summary-bar [summary]="daySummary()" />
              <div class="flex items-center gap-2">
                <span class="text-xs text-app-text-tertiary">{{ 'routing.modeFilter.label' | translate }}</span>
                <p-selectbutton [options]="modeFilterOptions" optionLabel="labelKey" optionValue="value" size="small"
                                [allowEmpty]="false" [ngModel]="modeFilter()" (ngModelChange)="modeFilter.set($event)">
                  <ng-template #item let-option>{{ option.labelKey | translate }}</ng-template>
                </p-selectbutton>
              </div>
            </div>
          } @else {
            <div class="flex items-center justify-between gap-2.5">
              @if (canBrowseAll()) {
                <button type="button" class="flex items-center gap-1 text-xs text-app-text-tertiary hover:text-app-text cursor-pointer shrink-0"
                        (click)="selectTechnician('ALL')">
                  <i class="pi pi-arrow-left text-[10px]"></i>
                  {{ 'routing.technicianList.backToAll' | translate }}
                </button>
              }
              <div class="flex items-center gap-2.5 ms-auto">
                <span class="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
                      [style.background]="technicianColor(selectedTechnicianId())">{{ technicianInitials(selectedTechnicianName()) }}</span>
                <h2 class="text-lg font-semibold text-app-text leading-tight">{{ selectedTechnicianName() }}</h2>
              </div>
            </div>
          }
        </div>

        <div class="pointer-events-auto lg:hidden flex gap-2">
          <p-button [label]="'routing.mobile.stops' | translate" size="small"
                    [outlined]="mobileView() !== 'list'" (onClick)="mobileView.set('list')" />
          <p-button [label]="'routing.mobile.map' | translate" size="small"
                    [outlined]="mobileView() !== 'map'" (onClick)="mobileView.set('map')" />
        </div>

        <div class="w-full min-h-0 flex-1 flex items-start">
          <div #listContainer class="pointer-events-auto lg:!block w-full lg:w-80 xl:w-96 max-h-full overflow-y-auto rounded-lg border border-app-border bg-app-bg/70 backdrop-blur p-2 shadow-md"
               [class.hidden]="mobileView() === 'map'" [class.routing-fade-bottom]="showBottomFade()"
               (scroll)="onListScroll()">
            @if (selectedTechnicianId() === 'ALL') {
              <app-routing-technician-list [rows]="technicianRows()" [loading]="loading()"
                  [isDispatcher]="isDispatcher()" [date]="selectedDate()"
                  [planningTechnicianId]="planningTechnicianId()" [colorByTechnicianId]="providerColorByUserId()"
                  (selectTechnician)="selectTechnician($event)" (planTechnician)="planTechnician($event)" />
            } @else {
              <app-routing-stop-list [technicianName]="selectedTechnicianName()" [route]="selectedRoute()"
                  [stops]="visibleStops()" [selectedStopId]="selectedStopId()" [tenantTimezone]="tenantTimezone()"
                  [isDispatcher]="isDispatcher()" [loading]="loading()" [planning]="planning()"
                  [cancelling]="cancelling()" [addingAdHoc]="addingAdHoc()"
                  (selectStop)="selectStop($event)" (viewOrder)="viewOrder($event)" (planRoute)="planSelectedRoute()"
                  (startRoute)="onStartRoute()" (completeRoute)="onCompleteRoute()" (cancelRoute)="onCancelRoute($event)"
                  (addAdHocStop)="onAddAdHocStop($event)" (markStopEnRoute)="onMarkStopEnRoute($event)"
                  (markStopArrived)="onMarkStopArrived($event)" (completeStop)="onCompleteStop($event)"
                  (skipStop)="onSkipStop($event)" />
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class RoutingComponent implements OnInit {
  private routeService = inject(RouteService);
  private orderService = inject(OrderService);
  private providerService = inject(ProviderService);
  private customerService = inject(CustomerService);
  private tenantUserService = inject(TenantUserService);
  private tenantService = inject(TenantService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);
  private translate = inject(TranslateService);

  private stopListRef = viewChild(RoutingStopListComponent);
  private listContainerRef = viewChild<ElementRef<HTMLDivElement>>('listContainer');

  /** Fade no fim da lista de cards (paradas/técnicos) quando há mais conteúdo abaixo do scroll —
   *  some perto do fundo real para não cobrir o último card. Recalcula sempre que o conteúdo da
   *  lista muda, porque a altura de scroll só existe depois do Angular repintar o DOM. */
  showBottomFade = signal(false);

  selectedDate = signal(todayIsoDate());
  selectedTechnicianId = signal<string>('ALL');
  selectedStopId = signal<string | null>(null);
  modeFilter = signal<ExecutionMode | 'ALL'>('ALL');
  readonly modeFilterOptions: { labelKey: string; value: ExecutionMode | 'ALL' }[] = [
    { labelKey: 'routing.modeFilter.all', value: 'ALL' },
    { labelKey: 'orders.executionMode.ONSITE', value: 'ONSITE' },
    { labelKey: 'orders.executionMode.EXTERNAL', value: 'EXTERNAL' },
  ];
  mobileView = signal<'list' | 'map'>('list');

  tenantTimezone = signal<string | null>(null);
  companyLocation = signal<{ latitude: number; longitude: number; name?: string; logoUrl?: string | null } | null>(null);
  technicians = signal<TenantDirectoryEntry[]>([]);
  /** `User.id` → hex da cor do Prestador (issue "Cor do Prestador") — só dispatchers têm
   *  permissão de leitura em `/providers`; perfil de campo cai no fallback por hash. */
  providerColorByUserId = signal<Map<string, string>>(new Map());
  dayRoutes = signal<RouteDto[]>([]);
  dayOrders = signal<Order[]>([]);
  customersById = signal<Map<string, Customer>>(new Map());
  generateErrors = signal<Map<string, string>>(new Map());

  loading = signal(false);
  error = signal(false);
  planning = signal(false);
  cancelling = signal(false);
  addingAdHoc = signal(false);
  generatingDay = signal(false);
  planningTechnicianId = signal<string | null>(null);

  technicianColor(technicianId: string): string {
    return resolveTechnicianColor(technicianId, this.providerColorByUserId());
  }

  technicianInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  }

  isDispatcher = computed(() => {
    const role = this.auth.userRole();
    return role === 'OWNER' || role === 'ADMIN' || role === 'OPERATOR';
  });

  /** Perfil de campo só vê a própria rota (mesma regra do backend) — não faz sentido oferecer
   *  "Todos os técnicos" a quem não pode abrir a rota de outro. */
  canBrowseAll = computed(() => this.isDispatcher());

  technicianRows = computed<TechnicianRow[]>(() => {
    const mode = this.modeFilter();
    const routesByTechnician = new Map(this.dayRoutes().map(r => [r.technicianId, r]));
    const filteredOrders = mode === 'ALL' ? this.dayOrders() : this.dayOrders().filter(o => o.executionMode === mode);
    const orderCounts = new Map<string, number>();
    for (const order of filteredOrders) {
      if (!order.technicianId) continue;
      orderCounts.set(order.technicianId, (orderCounts.get(order.technicianId) ?? 0) + 1);
    }
    const nameById = new Map(this.technicians().map(t => [t.id, t.name]));
    const errors = this.generateErrors();
    const ids = new Set([...routesByTechnician.keys(), ...orderCounts.keys()]);
    const rows: TechnicianRow[] = [];
    for (const id of ids) {
      const route = routesByTechnician.get(id) ?? null;
      const orderCount = orderCounts.get(id) ?? 0;
      const stopCount = route
        ? (mode === 'ALL' ? route.stops.length
          : route.stops.filter(s => stopExecutionMode(s.stopType) === null || stopExecutionMode(s.stopType) === mode).length)
        : orderCount;
      if (mode !== 'ALL' && orderCount === 0 && stopCount === 0) continue;
      const errorCode = !route ? errors.get(id) ?? null : null;
      rows.push({
        technicianId: id,
        name: nameById.get(id) ?? id,
        route,
        orderCount,
        stopCount,
        status: route ? route.status : errorCode ? 'ERROR' : 'NOT_PLANNED',
        errorCode,
      });
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  });

  visibleRoutes = computed<RouteDto[]>(() => {
    const technicianId = this.selectedTechnicianId();
    return technicianId === 'ALL' ? this.dayRoutes() : this.dayRoutes().filter(r => r.technicianId === technicianId);
  });

  visibleStops = computed<EnrichedStop[]>(() => {
    const mode = this.modeFilter();
    const nameById = new Map(this.technicians().map(t => [t.id, t.name]));
    const orderById = new Map(this.dayOrders().map(o => [o.id, o]));
    const customers = this.customersById();
    const currentUser = this.auth.currentUser();
    const stops: EnrichedStop[] = [];
    for (const route of this.visibleRoutes()) {
      const technicianName = nameById.get(route.technicianId)
        ?? (currentUser?.id === route.technicianId ? currentUser.name : route.technicianId);
      for (const stop of route.stops) {
        if (mode !== 'ALL') {
          const stopMode = stopExecutionMode(stop.stopType);
          if (stopMode !== null && stopMode !== mode) continue;
        }
        const order = stop.orderId ? orderById.get(stop.orderId) : undefined;
        const customer = order ? customers.get(order.customerId) : undefined;
        const isReturnLeg = order != null && (order.status === 'AWAITING_RETURN'
          || order.transitions.some(t => t.toStatus === 'AWAITING_RETURN'));
        stops.push({
          ...stop,
          technicianId: route.technicianId,
          technicianName,
          orderNumber: order?.orderNumber ?? null,
          customerName: customer?.name ?? null,
          addressText: order ? formatOrderAddress(order.address) : stop.address,
          isReturnLeg,
        });
      }
    }
    return stops;
  });

  selectedRoute = computed<RouteDto | null>(() => {
    const technicianId = this.selectedTechnicianId();
    if (technicianId === 'ALL') return null;
    return this.dayRoutes().find(r => r.technicianId === technicianId) ?? null;
  });

  selectedTechnicianName = computed(() => {
    const technicianId = this.selectedTechnicianId();
    if (technicianId === 'ALL') return '';
    const found = this.technicians().find(t => t.id === technicianId)?.name;
    if (found) return found;
    const currentUser = this.auth.currentUser();
    return currentUser?.id === technicianId ? currentUser.name : technicianId;
  });

  daySummary = computed<DaySummary>(() => {
    const rows = this.technicianRows();
    const visibleTechnicianIds = new Set(rows.map(r => r.technicianId));
    const routesWithDistance = this.dayRoutes()
      .filter(r => visibleTechnicianIds.has(r.technicianId) && r.totalDistanceKm > 0);
    return {
      technicianCount: rows.length,
      totalStops: rows.reduce((sum, r) => sum + r.stopCount, 0),
      totalOrders: rows.reduce((sum, r) => sum + r.orderCount, 0),
      totalDistanceKm: routesWithDistance.length
        ? routesWithDistance.reduce((sum, r) => sum + r.totalDistanceKm, 0) : null,
      totalDurationMinutes: routesWithDistance.length
        ? routesWithDistance.reduce((sum, r) => sum + r.totalDurationMinutes, 0) : null,
      totalRouteMinutes: routesWithDistance.length
        ? routesWithDistance.reduce((sum, r) => sum + r.totalRouteMinutes, 0) : null,
    };
  });

  private queryParamsInitialized = false;

  constructor() {
    effect(() => {
      this.technicianRows();
      this.visibleStops();
      this.selectedTechnicianId();
      this.mobileView();
      queueMicrotask(() => this.updateFadeState());
    });
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.updateFadeState();
  }

  onListScroll(): void {
    this.updateFadeState();
  }

  private updateFadeState(): void {
    const el = this.listContainerRef()?.nativeElement;
    if (!el) { this.showBottomFade.set(false); return; }
    const hasOverflow = el.scrollHeight > el.clientHeight + 1;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
    this.showBottomFade.set(hasOverflow && !atBottom);
  }

  ngOnInit(): void {
    if (this.isDispatcher()) {
      this.tenantUserService.directory().subscribe({
        next: users => this.technicians.set(users.filter(u => u.role === 'TECHNICIAN')),
        error: () => {},
      });
      // Cor do Prestador (issue "Cor do Prestador") — só quem lê /providers (dispatcher) resolve
      // a cor real; `size: 200` cobre o teto de técnicos de qualquer plano (30, CLAUDE.md §7).
      this.providerService.list({ size: 200 }).subscribe({
        next: page => this.providerColorByUserId.set(new Map(
          page.content.map(p => [p.userId, PROVIDER_COLOR_HEX[p.color]]),
        )),
        error: () => {},
      });
    }

    this.route.queryParamMap.subscribe(qp => this.applyQueryParams(qp));

    this.tenantService.getMe().subscribe({
      next: t => {
        this.tenantTimezone.set(t.timezone ?? null);
        this.companyLocation.set(
          t.latitude != null && t.longitude != null
            ? { latitude: t.latitude, longitude: t.longitude, name: t.name, logoUrl: t.logoUrl }
            : null,
        );
        this.loadDay();
      },
      error: () => this.loadDay(),
    });
  }

  /** Sincroniza o estado com a URL — tanto na carga inicial quanto ao voltar/avançar no browser,
   *  que muda a URL sem recriar o componente (mesma rota, só query params). Sem isso, "voltar" do
   *  browser atualiza a URL mas o ecrã fica preso na rota do técnico. */
  private applyQueryParams(qp: ParamMap): void {
    const qpTechnician = qp.get('technician');
    const nextTechnician = qpTechnician
      ?? (this.isDispatcher() ? 'ALL' : (this.auth.currentUser()?.id ?? 'ALL'));
    const nextDate = qp.get('date') ?? this.selectedDate();

    const dateChanged = nextDate !== this.selectedDate();
    const technicianChanged = nextTechnician !== this.selectedTechnicianId();

    this.selectedDate.set(nextDate);
    this.selectedTechnicianId.set(nextTechnician);
    if (technicianChanged) {
      this.selectedStopId.set(null);
      if (nextTechnician !== 'ALL') this.modeFilter.set('ALL');
    }

    if (this.queryParamsInitialized && dateChanged) this.loadDay();
    this.queryParamsInitialized = true;
  }

  /** Mantém técnico e data selecionados na URL. Por omissão sem novo item no histórico, para que
   *  "voltar" do browser, ao sair p.ex. para a ordem de serviço, restaure a rota aberta — não a
   *  lista de técnicos do dia. Só entrar numa rota (ALL → técnico) empilha item novo, para que
   *  "voltar" a partir do detalhe devolva à lista. */
  private syncQueryParams(replace: boolean = true): void {
    const technicianId = this.selectedTechnicianId();
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { technician: technicianId === 'ALL' ? null : technicianId, date: this.selectedDate() },
      queryParamsHandling: 'merge',
      replaceUrl: replace,
    });
  }

  onDateChange(date: string): void {
    this.selectedDate.set(date);
    this.selectedStopId.set(null);
    this.generateErrors.set(new Map());
    this.loadDay();
    this.syncQueryParams();
  }

  selectTechnician(technicianId: string): void {
    const enteringDetail = this.selectedTechnicianId() === 'ALL' && technicianId !== 'ALL';
    this.selectedTechnicianId.set(technicianId);
    this.selectedStopId.set(null);
    if (technicianId !== 'ALL') this.modeFilter.set('ALL');
    this.syncQueryParams(!enteringDetail);
  }

  selectStop(stopId: string): void {
    this.selectedStopId.set(stopId);
  }

  viewOrder(orderId: string): void {
    this.router.navigate(['/orders'], { queryParams: { open: orderId } });
  }

  loadDay(): void {
    const date = this.selectedDate();
    this.loading.set(true);
    this.error.set(false);
    forkJoin({
      routes: this.routeService.list({ start: date, end: date, size: 200 }).pipe(catchError(() => of(null))),
      orders: this.orderService
        .list({ start: shiftIsoDate(date, -1), end: shiftIsoDate(date, 1), size: 200 })
        .pipe(catchError(() => of(null))),
    }).subscribe(({ routes, orders }) => {
      this.loading.set(false);
      if (!routes || !orders) {
        this.error.set(true);
        return;
      }
      this.dayRoutes.set(routes.content);
      const tz = this.tenantTimezone();
      this.dayOrders.set(orders.content.filter(o => isSameTenantDay(o.scheduledStartAt, date, tz)));
      this.resolveCustomers();
    });
  }

  /** Atualiza só a rota afetada (troca no array `dayRoutes`) em vez de recarregar o dia inteiro —
   *  ações de paragem não devem re-render toda a tela nem mostrar o skeleton de `loading()`. */
  private refreshRoute(routeId: string): void {
    this.routeService.get(routeId).subscribe({
      next: updated => this.dayRoutes.update(routes => routes.map(r => (r.id === routeId ? updated : r))),
      error: err => this.toastError(err),
    });
  }

  private resolveCustomers(): void {
    const known = this.customersById();
    const missingIds = [...new Set(this.dayOrders().map(o => o.customerId))].filter(id => !known.has(id));
    if (!missingIds.length) return;
    forkJoin(missingIds.map(id => this.customerService.get(id).pipe(catchError(() => of(null)))))
      .subscribe(results => {
        const next = new Map(known);
        results.forEach((customer, i) => { if (customer) next.set(missingIds[i], customer); });
        this.customersById.set(next);
      });
  }

  planTechnician(technicianId: string): void {
    this.planningTechnicianId.set(technicianId);
    this.routeService.plan({ technicianId, routeDate: this.selectedDate() }).subscribe({
      next: () => {
        this.planningTechnicianId.set(null);
        this.selectTechnician(technicianId);
        this.loadDay();
      },
      error: err => {
        this.planningTechnicianId.set(null);
        this.toastError(err, 'routing.planError');
      },
    });
  }

  planSelectedRoute(): void {
    const technicianId = this.selectedTechnicianId();
    if (technicianId === 'ALL') return;
    this.planning.set(true);
    this.routeService.plan({ technicianId, routeDate: this.selectedDate() }).subscribe({
      next: () => { this.planning.set(false); this.loadDay(); },
      error: err => { this.planning.set(false); this.toastError(err, 'routing.planError'); },
    });
  }

  confirmGenerateDay(): void {
    this.confirmationService.confirm({
      header: this.translate.instant('routing.generateDay'),
      message: this.translate.instant('routing.generateDayConfirm', {
        date: formatLocalizedDate(this.selectedDate(), this.translate.getCurrentLang(), 'weekdayDate'),
      }),
      icon: 'pi pi-calendar-plus',
      acceptLabel: this.translate.instant('common.confirm'),
      rejectLabel: this.translate.instant('common.close'),
      acceptButtonProps: { severity: 'success' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => this.doGenerateDay(),
    });
  }

  private doGenerateDay(): void {
    this.generatingDay.set(true);
    this.routeService.generateDay(this.selectedDate()).subscribe({
      next: result => {
        this.generatingDay.set(false);
        const errors = new Map<string, string>();
        result.results.filter(r => r.status === 'ERROR').forEach(r => errors.set(r.technicianId, r.errorCode ?? ''));
        this.generateErrors.set(errors);
        this.messageService.add({
          severity: result.failed > 0 ? 'warn' : 'success',
          summary: this.translate.instant('routing.dayResultTitle', { succeeded: result.succeeded, failed: result.failed }),
        });
        this.loadDay();
      },
      error: () => {
        this.generatingDay.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('routing.generateDayError') });
      },
    });
  }

  onStartRoute(): void {
    const route = this.selectedRoute();
    if (!route) return;
    this.routeService.start(route.id).subscribe({ next: () => this.loadDay(), error: err => this.toastError(err) });
  }

  onCompleteRoute(): void {
    const route = this.selectedRoute();
    if (!route) return;
    this.routeService.complete(route.id).subscribe({ next: () => this.loadDay(), error: err => this.toastError(err) });
  }

  onCancelRoute(reason: string): void {
    const route = this.selectedRoute();
    if (!route) return;
    this.cancelling.set(true);
    this.routeService.cancel(route.id, reason).subscribe({
      next: () => {
        this.cancelling.set(false);
        this.stopListRef()?.closeCancelDialog();
        this.messageService.add({ severity: 'success', summary: this.translate.instant('routing.cancelled') });
        this.loadDay();
      },
      error: err => { this.cancelling.set(false); this.toastError(err, 'routing.cancelError'); },
    });
  }

  onAddAdHocStop(payload: { description: string; address: string | null; latitude: number; longitude: number; estimatedDurationMinutes: number }): void {
    const route = this.selectedRoute();
    if (!route) return;
    this.addingAdHoc.set(true);
    this.routeService.addAdHocStop(route.id, payload).subscribe({
      next: () => {
        this.addingAdHoc.set(false);
        this.stopListRef()?.closeAdHocDrawer();
        this.messageService.add({ severity: 'success', summary: this.translate.instant('routing.adHoc.added') });
        this.loadDay();
      },
      error: err => { this.addingAdHoc.set(false); this.toastError(err, 'routing.adHoc.addError'); },
    });
  }

  onMarkStopEnRoute(stopId: string): void {
    const route = this.selectedRoute();
    if (!route) return;
    this.routeService.markStopEnRoute(route.id, stopId).subscribe({ next: () => this.refreshRoute(route.id), error: err => this.toastError(err) });
  }

  onMarkStopArrived(stopId: string): void {
    const route = this.selectedRoute();
    if (!route) return;
    this.routeService.markStopArrived(route.id, stopId).subscribe({ next: () => this.refreshRoute(route.id), error: err => this.toastError(err) });
  }

  onCompleteStop(stopId: string): void {
    const route = this.selectedRoute();
    if (!route) return;
    this.routeService.completeStop(route.id, stopId).subscribe({ next: () => this.refreshRoute(route.id), error: err => this.toastError(err) });
  }

  onSkipStop(event: { stopId: string; reason: string }): void {
    const route = this.selectedRoute();
    if (!route) return;
    this.routeService.skipStop(route.id, event.stopId, event.reason).subscribe({ next: () => this.refreshRoute(route.id), error: err => this.toastError(err) });
  }

  private toastError(err: unknown, fallbackKey = 'routing.actionError'): void {
    const code = (err as { error?: { errorCode?: string } })?.error?.errorCode;
    const key = code ? `routing.errors.${code}` : '';
    const translated = key ? this.translate.instant(key) : '';
    this.messageService.add({
      severity: 'error',
      summary: translated && translated !== key ? translated : this.translate.instant(fallbackKey),
    });
  }
}

function formatOrderAddress(address: { street: string; complement?: string; city?: string } | null | undefined): string | null {
  if (!address) return null;
  return [address.street, address.complement, address.city].filter(Boolean).join(', ');
}
