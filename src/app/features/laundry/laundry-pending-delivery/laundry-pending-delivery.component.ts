import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { Panel } from 'primeng/panel';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { LaundryService, LaundryItem } from '../../../core/services/laundry.service';
import { LaundryFacilityService, LaundryFacility } from '../../../core/services/laundry-facility.service';
import { OrderService, Order } from '../../../core/services/order.service';
import { LocalizedDatePipe } from '../../../shared/pipes/localized-date.pipe';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

/** Quem lê a lista de lavanderias (mesmo READ_ROLES do LaundryFacilityController). O perfil
 *  LAUNDRY não lê — o nome da sua lavanderia vem no próprio item. */
const FACILITY_READ_ROLES = ['OWNER', 'ADMIN', 'OPERATOR', 'FINANCE'];
const SCHEDULE_ROLES = ['OWNER', 'ADMIN', 'COMMERCIAL', 'OPERATOR', 'FINANCE'];

interface ReturnAction {
  label: string;
  disabled: boolean;
  tooltip: string | null;
}

/**
 * "Pronto para devolução" (issue #176/#251) — lista quem já pode ter a devolução agendada. A
 * devolução em si não é mais uma ação em lote desta tela: cada item pertence a uma Ordem
 * {@code EXTERNAL} que, quando todos os seus itens ficam prontos, é liberada
 * ({@code Order#returnReady}) para agendar dia/hora/técnico pela própria aba "Agendamento" da
 * Ordem (mesmo quadro de sugestão de horários do orçamento) — aqui só se navega até lá.
 */
@Component({
  selector: 'app-laundry-pending-delivery',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, RouterLink, FormsModule, ButtonModule, SelectModule, TableModule, TooltipModule,
    ToastModule, LocalizedDatePipe, TranslatePipe, PageHeaderComponent, EmptyStateComponent, Panel,
  ],
  providers: [MessageService],
  template: `
    <p-toast />
    <div class="space-y-4 min-w-0 pb-16">
      <app-page-header [title]="'laundry.pendingDelivery.title' | translate"
                        [description]="'laundry.pendingDelivery.subtitle' | translate"
                        [breadcrumb]="[{ label: ('laundry.title' | translate), route: '/laundry' }]">
      </app-page-header>


      <p-panel>
      <div class="space-y-4 min-w-0">
        <div class="flex flex-wrap items-end gap-3">
        <div class="w-56">
          <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'laundry.facilityFilter' | translate }}</label>
          <p-select [options]="facilityOptions()" [(ngModel)]="facilityFilter" optionLabel="label" optionValue="value"
                    appendTo="body" fluid [showClear]="true"
                    [placeholder]="'laundry.allFacilities' | translate" (onChange)="load()" />
        </div>
        </div>

      @if (!loading() && items().length === 0) {
        <app-empty-state icon="pi pi-truck" [message]="'laundry.pendingDelivery.empty' | translate"></app-empty-state>
      } @else {
        <div class="overflow-x-auto min-w-0">
          <p-table [value]="items()" dataKey="id" [loading]="loading()" [showLoader]="false">
            <ng-template pTemplate="header">
              <tr>
                <th>{{ 'laundry.codeLabel' | translate }}</th>
                <th>{{ 'laundry.history.customer' | translate }}</th>
                <th>{{ 'laundry.facilityFilter' | translate }}</th>
                <th>{{ 'laundry.pendingDelivery.readyAt' | translate }}</th>
                @if (canScheduleReturn()) { <th></th> }
              </tr>
            </ng-template>
            <ng-template pTemplate="body" let-item>
              <tr>
                <td class="font-mono text-xs">{{ item.code }}</td>
                <td>{{ customerLabel(item) }}</td>
                <td>{{ facilityLabel(item) }}</td>
                <td>{{ (item.readyAt || item.collectedAt) | localizedDate:'medium' }}</td>
                @if (canScheduleReturn()) {
                  <td class="text-right">
                    @if (returnAction(item); as action) {
                      <p-button [label]="action.label" size="small" [text]="true" [disabled]="action.disabled"
                                [pTooltip]="action.tooltip ?? undefined"
                                [routerLink]="action.disabled ? null : '/orders'"
                                [queryParams]="{ open: item.orderId, tab: 'schedule' }" />
                    }
                  </td>
                }
              </tr>
            </ng-template>
          </p-table>
        </div>
      }
      </div>
      </p-panel>
    </div>
  `,
})
export class LaundryPendingDeliveryComponent implements OnInit {
  private laundryService = inject(LaundryService);
  private laundryFacilityService = inject(LaundryFacilityService);
  private orderService = inject(OrderService);
  private auth = inject(AuthService);
  private translate = inject(TranslateService);
  private messageService = inject(MessageService);

