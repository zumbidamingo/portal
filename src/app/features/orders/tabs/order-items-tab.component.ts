import { ChangeDetectionStrategy, Component, EventEmitter, Output, DestroyRef, OnChanges, SimpleChanges, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { HttpErrorResponse } from '@angular/common/http';
import { Order, OrderService, ExecutionMode } from '../../../core/services/order.service';
import { ServiceService, CatalogService, PriceType } from '../../../core/services/catalog.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { priceTypeQuantityConfig, priceTypeUnitLabelKey } from '../../../shared/utils/price-type.utils';

/**
 * CRUD de itens só enquanto a ordem está CREATED (financeiro trancado depois de agendada,
 * CLAUDE.md §10) — preço vem do catálogo, nunca digitado à mão, mesmo desenho do orçamento.
 */
@Component({
  selector: 'app-order-items-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, CurrencyPipe, TranslatePipe, ButtonModule, SelectModule,
    InputNumberModule, ConfirmDialogModule, EmptyStateComponent],
  providers: [ConfirmationService],
  template: `
    <p-confirmDialog [style]="{ width: '24rem' }"></p-confirmDialog>
    <div class="space-y-4 py-4">
      @if (!editable()) {
        <p class="text-xs text-app-text-tertiary bg-app-surface-hover rounded-md p-2">
          <i class="pi pi-lock mr-1"></i>{{ 'orders.itemsLockedNote' | translate }}
        </p>
      }

      <p class="text-xs text-app-text-secondary flex items-center gap-1.5">
        {{ 'orders.orderExecutionMode' | translate }}
        <span class="px-1.5 py-0.5 rounded bg-app-surface-hover font-medium">{{ ('orders.executionMode.' + order().executionMode) | translate }}</span>
      </p>

      @if (order().items.length === 0) {
        <app-empty-state icon="pi pi-box" [message]="'orders.emptyItems' | translate"></app-empty-state>
      } @else {
        <div class="space-y-2">
          @for (item of order().items; track item.id) {
            <div class="border border-app-border rounded-md p-3">
              @if (editingId() === item.id) {
                <div class="space-y-2" [formGroup]="editForm">
                  <div class="text-sm font-medium text-app-text">{{ item.description }}</div>
                  <div class="flex gap-2">
                    <p-inputnumber formControlName="quantity" class="flex-1 min-w-0 w-full"
                                   [minFractionDigits]="quantityConfig(item.priceType).decimals" [maxFractionDigits]="quantityConfig(item.priceType).decimals"
                                   [min]="quantityConfig(item.priceType).min" [step]="quantityConfig(item.priceType).step"
                                   [suffix]="unitLabel(item.priceType) ? ' ' + unitLabel(item.priceType) : ''"></p-inputnumber>
                    <p-inputnumber formControlName="unitPriceAmount" class="flex-1 min-w-0 w-full"
                                   mode="currency" [currency]="order().currencyCode" [min]="0"></p-inputnumber>
                  </div>
                  <p class="text-[11px] text-app-text-tertiary">
                    <i class="pi pi-lock mr-1"></i>{{ 'orders.executionModeFixedByOrderNote' | translate }}
                  </p>
                  <div class="flex justify-end gap-2">
                    <p-button [label]="'common.cancel' | translate" [text]="true" size="small" (onClick)="cancelEdit()"></p-button>
                    <p-button [label]="'common.save' | translate" size="small" [loading]="saving()" (onClick)="saveEdit(item.id)"></p-button>
                  </div>
                </div>
              } @else {
                <div class="flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <div class="text-sm font-medium text-app-text truncate">{{ item.description }}</div>
                    <div class="text-xs text-app-text-secondary flex items-center gap-2 mt-0.5">
                      <span>{{ quantityDisplay(item) }} × {{ item.unitPriceAmount | currency:item.unitPriceCurrency:'symbol':'1.2-2' }}</span>
                      <span class="px-1.5 py-0.5 rounded bg-app-surface-hover">{{ ('orders.executionMode.' + item.executionMode) | translate }}</span>
                    </div>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    <span class="font-semibold text-app-text">{{ item.lineTotal | currency:item.unitPriceCurrency:'symbol':'1.2-2' }}</span>
                    @if (editable()) {
                      <p-button icon="pi pi-pencil" [text]="true" size="small" severity="secondary" (onClick)="startEdit(item)"></p-button>
                      <p-button icon="pi pi-trash" [text]="true" size="small" severity="danger" (onClick)="confirmRemove(item.id)"></p-button>
                    }
                  </div>
                </div>
              }
            </div>
          }
        </div>
      }

      @if (editable()) {
        <div class="border-t border-app-border-subtle pt-3">
          <div class="text-[11px] font-medium text-app-text-secondary mb-2">{{ 'orders.addItemHeader' | translate }}</div>
          <div class="flex flex-col sm:flex-row gap-2" [formGroup]="addForm">
            <p-select [options]="services()" formControlName="serviceId" optionLabel="name" optionValue="id"
                      appendTo="body" [filter]="true" [placeholder]="'orders.selectService' | translate" class="flex-1 min-w-0"></p-select>
            <p-inputnumber formControlName="quantity" class="shrink-0" inputStyleClass="w-full sm:w-28"
                           [minFractionDigits]="addQuantityConfig().decimals" [maxFractionDigits]="addQuantityConfig().decimals"
                           [min]="addQuantityConfig().min" [step]="addQuantityConfig().step"
                           [suffix]="addUnitLabel() ? ' ' + addUnitLabel() : ''"
                           [placeholder]="'orders.quantityPlaceholder' | translate"></p-inputnumber>
          </div>
          <div class="flex justify-end mt-2">
            <p-button [label]="'orders.addItemAction' | translate" icon="pi pi-plus" size="small"
                      [disabled]="!addForm.controls.serviceId.value || !addForm.controls.quantity.value"
                      [loading]="adding()" (onClick)="addItem()"></p-button>
          </div>
        </div>
      }
    </div>
  `,
})
export class OrderItemsTabComponent implements OnChanges {
  order = input.required<Order>();
  canWrite = input(false);
  @Output() orderUpdated = new EventEmitter<Order>();

