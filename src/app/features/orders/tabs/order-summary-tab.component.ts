import { ChangeDetectionStrategy, Component, DestroyRef, computed, OnChanges, SimpleChanges, inject, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Order, OrderService } from '../../../core/services/order.service';
import { CustomerService, Customer } from '../../../core/services/customer.service';
import { TenantDirectoryEntry } from '../../../core/services/tenant-user.service';
import { FinancialService, Invoice } from '../../../core/services/financial.service';
import { LocalizedDatePipe } from '../../../shared/pipes/localized-date.pipe';
import { DurationMinutesPipe } from '../../../shared/pipes/duration-minutes.pipe';
import { scheduleDurationMinutes } from '../../../shared/utils/schedule-window.util';
import { TagBadgeComponent } from '../../../shared/components/tag-badge/tag-badge.component';

/**
 * Resumo da OS: cliente, endereço, agendamento e totais — tudo read-only, sem duplicar a edição
 * (que vive na aba Agendamento & Prestador ou no financeiro/margem).
 */
@Component({
  selector: 'app-order-summary-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, ButtonModule, TextareaModule, TooltipModule, CurrencyPipe, LocalizedDatePipe, DurationMinutesPipe, TranslatePipe, TagBadgeComponent],
  template: `
    <div class="space-y-4 text-sm py-4">
      <div>
        <div class="text-[11px] font-medium text-app-text-secondary mb-1">{{ 'orders.customerHeader' | translate }}</div>
        @if (customer(); as c) {
          <div class="font-medium text-app-text">{{ c.name }}</div>
          @if (primaryPhone(c)) {
            <div class="text-xs text-app-text-secondary mt-0.5">{{ primaryPhone(c) }}</div>
          }
        } @else {
          <div class="text-app-text-tertiary">—</div>
        }
      </div>

      @if (approverLabel(); as approver) {
        <div>
          <div class="text-[11px] font-medium text-app-text-secondary mb-1">{{ 'orders.approvedByHeader' | translate }}</div>
          <div class="font-medium text-app-text">{{ approver }}</div>
        </div>
      }

      @if (order().quotationId; as quotationId) {
        <div>
          <div class="text-[11px] font-medium text-app-text-secondary mb-1">{{ 'orders.quotationHeader' | translate }}</div>
          @if (canViewQuotation()) {
            <button type="button" (click)="viewQuotation.emit(quotationId)" class="font-medium text-primary hover:underline cursor-pointer">
              {{ 'orders.viewQuotation' | translate }}
            </button>
          } @else {
            <div class="font-medium text-app-text">#{{ quotationId.slice(0, 8) }}</div>
          }
        </div>
      }

      <div>
        <div class="text-[11px] font-medium text-app-text-secondary mb-1">{{ 'orders.addressHeader' | translate }}</div>
        <div class="font-medium text-app-text">
          {{ order().address.street }}@if (order().address.city) {, {{ order().address.city }}}
        </div>
      </div>

      <div>
        <div class="text-[11px] font-medium text-app-text-secondary mb-1">{{ 'orders.scheduledHeader' | translate }}</div>
        <div class="font-medium text-app-text">
          @if (order().scheduledStartAt) {
            <div>{{ 'common.estimatedArrival' | translate }}: {{ order().scheduledStartAt | localizedDate:'datetime':tenantTimezone() }}</div>
            <div class="text-xs font-normal text-app-text-tertiary">{{ 'common.estimatedDuration' | translate: { duration: (scheduleDurationMinutes(order().scheduledStartAt!, order().scheduledEndAt!) | durationMinutes) } }}</div>
          } @else {
            <span class="text-app-text-tertiary">{{ 'orders.noSchedule' | translate }}</span>
          }
        </div>
      </div>

      <div>
        <div class="flex items-center gap-1 mb-1">
          <div class="text-[11px] font-medium text-app-text-secondary">{{ 'orders.notes.title' | translate }}</div>
          @if (notesEditable() && !editingNotes() && order().notes) {
            <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small"
                      [ariaLabel]="'common.edit' | translate" [pTooltip]="'common.edit' | translate"
                      (onClick)="startEditNotes()"></p-button>
          }
        </div>
        @if (editingNotes()) {
          <form [formGroup]="notesForm" (ngSubmit)="saveNotes()" class="space-y-2">
            <textarea pTextarea formControlName="notes" rows="3" maxlength="2000" class="w-full"
                      [placeholder]="'orders.notes.placeholder' | translate"></textarea>
            <div class="flex justify-end gap-2">
              <p-button type="button" [label]="'common.cancel' | translate" [text]="true" size="small"
                        [disabled]="savingNotes()" (onClick)="editingNotes.set(false)"></p-button>
              <p-button type="submit" [label]="'common.save' | translate" size="small" [loading]="savingNotes()"></p-button>
            </div>
          </form>
        } @else if (order().notes) {
          <div class="text-app-text whitespace-pre-line break-words">{{ order().notes }}</div>
        } @else if (notesEditable()) {
          <button type="button" (click)="startEditNotes()"
                  class="w-full flex items-center gap-2 rounded-md border border-dashed border-app-border-subtle px-3 py-2 text-left text-app-text-secondary hover:border-primary hover:text-primary cursor-pointer">
            <i class="pi pi-plus text-xs"></i>
            <span>{{ 'orders.notes.addPrompt' | translate }}</span>
          </button>
        } @else {
          <div class="text-app-text-tertiary">{{ 'orders.notes.empty' | translate }}</div>
        }
      </div>

      @if (order().technicianNote) {
        <div>
          <div class="text-[11px] font-medium text-app-text-secondary mb-1">{{ 'orders.notes.technicianTitle' | translate }}</div>
          <div class="text-app-text whitespace-pre-line break-words">{{ order().technicianNote }}</div>
        </div>
      }

      <div class="pt-3 border-t border-app-border-subtle flex justify-between items-center">
        <span class="text-app-text-secondary">{{ 'orders.itemsHeader' | translate }} ({{ order().items.length }})</span>
        <span class="font-semibold text-app-text text-base">{{ subtotal() | currency:order().currencyCode:'symbol':'1.2-2' }}</span>
      </div>

      <div class="pt-3 border-t border-app-border-subtle">
        <div class="text-[11px] font-medium text-app-text-secondary mb-1.5">{{ 'orders.billing.title' | translate }}</div>
        @if (billingLoading()) {
          <div class="text-app-text-tertiary text-xs">{{ 'common.loading' | translate }}</div>
        } @else if (invoice(); as inv) {
          <div class="flex items-center gap-2">
            <app-tag-badge [value]="'orders.billing.invoiced' | translate: { number: inv.invoiceNumber }" severity="success"></app-tag-badge>
            <span class="text-app-text-secondary text-xs">{{ inv.total.amount | currency:inv.total.currency }}</span>
          </div>
        } @else if (pendingSiblings().length > 0) {
          <div class="text-app-text text-xs mb-2">
            {{ 'orders.billing.waitingSiblings' | translate: { count: pendingSiblings().length } }}
          </div>
          <ul class="space-y-1">
            @for (sibling of pendingSiblings(); track sibling.id) {
              <li class="flex items-center justify-between text-xs">
                <span class="text-app-text-secondary">{{ 'orders.numberHeader' | translate }} #{{ sibling.orderNumber }}</span>
                <app-tag-badge [value]="('orders.status.' + sibling.status) | translate" severity="secondary"></app-tag-badge>
              </li>
            }
          </ul>
        } @else {
          <div class="text-app-text-tertiary text-xs">{{ 'orders.billing.waitingOwn' | translate }}</div>
        }
      </div>
    </div>
  `,
})
export class OrderSummaryTabComponent implements OnChanges {
  readonly scheduleDurationMinutes = scheduleDurationMinutes;
  order = input.required<Order>();
  technicians = input<TenantDirectoryEntry[]>([]);
  tenantTimezone = input<string | null>(null);
  /** Só quem tem acesso à rota /quotations/:id vê o link — técnico/lavandaria veem só o número. */
  canViewQuotation = input(false);
  /** Deixa o pai navegar (em vez de routerLink direto) para poder marcar a ordem no histórico
   *  antes de sair — assim o "voltar" do navegador reabre esta ordem em vez de cair na lista. */
  viewQuotation = output<string>();
  /** Só quem despacha edita a observação (mesmo critério do backend). */
  canWrite = input(false);
  /** Ordem encerrada já não recebe observação (backend: ORDER_NOTES_LOCKED). */
  notesEditable = computed(() => this.canWrite() && this.order().status !== 'FINISHED' && this.order().status !== 'CANCELLED');
  orderUpdated = output<Order>();

