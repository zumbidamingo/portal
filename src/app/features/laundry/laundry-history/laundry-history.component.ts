import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { Panel } from 'primeng/panel';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { LaundryService, LaundryItem, LaundryHistoryFilters } from '../../../core/services/laundry.service';
import { LaundryFacilityService, LaundryFacility } from '../../../core/services/laundry-facility.service';
import { AuthService } from '../../../core/auth/auth.service';
import { LocalizedDatePipe } from '../../../shared/pipes/localized-date.pipe';
import { TagBadgeComponent } from '../../../shared/components/tag-badge/tag-badge.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { TableStandardDirective } from '../../../shared/directives/table-standard.directive';

const PAGE_SIZE = 20;

function toIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Histórico de lavandaria (30 dias após entrega): itens que já saíram da grelha principal do
 * quadro (issue histórico de lavandaria). Tela só de leitura — nenhuma ação muda item nem estado
 * daqui, coerente com o requisito de consultar sem alterar a operação. Mesmo padrão de listagem
 * server-side lazy de {@code CustomerImportsHistoryComponent}, com a barra de filtros no mesmo
 * idioma visual da grelha principal de {@code LaundryComponent}.
 */
/** Quem lê a lista de lavanderias (mesmo READ_ROLES do LaundryFacilityController). O perfil
 *  LAUNDRY não lê — o nome da sua lavanderia vem no próprio item. */
const FACILITY_READ_ROLES = ['OWNER', 'ADMIN', 'OPERATOR', 'FINANCE'];

