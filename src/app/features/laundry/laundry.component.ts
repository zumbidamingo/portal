import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { DrawerModule } from 'primeng/drawer';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { Observable, Subject, forkJoin, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, switchMap, tap } from 'rxjs/operators';
import { CheckboxModule } from 'primeng/checkbox';
import { LaundryCollectableOrder, LaundryService, LaundryItem, LaundryItemPage, LaundryItemStatus } from '../../core/services/laundry.service';
import { LaundryFacilityService, LaundryFacility } from '../../core/services/laundry-facility.service';
import { AuthService } from '../../core/auth/auth.service';
import { TenantService } from '../../core/services/tenant.service';
import { LocalizedDatePipe } from '../../shared/pipes/localized-date.pipe';
import { TagBadgeComponent } from '../../shared/components/tag-badge/tag-badge.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { ImageDropzoneComponent } from '../../shared/components/image-dropzone/image-dropzone.component';
import type { BadgeSeverity } from '../../shared/utils/status.utils';

const COLUMNS: LaundryItemStatus[] = ['RECEIVED', 'PROCESSING', 'READY', 'RELEASED', 'DELIVERED'];

function toIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Quem lê a lista de lavanderias (mesmo READ_ROLES do LaundryFacilityController). O perfil
 *  LAUNDRY não lê — o nome da sua lavanderia vem no próprio item. */
const FACILITY_READ_ROLES = ['OWNER', 'ADMIN', 'OPERATOR', 'FINANCE'];