  private customerService = inject(CustomerService);
  private orderService = inject(OrderService);
  private financialService = inject(FinancialService);
  private translate = inject(TranslateService);
  private destroyRef = inject(DestroyRef);
  private messageService = inject(MessageService);

  editingNotes = signal(false);
  savingNotes = signal(false);
  readonly notesForm = new FormGroup({
    notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(2000)] }),
  });

  startEditNotes(): void {
    this.notesForm.reset({ notes: this.order().notes ?? '' });
    this.editingNotes.set(true);
  }

  saveNotes(): void {
    if (this.notesForm.invalid || this.savingNotes()) return;
    this.savingNotes.set(true);
    const sub = this.orderService.updateNotes(this.order().id, this.notesForm.getRawValue().notes.trim() || null).subscribe({
      next: updated => {
        this.savingNotes.set(false);
        this.editingNotes.set(false);
        this.orderUpdated.emit(updated);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('orders.notes.saved') });
      },
      error: (err: { status?: number; error?: { errorCode?: string } }) => {
        this.savingNotes.set(false);
        const key = `orders.errors.${err.error?.errorCode}`;
        const known = err.status === 422 && err.error?.errorCode ? this.translate.instant(key) : key;
        this.messageService.add({ severity: 'error',
          summary: known !== key ? known : this.translate.instant('orders.notes.saveError') });
      },
    });
    this.destroyRef.onDestroy(() => sub.unsubscribe());
  }

  customer = signal<Customer | null>(null);

  billingLoading = signal(false);
  invoice = signal<Invoice | null>(null);
  /** Ordens irmãs (mesmo orçamento) ainda não finalizadas nem canceladas — o que falta para o
   *  faturamento automático liberar (CLAUDE.md §1, geração automática de fatura por orçamento). */
  pendingSiblings = signal<Order[]>([]);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['order']) {
      if (changes['order'].previousValue?.id !== this.order().id) this.editingNotes.set(false);
      this.customer.set(null);
      const sub = this.customerService.get(this.order().customerId).subscribe({
        next: c => this.customer.set(c),
        error: () => {},
      });
      this.destroyRef.onDestroy(() => sub.unsubscribe());
      this.loadBillingStatus();
    }
  }

  private loadBillingStatus(): void {
    const order = this.order();
    this.invoice.set(null);
    this.pendingSiblings.set([]);
    this.billingLoading.set(true);
    const sub = this.financialService.getInvoiceForOrder(order.id).subscribe({
      next: inv => {
        this.invoice.set(inv);
        if (inv || !order.quotationId) {
          this.billingLoading.set(false);
          return;
        }
        const siblingsSub = this.orderService.siblingsByQuotation(order.quotationId).subscribe({
          next: page => {
            this.pendingSiblings.set(page.content.filter(
              o => o.id !== order.id && o.status !== 'FINISHED' && o.status !== 'CANCELLED'));
            this.billingLoading.set(false);
          },
          error: () => this.billingLoading.set(false),
        });
        this.destroyRef.onDestroy(() => siblingsSub.unsubscribe());
      },
      error: () => this.billingLoading.set(false),
    });
    this.destroyRef.onDestroy(() => sub.unsubscribe());
  }

  subtotal(): number {
    return this.order().items.reduce((acc, i) => acc + i.lineTotal, 0);
  }

  primaryPhone(c: Customer): string | null {
    return c.contacts.find(ct => ct.primary)?.phone ?? c.contacts[0]?.phone ?? null;
  }

  /** Quem aprovou o orçamento de origem — `null` quando a ordem não nasceu de um orçamento. */
  approverLabel(): string | null {
    const o = this.order();
    if (!o.quotationId) return null;
    if (!o.approvedBy) return this.translate.instant('orders.approvedByCustomer');
    const user = this.technicians().find(u => u.id === o.approvedBy);
    return user ? user.name : '#' + o.approvedBy.slice(0, 8);
  }
}