@Component({
  selector: 'app-laundry-history',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, FormsModule, ButtonModule, DialogModule, SelectModule, DatePickerModule, InputTextModule,
    TableModule, LocalizedDatePipe, TranslatePipe, TagBadgeComponent, PageHeaderComponent, EmptyStateComponent,
    TableStandardDirective, Panel,
  ],
  template: `
    <div class="space-y-4 min-w-0">
      <app-page-header [title]="'laundry.history.title' | translate" [description]="'laundry.history.subtitle' | translate"
                        [breadcrumb]="[{ label: ('laundry.title' | translate), route: '/laundry' }]">
      </app-page-header>


      <p-panel>
      <div class="space-y-4 min-w-0">
      <!-- FILTERS -->
      <div class="flex flex-wrap items-end gap-3">
        <div class="flex-1 min-w-56">
          <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5" for="laundryHistorySearch">
            {{ 'laundry.history.searchFilter' | translate }}
          </label>
          <input pInputText id="laundryHistorySearch" fluid [(ngModel)]="searchFilter"
                 [placeholder]="'laundry.history.searchPlaceholder' | translate"
                 autocomplete="off" (ngModelChange)="applyFilters()" />
        </div>
        <div class="w-56">
          <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'laundry.customerFilter' | translate }}</label>
          <input pInputText fluid [(ngModel)]="customerFilter"
                 [placeholder]="'laundry.customerSearchFilterPlaceholder' | translate"
                 autocomplete="off" (ngModelChange)="applyFilters()" />
        </div>
        <div class="w-56">
          <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'laundry.facilityFilter' | translate }}</label>
          <p-select [options]="facilityOptions()" [(ngModel)]="facilityFilter" optionLabel="label" optionValue="value"
                    appendTo="body" fluid [showClear]="true"
                    [placeholder]="'laundry.allFacilities' | translate" (onChange)="applyFilters()" />
        </div>
        <div class="w-64">
          <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'laundry.history.collectedPeriod' | translate }}</label>
          <p-datepicker [(ngModel)]="collectedRange" selectionMode="range" [readonlyInput]="true"
                        appendTo="body" fluid [showClear]="true" dateFormat="dd/mm/yy"
                        [placeholder]="'laundry.allPeriods' | translate" (onSelect)="applyFilters()"
                        (onClear)="applyFilters()" />
        </div>
        <div class="w-64">
          <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'laundry.history.deliveredPeriod' | translate }}</label>
          <p-datepicker [(ngModel)]="deliveredRange" selectionMode="range" [readonlyInput]="true"
                        appendTo="body" fluid [showClear]="true" dateFormat="dd/mm/yy"
                        [placeholder]="'laundry.allPeriods' | translate" (onSelect)="applyFilters()"
                        (onClear)="applyFilters()" />
        </div>
        @if (hasActiveFilters()) {
          <p-button [label]="'common.clearFilters' | translate" icon="pi pi-filter-slash" [text]="true" size="small"
                    (onClick)="clearFilters()" />
        }
      </div>

      @if (!loading() && total() === 0) {
        <app-empty-state icon="pi pi-history" [message]="'laundry.history.empty' | translate"
                          [subtitle]="'laundry.history.emptySubtitle' | translate"></app-empty-state>
      } @else {
        <div class="overflow-x-auto min-w-0">
          <p-table appTableStandard [value]="rows()" dataKey="id" [lazy]="true" [rows]="pageSize"
                   [totalRecords]="total()" [loading]="loading()" [showLoader]="false" [first]="first()"
                   [sortField]="sortField()" [sortOrder]="sortOrder()"
                   (onLazyLoad)="onLazyLoad($event)">
            <ng-template pTemplate="header">
              <tr>
                <th>{{ 'laundry.codeLabel' | translate }}</th>
                <th>{{ 'laundry.history.customer' | translate }}</th>
                <th>{{ 'laundry.history.item' | translate }}</th>
                <th>{{ 'laundry.facilityFilter' | translate }}</th>
                <th pSortableColumn="collectedAt">{{ 'laundry.history.collectedAt' | translate }} <p-sortIcon field="collectedAt" /></th>
                <th pSortableColumn="readyAt">{{ 'laundry.history.readyAt' | translate }} <p-sortIcon field="readyAt" /></th>
                <th pSortableColumn="deliveredAt">{{ 'laundry.history.deliveredAt' | translate }} <p-sortIcon field="deliveredAt" /></th>
                <th>{{ 'laundry.statusHeader' | translate }}</th>
              </tr>
            </ng-template>
            <ng-template pTemplate="body" let-item>
              <tr class="cursor-pointer" (click)="openDetail(item)">
                <td class="font-mono text-xs">{{ item.code }}</td>
                <td>{{ customerLabel(item) }}</td>
                <td class="truncate max-w-56">{{ item.description || ('laundry.noDescription' | translate) }}</td>
                <td>{{ facilityLabel(item) }}</td>
                <td>{{ item.collectedAt | localizedDate:'medium' }}</td>
                <td>{{ item.readyAt ? (item.readyAt | localizedDate:'medium') : '—' }}</td>
                <td>{{ item.deliveredAt | localizedDate:'medium' }}</td>
                <td><app-tag-badge [value]="'laundry.status.DELIVERED' | translate" severity="success" /></td>
              </tr>
            </ng-template>
          </p-table>
        </div>
      }
      </div>
      </p-panel>
    </div>

    <!-- DETALHE — só leitura, sem ações de mutação (issue histórico de lavandaria) -->
    <p-dialog [(visible)]="showDetail" [header]="'laundry.detailTitle' | translate" [modal]="true" [style]="{ width: '32rem' }">
      @if (selectedItem(); as i) {
        <div class="space-y-3 text-sm">
          <div class="flex justify-between items-center gap-3">
            <span class="text-app-text-secondary">{{ 'laundry.codeLabel' | translate }}</span>
            <span class="font-mono font-semibold text-app-text">{{ i.code }}</span>
          </div>
          <div class="flex justify-between items-center gap-3">
            <span class="text-app-text-secondary">{{ 'laundry.history.customer' | translate }}</span>
            <span class="font-medium text-app-text">{{ customerLabel(i) }}</span>
          </div>
          <div class="flex justify-between items-center gap-3">
            <span class="text-app-text-secondary">{{ 'laundry.facilityLabel' | translate }}</span>
            <span class="font-medium text-app-text">{{ facilityLabel(i) }}</span>
          </div>
          @if (i.description) {
            <div>
              <span class="text-app-text-secondary">{{ 'laundry.descriptionLabel' | translate }}:</span>
              <div class="font-medium text-app-text mt-1">{{ i.description }}</div>
            </div>
          }
          @if (i.collectionNotes) {
            <div>
              <span class="text-app-text-secondary">{{ 'laundry.notesLabel' | translate }}:</span>
              <div class="mt-1 italic text-app-text-secondary">{{ i.collectionNotes }}</div>
            </div>
          }
          <div class="border-t border-app-border pt-3 grid grid-cols-3 gap-2 text-xs">
            <div>
              <div class="text-app-text-secondary">{{ 'laundry.history.collectedAt' | translate }}</div>
              <div class="font-medium text-app-text mt-0.5">{{ i.collectedAt | localizedDate:'medium' }}</div>
            </div>
            <div>
              <div class="text-app-text-secondary">{{ 'laundry.history.readyAt' | translate }}</div>
              <div class="font-medium text-app-text mt-0.5">{{ i.readyAt ? (i.readyAt | localizedDate:'medium') : '—' }}</div>
            </div>
            <div>
              <div class="text-app-text-secondary">{{ 'laundry.history.deliveredAt' | translate }}</div>
              <div class="font-medium text-app-text mt-0.5">{{ i.deliveredAt | localizedDate:'medium' }}</div>
            </div>
          </div>
          @if (i.photos.length) {
            <div>
              <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'laundry.photos' | translate }}</label>
              <div class="flex flex-wrap gap-2">
                @for (photo of i.photos; track photo.id) {
                  <img [src]="photo.url" class="w-16 h-16 object-cover rounded border border-app-border" />
                }
              </div>
            </div>
          }
          <div class="flex justify-end pt-2">
            <p-button [label]="'laundry.close' | translate" [text]="true" (onClick)="showDetail = false" />
          </div>
        </div>
      }
    </p-dialog>
  `,
})
export class LaundryHistoryComponent implements OnInit {
  private laundryService = inject(LaundryService);
  private laundryFacilityService = inject(LaundryFacilityService);
  private auth = inject(AuthService);
  private translate = inject(TranslateService);
  private destroyRef = inject(DestroyRef);