@Component({
  selector: 'app-laundry',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule, ButtonModule, DialogModule, DrawerModule, SelectModule, DatePickerModule,
    InputTextModule, TextareaModule, ToastModule, CheckboxModule, ConfirmDialogModule, LocalizedDatePipe, TranslatePipe,
    TagBadgeComponent, PageHeaderComponent, EmptyStateComponent,
    ImageDropzoneComponent,
  ],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast />
    <p-confirmDialog [style]="{ width: '26rem' }"></p-confirmDialog>
    <div class="space-y-4 min-w-0">
      <app-page-header [title]="'laundry.title' | translate" [description]="'laundry.subtitle' | translate">
        <p-button [label]="'laundry.pendingDelivery.title' | translate" icon="pi pi-directions" [outlined]="true"
                  size="small" (onClick)="goToPendingDelivery()" />
        <p-button [label]="'laundry.history.viewHistory' | translate" icon="pi pi-history" [outlined]="true"
                  size="small" (onClick)="goToHistory()" />
        @if (!laundryEmpty()) {
          <p-button [label]="'laundry.collectNew' | translate" icon="pi pi-plus" (onClick)="openCollect()" size="small" />
        }
      </app-page-header>

      <!-- FILTERS -->
      <div class="flex flex-wrap items-end gap-3">
        <div class="w-48">
          <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'laundry.statusFilter' | translate }}</label>
          <p-select [options]="statusOptions" [(ngModel)]="statusFilter" optionLabel="label" optionValue="value"
                    appendTo="body" fluid [showClear]="true"
                    [placeholder]="'laundry.allStatuses' | translate" (onChange)="applyFilters()" />
        </div>
        <div class="w-56">
          <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'laundry.facilityFilter' | translate }}</label>
          <p-select [options]="facilityOptions()" [(ngModel)]="facilityFilter" optionLabel="label" optionValue="value"
                    appendTo="body" fluid [showClear]="true"
                    [placeholder]="'laundry.allFacilities' | translate" (onChange)="applyFilters()" />
        </div>
        <div class="flex-1 min-w-56">
          <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5" for="laundryCustomerSearch">
            {{ 'laundry.customerFilter' | translate }}
          </label>
          <input pInputText id="laundryCustomerSearch" fluid [(ngModel)]="customerFilter"
                 [placeholder]="'laundry.customerSearchFilterPlaceholder' | translate"
                 autocomplete="off" (ngModelChange)="applyFilters()" />
        </div>
        <div class="w-56">
          <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'laundry.orderFilter' | translate }}</label>
          <p-select [options]="orderOptions()" [(ngModel)]="orderFilter" optionLabel="label" optionValue="value"
                    appendTo="body" fluid [showClear]="true" [filter]="true"
                    [placeholder]="'laundry.orderFilterPlaceholder' | translate" (onChange)="applyFilters()" />
        </div>
        <div class="w-64">
          <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'laundry.periodFilter' | translate }}</label>
          <p-datepicker [(ngModel)]="periodRange" selectionMode="range" [readonlyInput]="true"
                        appendTo="body" fluid [showClear]="true" dateFormat="dd/mm/yy"
                        [placeholder]="'laundry.allPeriods' | translate" (onSelect)="applyFilters()"
                        (onClear)="applyFilters()" />
        </div>
        @if (hasActiveFilters()) {
          <p-button [label]="'common.clearFilters' | translate" icon="pi pi-filter-slash" [text]="true" size="small"
                    (onClick)="clearFilters()" />
        }
      </div>

      @if (laundryEmpty()) {
        <app-empty-state icon="pi pi-inbox" [message]="'laundry.emptyList' | translate"
                          [subtitle]="'laundry.emptyListSubtitle' | translate"
                          [actionLabel]="'laundry.collectNew' | translate" (actionClick)="openCollect()"></app-empty-state>
      } @else {
      <!-- BOARD — mesma linguagem visual do Kanban de orders.component.ts: coluna com cabeçalho
           fixo e corpo com scroll próprio, em vez de altura mínima fixa e página inteira a rolar. -->
      <div class="flex flex-wrap items-stretch gap-4">
        @for (col of columns; track col) {
          <div class="bg-app-surface rounded-md border border-app-border flex-1 min-w-[220px] flex flex-col max-h-[calc(100vh-260px)]">
            <div class="px-3 py-2.5 border-b border-app-border shrink-0">
              <div class="flex justify-between items-center">
                <span class="font-semibold text-app-text text-sm">{{ ('laundry.status.' + col) | translate }}</span>
                <span class="text-xs bg-app-surface-hover px-2 py-0.5 rounded-full font-medium text-app-text-secondary">
                  {{ counts()[col] ?? 0 }}
                </span>
              </div>
            </div>
            <div class="p-2.5 space-y-2 overflow-y-auto flex-1">
              @if (itemsByStatus(col).length === 0) {
                <div class="text-xs text-app-text-tertiary text-center py-6">{{ 'laundry.empty' | translate }}</div>
              }
              @for (i of itemsByStatus(col); track i.id) {
                <div class="bg-app-bg p-3 rounded-lg border border-app-border hover:border-app-accent transition-colors cursor-pointer"
                     (click)="openDetail(i)">
                  <div class="text-xs font-mono font-semibold text-app-accent-hover mb-1.5">{{ i.code }}</div>
                  <div class="text-sm font-medium text-app-text mb-1 truncate">{{ customerLabel(i) }}</div>
                  <div class="text-xs text-app-text-secondary mb-2 truncate">
                    <i class="pi pi-building text-[10px] mr-1"></i>{{ facilityLabel(i) }}
                  </div>
                  @if (i.description) {
                    <div class="text-xs text-app-text-tertiary mb-1.5 truncate">{{ i.description }}</div>
                  }
                  <div class="text-xs text-app-text-tertiary">{{ i.collectedAt | localizedDate:'medium' }}</div>
                </div>
              }
            </div>
          </div>
        }
      </div>

      }
    </div>

    <!-- COLLECT DIALOG -->
    <p-dialog [(visible)]="collectDialogOpen" [header]="'laundry.collectTitle' | translate" [modal]="true" [style]="{ width: '480px' }">
      <div class="space-y-3" [formGroup]="collectForm">
        <div>
          <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'laundry.orderLabel' | translate }}</label>
          <p-select [options]="orderOptions()" formControlName="orderId" optionLabel="label" optionValue="value"
                    appendTo="body" fluid [filter]="true" [placeholder]="'laundry.selectOrder' | translate"
                    (onChange)="onCollectOrderChange($event.value)" />
        </div>
        <div>
          <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'laundry.facilityLabel' | translate }}</label>
          <p-select [options]="activeFacilityOptions()" formControlName="laundryFacilityId" optionLabel="label" optionValue="value"
                    appendTo="body" fluid [placeholder]="'laundry.selectFacility' | translate" />
        </div>

        @if (collectOrderExternalItems().length) {
          <div>
            <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'laundry.itemsToCollect' | translate }}</label>
            <div class="space-y-2 border border-app-border rounded-md p-2 max-h-40 overflow-y-auto">
              @for (item of collectOrderExternalItems(); track item.id) {
                <div class="flex items-center gap-2">
                  <p-checkbox [binary]="true" [ngModel]="isItemSelectedForCollect(item.id)" [ngModelOptions]="{standalone: true}"
                              (ngModelChange)="toggleItemForCollect(item.id, $event)" />
                  <span class="text-sm text-app-text">{{ item.description }}</span>
                </div>
              }
            </div>
          </div>
        } @else if (collectForm.controls.orderId.value) {
          <div>
            <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'laundry.descriptionLabel' | translate }}</label>
            <input pInputText formControlName="description" class="w-full"
                   [placeholder]="'laundry.descriptionPlaceholder' | translate" />
          </div>
        }

        <div>
          <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'laundry.notesLabel' | translate }}</label>
          <textarea pTextarea formControlName="notes" rows="2" class="w-full"
                    [placeholder]="'laundry.notesPlaceholder' | translate"></textarea>
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <p-button [label]="'laundry.close' | translate" [text]="true" (onClick)="collectDialogOpen = false" />
          <p-button [label]="'laundry.confirm' | translate" [loading]="collecting()"
                    [disabled]="!canConfirmCollect()" (onClick)="confirmCollect()" />
        </div>
      </div>
    </p-dialog>

    <!-- DRAWER: gerir item — mesmo desenho do drawer de orders.component.ts (cabeçalho e rodapé
         fixos, corpo com scroll único do drawer); sem abas porque o item não tem sub-superfícies
         como a OS (é uma única entidade plana). -->
    <p-drawer [(visible)]="showDetail" position="right" [dismissible]="true" [closeOnEscape]="true"
              styleClass="w-full! sm:w-[28rem]! lg:w-[36rem]!">
      <ng-template #header>
        @if (selectedItem(); as i) {
          <div class="flex items-center gap-2 min-w-0">
            <span class="font-mono font-semibold text-app-text">{{ i.code }}</span>
            <span class="text-app-text-secondary truncate">{{ customerLabel(i) }}</span>
            <app-tag-badge [value]="('laundry.status.' + i.status) | translate" [severity]="statusSeverity(i.status)"></app-tag-badge>
          </div>
        }
      </ng-template>

      @if (selectedItem(); as i) {
        <div class="space-y-4 text-sm pb-4">
          <div class="flex justify-between items-center gap-3">
            <span class="text-app-text-secondary shrink-0">{{ 'laundry.facilityLabel' | translate }}:</span>
            @if (canReassignFacility(i)) {
              <p-select [options]="reassignFacilityOptions(i.laundryFacilityId)" [ngModel]="i.laundryFacilityId"
                        [ngModelOptions]="{standalone: true}" optionLabel="label" optionValue="value"
                        appendTo="body" [style]="{ minWidth: '200px' }" (onChange)="confirmReassignFacility(i, $event.value)" />
            } @else {
              <strong class="font-medium text-app-text">{{ facilityLabel(i) }}</strong>
            }
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

          <div>
            <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'laundry.photos' | translate }}</label>
            <app-image-dropzone [images]="i.photos" [uploading]="uploadingPhoto()"
                                 (filesSelected)="onPhotosSelected($event, i)"
                                 (imageRemove)="confirmRemovePhoto(i, $event)"></app-image-dropzone>
          </div>
        </div>
      }

      <ng-template #footer>
        @if (selectedItem(); as i) {
          <div class="flex flex-wrap justify-end gap-2">
            @if (i.status === 'RECEIVED') {
              <p-button [label]="'laundry.actions.startProcessing' | translate" severity="info" (onClick)="action('startProcessing')" />
            }
            @if (i.status === 'PROCESSING') {
              <p-button [label]="'laundry.actions.markReady' | translate" severity="success" (onClick)="action('markReady')" />
            }
            @if (i.status === 'READY') {
              <p-button [label]="'laundry.actions.release' | translate" severity="help" (onClick)="action('release')" />
            }
            @if (i.status === 'RELEASED') {
              <p-button [label]="'laundry.actions.deliver' | translate" severity="success" (onClick)="action('deliver')" />
            }
            <p-button [label]="'laundry.actions.printLabel' | translate" [outlined]="true" (onClick)="printLabel(i)" />
            @if (i.status !== 'RECEIVED') {
              <p-button [label]="'laundry.correctStatus.action' | translate" severity="danger" [outlined]="true"
                        (onClick)="openCorrectStatus()" />
            }
          </div>
        }
      </ng-template>
    </p-drawer>

    <!-- CORRIGIR ESTADO (engano do operador) -->
    <p-dialog [(visible)]="correctStatusOpen" [header]="'laundry.correctStatus.title' | translate"
              [modal]="true" [style]="{ width: '420px' }">
      <div class="space-y-3">
        <p class="text-xs text-app-text-secondary">{{ 'laundry.correctStatus.hint' | translate }}</p>
        <div>
          <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'laundry.correctStatus.targetLabel' | translate }}</label>
          <p-select [options]="correctTargetOptions()" [ngModel]="correctTargetStatus()" (ngModelChange)="correctTargetStatus.set($event)"
                    optionLabel="label" optionValue="value" appendTo="body" fluid
                    [placeholder]="'laundry.correctStatus.targetPlaceholder' | translate" />
        </div>
        <div>
          <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'laundry.correctStatus.reasonLabel' | translate }}</label>
          <textarea pTextarea rows="3" class="w-full" [ngModel]="correctReason()" (ngModelChange)="correctReason.set($event)"
                    [placeholder]="'laundry.correctStatus.reasonPlaceholder' | translate"></textarea>
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <p-button [label]="'laundry.close' | translate" [text]="true" (onClick)="correctStatusOpen = false" />
          <p-button [label]="'laundry.correctStatus.confirm' | translate" severity="danger" [loading]="correctingStatus()"
                    [disabled]="!correctTargetStatus() || !correctReason().trim()" (onClick)="confirmCorrectStatus()" />
        </div>
      </div>
    </p-dialog>
  `,
})
export class LaundryComponent implements OnInit {
  private laundryService = inject(LaundryService);
  private laundryFacilityService = inject(LaundryFacilityService);
  private router = inject(Router);
  private auth = inject(AuthService);
  private tenantService = inject(TenantService);
  private messageService = inject(MessageService);
  private translate = inject(TranslateService);
  private confirmationService = inject(ConfirmationService);
  private destroyRef = inject(DestroyRef);

  readonly columns = COLUMNS;

  items = signal<LaundryItem[]>([]);
  counts = signal<Partial<Record<LaundryItemStatus, number>>>({});
  loading = signal(false);
  showDetail = false;
  selectedItem = signal<LaundryItem | null>(null);

  /** Total real vem do agregado do quadro (server-side), não de `items()` — a lista fica presa
   *  ao teto de 200 por request, o total por estado não. Onboarding, distinto de "sem resultados
   *  para o filtro" (mesmo raciocínio de {@link OrdersComponent#ordersEmpty}). */
  private totalItemsCount = computed(() => Object.values(this.counts()).reduce((a, b) => a + (b ?? 0), 0));
  laundryEmpty = computed(() => !this.loading() && this.totalItemsCount() === 0 && !this.hasActiveFilters());

  statusFilter: LaundryItemStatus | null = null;
  facilityFilter: string | null = null;
  customerFilter: string | null = null;
  orderFilter: string | null = null;
  periodRange: Date[] | null = null;
  private filterChange$ = new Subject<void>();

  statusOptions = COLUMNS.map(s => ({ value: s, label: this.translate.instant('laundry.status.' + s) }));

  customerLabel(i: LaundryItem): string {
    return i.customerName ?? '#' + i.customerId.slice(0, 8);
  }
  facilityLabel(i: LaundryItem): string {
    return i.laundryFacilityName ?? this.facilityName(i.laundryFacilityId);
  }
  private orders = signal<LaundryCollectableOrder[]>([]);
  orderOptions = computed(() => this.orders().map(o => ({
    value: o.id,
    label: '#' + o.orderNumber + ' — ' + o.street + (o.customerName ? ' · ' + o.customerName : ''),
  })));

  collectDialogOpen = false;
  collecting = signal(false);
  readonly collectForm = new FormGroup({
    orderId: new FormControl<string | null>(null),
    laundryFacilityId: new FormControl<string | null>(null),
    description: new FormControl('', { nonNullable: true }),
    notes: new FormControl('', { nonNullable: true }),
  });

  // ── Facility: preferencial do tenant, itens EXTERNAL da ordem escolhida, e destino por item ──
  private facilities = signal<LaundryFacility[]>([]);
  activeFacilityOptions = computed(() => this.facilities().filter(f => f.active).map(f => ({ value: f.id, label: f.name })));
  /** Filtro histórico: mostra também lavanderias hoje inativas, para não esconder itens antigos. */
  facilityOptions = computed(() => this.facilities().map(f => ({ value: f.id, label: f.name })));
  private preferredFacilityId = signal<string | null>(null);
  private collectOrderItems = signal<LaundryCollectableOrder['items']>([]);
  /** O backend já devolve só os itens EXTERNAL — os ONSITE da mesma ordem não entram no circuito. */
  collectOrderExternalItems = computed(() => this.collectOrderItems());
  private selectedItemIdsForCollect = signal<Set<string>>(new Set());

  canConfirmCollect(): boolean {
    if (!this.collectForm.controls.orderId.value || !this.collectForm.controls.laundryFacilityId.value) return false;
    return this.collectOrderExternalItems().length > 0
      ? this.selectedItemIdsForCollect().size > 0
      : true;
  }

  isItemSelectedForCollect(itemId: string): boolean {
    return this.selectedItemIdsForCollect().has(itemId);
  }

  toggleItemForCollect(itemId: string, checked: boolean): void {
    const next = new Set(this.selectedItemIdsForCollect());
    if (checked) next.add(itemId); else next.delete(itemId);
    this.selectedItemIdsForCollect.set(next);
  }

  /** Ordem escolhida no dialog de coleta: busca os itens EXTERNAL dela pra oferecer seleção
   *  individual — sem eles, cai no formulário livre (ordem sem discriminação por item). */
  onCollectOrderChange(orderId: string | null): void {
    this.collectOrderItems.set([]);
    this.selectedItemIdsForCollect.set(new Set());
    if (!orderId) return;
    this.collectOrderItems.set(this.orders().find(o => o.id === orderId)?.items ?? []);
  }

  facilityName(facilityId: string | null): string {
    if (!facilityId) return '—';
    return this.facilities().find(f => f.id === facilityId)?.name ?? '—';
  }

  /** Trocável só em RECEIVED (CLAUDE.md: a partir de PROCESSING o item já está fisicamente
   *  dentro do fluxo daquela lavanderia — o backend recusa, o botão nem aparece). */
  canReassignFacility(item: LaundryItem): boolean {
    return item.status === 'RECEIVED';
  }

  reassignFacilityOptions(currentFacilityId: string) {
    return this.facilities()
      .filter(f => f.active || f.id === currentFacilityId)
      .map(f => ({ value: f.id, label: f.name }));
  }

  confirmReassignFacility(item: LaundryItem, newFacilityId: string): void {
    if (!newFacilityId || newFacilityId === item.laundryFacilityId) return;
    this.laundryService.reassignFacility(item.id, newFacilityId).subscribe({
      next: updated => {
        this.selectedItem.set(updated);
        this.load();
        this.messageService.add({ severity: 'success', summary: this.translate.instant('laundry.facilityReassigned') });
      },
      error: () => this.showError(),
    });
  }

  ngOnInit(): void {
    this.laundryService.collectableOrders().subscribe({ next: o => this.orders.set(o), error: () => {} });
    if (FACILITY_READ_ROLES.includes(this.auth.userRole() ?? '')) {
      this.laundryFacilityService.list({ size: 100 }).subscribe({ next: p => this.facilities.set(p.content), error: () => {} });
    }
    this.tenantService.getMe().subscribe({
      next: t => this.preferredFacilityId.set(t.systemParameters?.preferredLaundryFacilityId ?? null),
      error: () => {},
    });
    // A central de operação abre a lista já filtrada (?status=RELEASED, ?order=<id>).
    const params = this.router.parseUrl(this.router.url).queryParams;
    if (COLUMNS.includes(params['status'])) {
      this.statusFilter = params['status'];
    }
    if (params['order']) {
      this.orderFilter = params['order'];
    }
    this.wireFilters();
    this.load();
  }

  /** Mesmo idioma de {@code RoutingComponent#toastError}: mapeia `errorCode` do backend para
   *  `{errorPrefix}.{code}`, com um resumo genérico quando não há tradução específica. Em erro
   *  o dialog fica aberto e a seleção intacta — o utilizador tenta de novo sem preencher tudo outra vez. */
  private businessError(err: unknown, errorPrefix: string, fallbackKey: string): void {
    const code = (err as { error?: { errorCode?: string } })?.error?.errorCode;
    const key = code ? `${errorPrefix}.${code}` : '';
    const translated = key ? this.translate.instant(key) : '';
    this.messageService.add({
      severity: 'error',
      summary: translated && translated !== key ? translated : this.translate.instant(fallbackKey),
    });
  }

  /** Cliente/ordem/período disparam aqui; debounce+distinctUntilChanged evitam requests
   *  supérfluos, switchMap cancela a busca anterior (lista + quadro) quando uma nova é iniciada. */
  private wireFilters(): void {
    const sub = this.filterChange$.pipe(
      debounceTime(300),
      map(() => this.filterKey()),
      distinctUntilChanged(),
      tap(() => this.loading.set(true)),
      switchMap(() => this.fetchLaundry$().pipe(
        catchError(() => {
          this.showError();
          return of(null);
        }),
      )),
    ).subscribe(result => {
      this.loading.set(false);
      if (result) {
        this.items.set(result.items.content);
        this.counts.set(result.counts);
      }
    });
    this.destroyRef.onDestroy(() => sub.unsubscribe());
  }

  private filterKey(): string {
    const f = this.filters();
    return [f.status ?? '', f.laundryFacilityId ?? '', f.customerName ?? '', f.orderId ?? '', f.start ?? '', f.end ?? ''].join('|');
  }

  private fetchLaundry$(): Observable<{ items: LaundryItemPage; counts: Partial<Record<LaundryItemStatus, number>> }> {
    return forkJoin({
      items: this.laundryService.list({ ...this.filters(), size: 200 }),
      counts: this.laundryService.board(this.filters()),
    });
  }

  itemsByStatus(status: LaundryItemStatus): LaundryItem[] {
    return this.items().filter(i => i.status === status);
  }

  statusSeverity(status: LaundryItemStatus): BadgeSeverity {
    if (status === 'DELIVERED' || status === 'RELEASED') return 'success';
    if (status === 'PROCESSING' || status === 'READY') return 'warn';
    return 'secondary';
  }

  private filters() {
    return {
      status: this.statusFilter ?? undefined,
      laundryFacilityId: this.facilityFilter ?? undefined,
      customerName: this.customerFilter ?? undefined,
      orderId: this.orderFilter || undefined,
      start: this.periodRange?.[0] ? toIsoDate(this.periodRange[0]) : undefined,
      end: this.periodRange?.[1] ? toIsoDate(this.periodRange[1]) : (this.periodRange?.[0] ? toIsoDate(this.periodRange[0]) : undefined),
    };
  }

  /** Disparado a cada tecla/seleção — alimenta o pipeline reativo em {@link wireFilters}. */
  applyFilters(): void {
    this.filterChange$.next();
  }

  hasActiveFilters(): boolean {
    return this.statusFilter !== null || this.facilityFilter !== null
      || this.customerFilter !== null || !!this.orderFilter || !!this.periodRange;
  }

  clearFilters(): void {
    this.statusFilter = null;
    this.facilityFilter = null;
    this.customerFilter = null;
    this.orderFilter = null;
    this.periodRange = null;
    this.applyFilters();
  }

  load(): void {
    this.loading.set(true);
    this.fetchLaundry$().subscribe({
      next: result => {
        this.items.set(result.items.content);
        this.counts.set(result.counts);
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); this.showError(); },
    });
  }

  goToHistory(): void {
    this.router.navigate(['/laundry/history']);
  }

  goToPendingDelivery(): void {
    this.router.navigate(['/laundry/pending-delivery']);
  }

  openDetail(item: LaundryItem): void {
    this.selectedItem.set(item);
    this.showDetail = true;
  }

  openCollect(): void {
    this.collectForm.reset({ orderId: null, laundryFacilityId: this.preferredFacilityId(), description: '', notes: '' });
    this.collectOrderItems.set([]);
    this.selectedItemIdsForCollect.set(new Set());
    this.collectDialogOpen = true;
  }

  /**
   * Ordem com itens EXTERNAL discriminados: um {@code LaundryItem} por item selecionado, cada um
   * podendo ganhar destino próprio depois via {@link confirmReassignFacility} — o mesmo destino
   * escolhido aqui serve só de ponto de partida da leva. Sem itens discriminados, cai no
   * comportamento antigo: um único item livre para a ordem inteira.
   */
  confirmCollect(): void {
    const { orderId, laundryFacilityId, description, notes } = this.collectForm.getRawValue();
    if (!orderId || !laundryFacilityId) return;
    const externalItems = this.collectOrderExternalItems();
    const selectedIds = this.selectedItemIdsForCollect();
    const toCollect = externalItems.length
      ? externalItems.filter(i => selectedIds.has(i.id))
      : [null];
    if (!toCollect.length) return;

    this.collecting.set(true);
    forkJoin(toCollect.map(item =>
      this.laundryService.collect(orderId, laundryFacilityId, item?.description ?? (description || undefined),
        notes || undefined, item?.id)))
      .subscribe({
        next: () => {
          this.collecting.set(false);
          this.messageService.add({ severity: 'success', summary: this.translate.instant('laundry.collected') });
          this.collectDialogOpen = false;
          this.load();
        },
        error: () => { this.collecting.set(false); this.showError(); },
      });
  }

  uploadingPhoto = signal(false);

  onPhotosSelected(files: File[], item: LaundryItem): void {
    if (!files.length) return;
    this.uploadingPhoto.set(true);
    forkJoin(files.map(file => this.laundryService.addPhoto(item.id, file))).subscribe({
      next: () => {
        this.uploadingPhoto.set(false);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('laundry.photoAdded') });
        this.refreshSelected(item.id);
      },
      error: () => { this.uploadingPhoto.set(false); this.showError(); },
    });
  }

  confirmRemovePhoto(item: LaundryItem, photoId: string): void {
    this.confirmationService.confirm({
      message: this.translate.instant('laundry.removePhotoConfirm'),
      header: this.translate.instant('laundry.removePhotoTitle'),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.translate.instant('common.delete'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => this.removePhoto(item, photoId),
    });
  }

  private removePhoto(item: LaundryItem, photoId: string): void {
    this.laundryService.removePhoto(item.id, photoId).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: this.translate.instant('laundry.photoRemoved') });
        this.refreshSelected(item.id);
      },
      error: () => this.showError(),
    });
  }

  private refreshSelected(id: string): void {
    this.laundryService.get(id).subscribe({
      next: updated => { this.selectedItem.set(updated); this.load(); },
      error: () => {},
    });
  }

  // ── Corrigir estado (engano do operador) ──────────────────────────────────────────
  private static readonly STATUS_ORDER: LaundryItemStatus[] = ['RECEIVED', 'PROCESSING', 'READY', 'RELEASED', 'DELIVERED'];
  correctStatusOpen = false;
  correctingStatus = signal(false);
  correctTargetStatus = signal<LaundryItemStatus | null>(null);
  correctReason = signal('');
  /** Só estados estritamente anteriores ao atual — o backend recusa qualquer outro. */
  correctTargetOptions = computed(() => {
    const item = this.selectedItem();
    if (!item) return [];
    const idx = LaundryComponent.STATUS_ORDER.indexOf(item.status);
    return LaundryComponent.STATUS_ORDER.slice(0, idx)
      .map(s => ({ value: s, label: this.translate.instant('laundry.status.' + s) }));
  });

  openCorrectStatus(): void {
    this.correctTargetStatus.set(null);
    this.correctReason.set('');
    this.correctStatusOpen = true;
  }

  confirmCorrectStatus(): void {
    const item = this.selectedItem();
    const target = this.correctTargetStatus();
    const reason = this.correctReason().trim();
    if (!item || !target || !reason) return;

    this.correctingStatus.set(true);
    this.laundryService.correctStatus(item.id, target, reason).subscribe({
      next: updated => {
        this.correctingStatus.set(false);
        this.correctStatusOpen = false;
        this.selectedItem.set(updated);
        this.load();
        this.messageService.add({ severity: 'success', summary: this.translate.instant('laundry.correctStatus.corrected') });
      },
      error: err => {
        this.correctingStatus.set(false);
        this.businessError(err, 'laundry.errors', 'laundry.correctStatus.error');
      },
    });
  }

  action(type: 'startProcessing' | 'markReady' | 'release' | 'deliver'): void {
    const item = this.selectedItem();
    if (!item) return;
    const obs = type === 'startProcessing' ? this.laundryService.startProcessing(item.id)
      : type === 'markReady' ? this.laundryService.markReady(item.id)
      : type === 'release' ? this.laundryService.release(item.id)
      : this.laundryService.deliverByCode(item.code);
    obs.subscribe({
      next: updated => {
        this.messageService.add({ severity: 'success', summary: this.translate.instant('laundry.statusUpdated') });
        this.selectedItem.set(updated);
        this.load();
      },
      error: () => this.showError(),
    });
  }

  printLabel(item: LaundryItem): void {
    this.laundryService.label(item.id).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      },
      error: () => this.showError(),
    });
  }

  private showError(): void {
    this.messageService.add({ severity: 'error', summary: this.translate.instant('laundry.error') });
  }
}