  private orderService = inject(OrderService);
  private serviceService = inject(ServiceService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);
  private translate = inject(TranslateService);
  private destroyRef = inject(DestroyRef);

  services = signal<CatalogService[]>([]);
  editingId = signal<string | null>(null);
  saving = signal(false);
  adding = signal(false);

  readonly editForm = new FormGroup({
    quantity: new FormControl<number>(1, { nonNullable: true }),
    unitPriceAmount: new FormControl<number>(0, { nonNullable: true }),
    executionMode: new FormControl<ExecutionMode>('ONSITE', { nonNullable: true }),
  });

  readonly addForm = new FormGroup({
    serviceId: new FormControl<string | null>(null),
    quantity: new FormControl<number | null>(1),
  });

  private addServiceId = toSignal(this.addForm.controls.serviceId.valueChanges, { initialValue: null });
  private addService = computed(() => this.services().find(s => s.id === this.addServiceId()));
  addQuantityConfig = computed(() => priceTypeQuantityConfig(this.addService()?.priceType ?? 'FIXED'));
  addUnitLabel = computed(() => this.unitLabel(this.addService()?.priceType ?? 'FIXED'));

  editable(): boolean {
    return this.canWrite() && this.order().status === 'CREATED';
  }

  unitLabel(priceType: PriceType): string {
    const key = priceTypeUnitLabelKey(priceType);
    return key ? this.translate.instant(key) : '';
  }

  quantityConfig(priceType: PriceType) {
    return priceTypeQuantityConfig(priceType);
  }

  quantityDisplay(item: Order['items'][number]): string {
    const unit = this.unitLabel(item.priceType);
    return unit ? `${item.quantity} ${unit}` : `${item.quantity}`;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['order'] && this.editable() && this.services().length === 0) {
      const mode = this.order().executionMode;
      const sub = this.serviceService.list({ active: true, size: 200 }).subscribe({
        next: page => this.services.set(page.content.filter(s => s.executionMode === mode)),
        error: () => {},
      });
      this.destroyRef.onDestroy(() => sub.unsubscribe());
    }
  }

  startEdit(item: Order['items'][number]): void {
    this.editingId.set(item.id);
    this.editForm.reset({
      quantity: item.quantity,
      unitPriceAmount: item.unitPriceAmount,
      executionMode: item.executionMode,
    });
  }

  cancelEdit(): void {
    this.editingId.set(null);
  }

  saveEdit(itemId: string): void {
    const { quantity, unitPriceAmount, executionMode } = this.editForm.getRawValue();
    const item = this.order().items.find(i => i.id === itemId);
    if (!item || quantity == null || unitPriceAmount == null) return;
    this.saving.set(true);
    this.orderService.updateItem(this.order().id, itemId, {
      quantity, unitPriceAmount, unitPriceCurrency: item.unitPriceCurrency, executionMode,
    }).subscribe({
      next: updated => {
        this.saving.set(false);
        this.editingId.set(null);
        this.orderUpdated.emit(updated);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('orders.itemSaved') });
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.messageService.add({ severity: 'error', summary: this.businessError(err) });
      },
    });
  }

  confirmRemove(itemId: string): void {
    this.confirmationService.confirm({
      message: this.translate.instant('orders.removeItemConfirm'),
      header: this.translate.instant('orders.removeItemConfirmTitle'),
      icon: 'pi pi-exclamation-triangle',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => this.removeItem(itemId),
    });
  }

  private removeItem(itemId: string): void {
    this.orderService.removeItem(this.order().id, itemId).subscribe({
      next: updated => {
        this.orderUpdated.emit(updated);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('orders.itemRemoved') });
      },
      error: (err: HttpErrorResponse) => this.messageService.add({ severity: 'error', summary: this.businessError(err) }),
    });
  }

  addItem(): void {
    const { serviceId, quantity } = this.addForm.getRawValue();
    if (!serviceId || !quantity) return;
    this.adding.set(true);
    this.orderService.addItem(this.order().id, serviceId, quantity).subscribe({
      next: updated => {
        this.adding.set(false);
        this.addForm.reset({ serviceId: null, quantity: 1 });
        this.orderUpdated.emit(updated);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('orders.itemAdded') });
      },
      error: (err: HttpErrorResponse) => {
        this.adding.set(false);
        this.messageService.add({ severity: 'error', summary: this.businessError(err) });
      },
    });
  }

  private businessError(err: HttpErrorResponse): string {
    const code = (err.error as { errorCode?: string } | null)?.errorCode;
    if (err.status === 422 && code) {
      const key = `orders.errors.${code}`;
      const translated = this.translate.instant(key);
      if (translated !== key) return translated;
    }
    return this.translate.instant('orders.transitionError');
  }
}