  readonly pageSize = PAGE_SIZE;

  rows = signal<LaundryItem[]>([]);
  total = signal(0);
  first = signal(0);
  loading = signal(false);
  sortField = signal('deliveredAt');
  sortOrder = signal<1 | -1>(-1);

  showDetail = false;
  selectedItem = signal<LaundryItem | null>(null);

  searchFilter: string | null = null;
  customerFilter: string | null = null;
  facilityFilter: string | null = null;
  collectedRange: Date[] | null = null;
  deliveredRange: Date[] | null = null;
  private filterChange$ = new Subject<void>();

  private facilities = signal<LaundryFacility[]>([]);
  facilityOptions = computed(() => this.facilities().map(f => ({ value: f.id, label: f.name })));

  customerLabel(i: LaundryItem): string {
    return i.customerName ?? '#' + i.customerId.slice(0, 8);
  }
  facilityLabel(i: LaundryItem): string {
    return i.laundryFacilityName ?? this.facilityName(i.laundryFacilityId);
  }

  facilityName(facilityId: string | null): string {
    if (!facilityId) return '—';
    return this.facilities().find(f => f.id === facilityId)?.name ?? '—';
  }

  ngOnInit(): void {
    if (FACILITY_READ_ROLES.includes(this.auth.userRole() ?? '')) {
      this.laundryFacilityService.list({ size: 100 }).subscribe({ next: p => this.facilities.set(p.content), error: () => {} });
    }

    const sub = this.filterChange$.pipe(debounceTime(300), distinctUntilChanged(() => false)).subscribe(() => {
      this.first.set(0);
      this.load(0);
    });
    this.destroyRef.onDestroy(() => sub.unsubscribe());

    this.load(0);
  }

  onLazyLoad(event: TableLazyLoadEvent): void {
    const first = event.first ?? 0;
    this.first.set(first);
    if (event.sortField && typeof event.sortField === 'string') {
      this.sortField.set(event.sortField);
      this.sortOrder.set(event.sortOrder === 1 ? 1 : -1);
    }
    this.load(Math.floor(first / this.pageSize));
  }

  applyFilters(): void {
    this.filterChange$.next();
  }

  hasActiveFilters(): boolean {
    return !!this.searchFilter || !!this.customerFilter || !!this.facilityFilter
      || !!this.collectedRange || !!this.deliveredRange;
  }

  clearFilters(): void {
    this.searchFilter = null;
    this.customerFilter = null;
    this.facilityFilter = null;
    this.collectedRange = null;
    this.deliveredRange = null;
    this.applyFilters();
  }

  openDetail(item: LaundryItem): void {
    this.selectedItem.set(item);
    this.showDetail = true;
  }

  private load(page: number): void {
    this.loading.set(true);
    this.laundryService.history({
      search: this.searchFilter || undefined,
      customerName: this.customerFilter || undefined,
      laundryFacilityId: this.facilityFilter || undefined,
      collectedStart: this.collectedRange?.[0] ? toIsoDate(this.collectedRange[0]) : undefined,
      collectedEnd: this.collectedRange?.[1] ? toIsoDate(this.collectedRange[1]) : (this.collectedRange?.[0] ? toIsoDate(this.collectedRange[0]) : undefined),
      deliveredStart: this.deliveredRange?.[0] ? toIsoDate(this.deliveredRange[0]) : undefined,
      deliveredEnd: this.deliveredRange?.[1] ? toIsoDate(this.deliveredRange[1]) : (this.deliveredRange?.[0] ? toIsoDate(this.deliveredRange[0]) : undefined),
      page,
      size: this.pageSize,
      sortField: this.sortField(),
      sortOrder: this.sortOrder(),
    }).subscribe({
      next: result => {
        this.loading.set(false);
        this.rows.set(result.content);
        this.total.set(result.page.totalElements);
      },
      error: () => { this.loading.set(false); },
    });
  }
}