  items = signal<LaundryItem[]>([]);
  loading = signal(false);
  facilityFilter: string | null = null;

  private facilities = signal<LaundryFacility[]>([]);
  facilityOptions = computed(() => this.facilities().map(f => ({ value: f.id, label: f.name })));
  facilityName(facilityId: string | null): string {
    if (!facilityId) return '—';
    return this.facilities().find(f => f.id === facilityId)?.name ?? '—';
  }

  customerLabel(i: LaundryItem): string {
    return i.customerName ?? '#' + i.customerId.slice(0, 8);
  }
  facilityLabel(i: LaundryItem): string {
    return i.laundryFacilityName ?? this.facilityName(i.laundryFacilityId);
  }

  private ordersById = signal<Map<string, Order>>(new Map());

  canScheduleReturn = computed(() => SCHEDULE_ROLES.includes(this.auth.userRole() ?? ''));

  ngOnInit(): void {
    if (FACILITY_READ_ROLES.includes(this.auth.userRole() ?? '')) {
      this.laundryFacilityService.list({ size: 100 }).subscribe({ next: p => this.facilities.set(p.content), error: () => {} });
    }
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.laundryService.pendingDelivery(this.facilityFilter ?? undefined).subscribe({
      next: items => {
        this.loading.set(false);
        this.items.set(items);
        if (this.canScheduleReturn()) this.resolveMissingOrders(items);
      },
      error: () => { this.loading.set(false); this.showError(); },
    });
  }

  /** Estado da Ordem de cada item (issue coleta/devolução) — só quem pode agendar precisa
   *  saber {@code status}/{@code returnReady}/{@code scheduledStartAt} pra decidir o botão. */
  private resolveMissingOrders(items: LaundryItem[]): void {
    const known = this.ordersById();
    const missingIds = [...new Set(items.map(i => i.orderId).filter(id => !known.has(id)))];
    if (!missingIds.length) return;
    forkJoin(missingIds.map(id => this.orderService.get(id))).subscribe({
      next: fetched => {
        this.ordersById.update(map => {
          const next = new Map(map);
          fetched.forEach(o => next.set(o.id, o));
          return next;
        });
      },
      error: () => {},
    });
  }

  /** {@code null} enquanto a Ordem do item ainda não carregou — sem ação nenhuma até lá, nunca um
   *  botão que levaria a um estado que ainda não se sabe se é válido. */
  returnAction(item: LaundryItem): ReturnAction | null {
    const order = this.ordersById().get(item.orderId);
    if (!order) return null;
    if (order.status === 'AWAITING_RETURN' && !order.returnReady) {
      return {
        label: this.translate.instant('laundry.pendingDelivery.waitingOtherItems'),
        disabled: true,
        tooltip: this.translate.instant('laundry.pendingDelivery.waitingOtherItemsHint'),
      };
    }
    const alreadyScheduled = !!order.scheduledStartAt;
    return {
      label: this.translate.instant(alreadyScheduled ? 'laundry.pendingDelivery.viewSchedule' : 'laundry.pendingDelivery.scheduleReturn'),
      disabled: false,
      tooltip: null,
    };
  }

  private showError(): void {
    this.messageService.add({ severity: 'error', summary: this.translate.instant('laundry.error') });
  }
}
