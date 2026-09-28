import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { DrawerModule } from 'primeng/drawer';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageService } from 'primeng/api';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import { CatalogService, ServiceService } from '../../../core/services/catalog.service';
import {
  ReactivationInteractionChannel, ReactivationInteractionOutcome, ReactivationOpportunity,
  ReactivationOpportunityStatus, RetentionService,
} from '../../../core/services/retention.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { TagBadgeComponent } from '../../../shared/components/tag-badge/tag-badge.component';
import type { BadgeSeverity } from '../../../shared/utils/status.utils';

interface Column {
  status: ReactivationOpportunityStatus;
  severity: BadgeSeverity;
  terminal: boolean;
}

const COLUMNS: Column[] = [
  { status: 'DETECTED', severity: 'info', terminal: false },
  { status: 'CONTACTED', severity: 'warn', terminal: false },
  { status: 'RESPONDED', severity: 'primary', terminal: false },
  { status: 'SNOOZED', severity: 'secondary', terminal: false },
  { status: 'SCHEDULED', severity: 'success', terminal: true },
  { status: 'DECLINED', severity: 'danger', terminal: true },
  { status: 'IGNORED', severity: 'secondary', terminal: true },
];

const OPEN: ReactivationOpportunityStatus[] = ['DETECTED', 'CONTACTED', 'RESPONDED', 'SNOOZED'];
/** SNOOZED volta sozinho a DETECTED quando a data passa; até lá o domínio não aceita interação nem novo adiamento. */
const ACTIONABLE: ReactivationOpportunityStatus[] = ['DETECTED', 'CONTACTED', 'RESPONDED'];
const DROP_OUTCOME: Partial<Record<ReactivationOpportunityStatus, ReactivationInteractionOutcome>> = {
  CONTACTED: 'CONTACTED', RESPONDED: 'RESPONDED', DECLINED: 'DECLINED',
};
const CHANNELS: ReactivationInteractionChannel[] = ['WHATSAPP', 'PHONE', 'EMAIL', 'IN_PERSON'];
/** SCHEDULED nasce da aprovação do orçamento e REQUESTED_LATER_CONTACT do adiamento — nunca à mão. */
const OUTCOMES: ReactivationInteractionOutcome[] = ['CONTACTED', 'NO_ANSWER', 'RESPONDED', 'DECLINED'];
const WRITE_ROLES = ['OWNER', 'ADMIN', 'COMMERCIAL'];
const PAGE_SIZE = 50;
const DAY_MS = 86_400_000;

/**
 * Funil de reativação (#275): oportunidades de recompra detetadas pelo job diário, por estado.
 * Arrastar um cartão para outra coluna abre o registo da interação correspondente — o estado só muda
 * pela API (regras de transição vivem no domínio), nunca localmente.
 */
@Component({
  selector: 'app-reactivation-funnel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe, DatePipe, ButtonModule, DialogModule, DrawerModule,
    DatePickerModule, InputNumberModule, SelectModule, TextareaModule, TooltipModule, ToastModule,
    ProgressSpinnerModule, TagBadgeComponent, PageHeaderComponent, EmptyStateComponent],
  providers: [MessageService],
  template: `
    <p-toast position="top-right"></p-toast>

    <app-page-header [title]="'retention.funnel.title' | translate" [description]="'retention.funnel.subtitle' | translate"></app-page-header>

    @if (isEmpty()) {
      <app-empty-state icon="pi pi-replay" [message]="'retention.funnel.emptyTitle' | translate"
                        [subtitle]="'retention.funnel.emptySubtitle' | translate"></app-empty-state>
    } @else {
      <div class="relative flex gap-3 overflow-x-auto pb-2">
        @if (loading()) {
          <div class="absolute inset-0 z-10 flex items-center justify-center bg-app-bg/60 rounded-md">
            <p-progressSpinner styleClass="w-10 h-10" strokeWidth="4" />
          </div>
        }
        @for (col of columns; track col.status) {
          <div class="rounded-md border p-2 min-h-[400px] w-72 shrink-0 transition-colors duration-150 ease-out"
               [class.bg-app-surface]="dragOver() !== col.status"
               [class.border-app-border]="dragOver() !== col.status"
               [class.bg-app-accent-soft]="dragOver() === col.status"
               [class.border-app-accent]="dragOver() === col.status"
               (dragover)="onColumnDragOver($event, col)"
               (dragleave)="dragOver.set(null)"
               (drop)="onDrop($event, col)">
            <div class="flex items-center justify-between mb-2 px-1">
              <span class="text-sm font-medium text-app-text">{{ 'retention.funnel.status.' + col.status | translate }} ({{ totals()[col.status] ?? 0 }})</span>
              <app-tag-badge [value]="'retention.funnel.status.' + col.status | translate" [severity]="col.severity"></app-tag-badge>
            </div>
            @for (opp of byStatus(col.status); track opp.id) {
              <div class="bg-app-bg border border-app-border rounded-xl p-3.5 mb-2 transition-opacity duration-150 ease-out"
                   [class.cursor-move]="canDrag(opp)" [class.opacity-40]="draggingId() === opp.id"
                   [draggable]="canDrag(opp)" (dragstart)="beginDrag($event, opp)" (dragend)="endDrag()">
                <p class="text-sm font-medium text-app-text truncate">{{ opp.customerName ?? '—' }}</p>
                <p class="text-xs text-app-text-secondary truncate mt-0.5">{{ opp.serviceName ?? opp.categoryName ?? '—' }}</p>
                <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-app-text-tertiary">
                  <span class="inline-flex items-center gap-1">
                    <i class="pi pi-calendar text-[10px]" aria-hidden="true"></i>
                    {{ opp.dueAt | date:'mediumDate' }}
                  </span>
                  @if (opp.lastFinishedAt) {
                    <span class="inline-flex items-center gap-1">
                      <i class="pi pi-history text-[10px]" aria-hidden="true"></i>
                      {{ 'retention.funnel.lastService' | translate: { date: (opp.lastFinishedAt | date:'mediumDate') } }}
                    </span>
                  }
                </div>
                <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
                  @if (isOpen(opp) && daysOverdue(opp) > 0) {
                    <app-tag-badge [value]="'retention.funnel.overdueDays' | translate: { count: daysOverdue(opp) }" severity="danger"></app-tag-badge>
                  }
                  @if (opp.contactAttempts > 0) {
                    <app-tag-badge [value]="'retention.funnel.attempts' | translate: { count: opp.contactAttempts }" severity="secondary"></app-tag-badge>
                  }
                  @if (opp.status === 'SNOOZED' && opp.snoozeUntil) {
                    <app-tag-badge [value]="'retention.funnel.snoozedUntil' | translate: { date: (opp.snoozeUntil | date:'shortDate') }" severity="secondary"></app-tag-badge>
                  }
                </div>
                <div class="mt-2 pt-1.5 border-t border-app-border flex items-center justify-end gap-0.5">
                  @if (canWrite() && isActionable(opp)) {
                    <p-button icon="pi pi-comments" [text]="true" size="small" severity="secondary"
                              [pTooltip]="'retention.funnel.registerContact' | translate" tooltipPosition="top"
                              [attr.aria-label]="'retention.funnel.registerContact' | translate"
                              (onClick)="openInteraction(opp)"></p-button>
                    <p-button icon="pi pi-clock" [text]="true" size="small" severity="secondary"
                              [pTooltip]="'retention.funnel.snooze' | translate" tooltipPosition="top"
                              [attr.aria-label]="'retention.funnel.snooze' | translate"
                              (onClick)="openSnooze(opp)"></p-button>
                    <p-button icon="pi pi-file-edit" [text]="true" size="small" severity="secondary"
                              [pTooltip]="'retention.funnel.generateQuotation' | translate" tooltipPosition="top"
                              [attr.aria-label]="'retention.funnel.generateQuotation' | translate"
                              (onClick)="openQuotation(opp)"></p-button>
                  }
                  @if (opp.resultingQuotationId) {
                    <p-button icon="pi pi-external-link" [text]="true" size="small" severity="secondary"
                              [pTooltip]="'retention.funnel.openQuotation' | translate" tooltipPosition="top"
                              [attr.aria-label]="'retention.funnel.openQuotation' | translate"
                              (onClick)="goToQuotation(opp.resultingQuotationId)"></p-button>
                  }
                  <p-button icon="pi pi-info-circle" [text]="true" size="small" severity="secondary"
                            [pTooltip]="'retention.funnel.details' | translate" tooltipPosition="top"
                            [attr.aria-label]="'retention.funnel.details' | translate"
                            (onClick)="openDetail(opp)"></p-button>
                </div>
              </div>
            }
            @if (byStatus(col.status).length === 0) {
              <p class="text-xs text-app-text-tertiary text-center py-4">{{ 'retention.funnel.columnEmpty' | translate }}</p>
            }
            @if ((totals()[col.status] ?? 0) > byStatus(col.status).length) {
              <p class="text-[11px] text-app-text-tertiary text-center">
                {{ 'retention.funnel.showingFirst' | translate: { shown: byStatus(col.status).length, total: totals()[col.status] } }}
              </p>
            }
          </div>
        }
      </div>
    }

    <!-- Registar interação -->
    <p-dialog [(visible)]="interactionVisible" [modal]="true" [style]="{ width: '28rem', maxWidth: '95vw' }"
              [header]="'retention.funnel.registerContact' | translate">
      <form class="space-y-4" [formGroup]="interactionForm" (ngSubmit)="saveInteraction()">
        <p class="text-xs text-app-text-secondary">{{ target()?.customerName }} — {{ target()?.serviceName ?? target()?.categoryName }}</p>
        <div>
          <label class="label">{{ 'retention.funnel.channel' | translate }} *</label>
          <p-select [options]="channelOptions()" optionLabel="label" optionValue="value" formControlName="channel"
                    appendTo="body" fluid></p-select>
        </div>
        <div>
          <label class="label">{{ 'retention.funnel.outcome' | translate }} *</label>
          <p-select [options]="outcomeOptions()" optionLabel="label" optionValue="value" formControlName="outcome"
                    appendTo="body" fluid></p-select>
        </div>
        <div>
          <label class="label">{{ 'retention.funnel.note' | translate }}</label>
          <textarea pTextarea formControlName="note" rows="3" fluid></textarea>
        </div>
        <div class="flex justify-end gap-2 pt-1">
          <p-button type="button" [label]="'common.cancel' | translate" [outlined]="true" (onClick)="interactionVisible.set(false)"></p-button>
          <p-button type="submit" [label]="'common.save' | translate" icon="pi pi-check" [loading]="saving()"
                    [disabled]="interactionForm.invalid"></p-button>
        </div>
      </form>
    </p-dialog>

    <!-- Adiar -->
    <p-dialog [(visible)]="snoozeVisible" [modal]="true" [style]="{ width: '26rem', maxWidth: '95vw' }"
              [header]="'retention.funnel.snooze' | translate">
      <form class="space-y-4" [formGroup]="snoozeForm" (ngSubmit)="saveSnooze()">
        <p class="text-xs text-app-text-secondary">{{ target()?.customerName }} — {{ target()?.serviceName ?? target()?.categoryName }}</p>
        <div>
          <label class="label">{{ 'retention.funnel.channel' | translate }} *</label>
          <p-select [options]="channelOptions()" optionLabel="label" optionValue="value" formControlName="channel"
                    appendTo="body" fluid></p-select>
        </div>
        <div>
          <label class="label">{{ 'retention.funnel.snoozeUntil' | translate }} *</label>
          <p-datepicker formControlName="until" [minDate]="tomorrow" dateFormat="dd/mm/yy" appendTo="body" fluid></p-datepicker>
        </div>
        <div>
          <label class="label">{{ 'retention.funnel.note' | translate }}</label>
          <textarea pTextarea formControlName="note" rows="2" fluid></textarea>
        </div>
        <div class="flex justify-end gap-2 pt-1">
          <p-button type="button" [label]="'common.cancel' | translate" [outlined]="true" (onClick)="snoozeVisible.set(false)"></p-button>
          <p-button type="submit" [label]="'common.save' | translate" icon="pi pi-check" [loading]="saving()"
                    [disabled]="snoozeForm.invalid"></p-button>
        </div>
      </form>
    </p-dialog>

    <!-- Gerar orçamento -->
    <p-dialog [(visible)]="quotationVisible" [modal]="true" [style]="{ width: '30rem', maxWidth: '95vw' }"
              [header]="'retention.funnel.generateQuotation' | translate">
      <form class="space-y-4" [formGroup]="quotationForm" (ngSubmit)="saveQuotation()">
        <p class="text-xs text-app-text-secondary">{{ target()?.customerName }} — {{ target()?.serviceName ?? target()?.categoryName }}</p>
        @if (target() && !target()!.serviceId) {
          <div>
            <label class="label">{{ 'retention.funnel.quotationService' | translate }} *</label>
            <p-select [options]="categoryServiceOptions()" optionLabel="label" optionValue="value" formControlName="serviceId"
                      [filter]="true" appendTo="body" fluid></p-select>
          </div>
        }
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="label">{{ 'retention.funnel.quantity' | translate }}</label>
            <p-inputnumber formControlName="quantity" [min]="0.01" [minFractionDigits]="0" [maxFractionDigits]="2" fluid></p-inputnumber>
          </div>
          <div>
            <label class="label">{{ 'retention.funnel.validUntil' | translate }} *</label>
            <p-datepicker formControlName="validUntil" [minDate]="tomorrow" dateFormat="dd/mm/yy" appendTo="body" fluid></p-datepicker>
          </div>
        </div>
        <div>
          <label class="label">{{ 'retention.funnel.terms' | translate }}</label>
          <textarea pTextarea formControlName="terms" rows="2" fluid></textarea>
        </div>
        <div>
          <label class="label">{{ 'retention.funnel.paymentTerms' | translate }}</label>
          <textarea pTextarea formControlName="paymentTerms" rows="2" fluid></textarea>
        </div>
        <p class="text-[11px] text-app-text-tertiary">{{ 'retention.funnel.quotationHint' | translate }}</p>
        <div class="flex justify-end gap-2 pt-1">
          <p-button type="button" [label]="'common.cancel' | translate" [outlined]="true" (onClick)="quotationVisible.set(false)"></p-button>
          <p-button type="submit" [label]="'retention.funnel.generateQuotation' | translate" icon="pi pi-check" [loading]="saving()"
                    [disabled]="quotationForm.invalid"></p-button>
        </div>
      </form>
    </p-dialog>

    <!-- Detalhe com trilha de interações -->
    <p-drawer [(visible)]="detailVisible" position="right" [style]="{ width: '26rem', maxWidth: '95vw' }"
              [header]="'retention.funnel.details' | translate">
      @if (detail(); as d) {
        <div class="space-y-3">
          <div>
            <p class="text-sm font-medium text-app-text">{{ d.customerName ?? '—' }}</p>
            <p class="text-xs text-app-text-secondary">{{ d.serviceName ?? d.categoryName ?? '—' }}</p>
          </div>
          <div class="flex flex-wrap gap-1.5">
            <app-tag-badge [value]="'retention.funnel.status.' + d.status | translate" [severity]="severityOf(d.status)"></app-tag-badge>
            <app-tag-badge [value]="'retention.funnel.attempts' | translate: { count: d.contactAttempts }" severity="secondary"></app-tag-badge>
          </div>
          <dl class="text-xs text-app-text-secondary space-y-1">
            <div class="flex justify-between"><dt>{{ 'retention.funnel.dueAt' | translate }}</dt><dd>{{ d.dueAt | date:'mediumDate' }}</dd></div>
            @if (d.lastFinishedAt) {
              <div class="flex justify-between"><dt>{{ 'retention.funnel.lastServiceLabel' | translate }}</dt><dd>{{ d.lastFinishedAt | date:'mediumDate' }}</dd></div>
            }
            @if (d.lastContactAt) {
              <div class="flex justify-between"><dt>{{ 'retention.funnel.lastContact' | translate }}</dt><dd>{{ d.lastContactAt | date:'medium' }}</dd></div>
            }
          </dl>
          <h4 class="text-[11px] font-semibold uppercase tracking-wide text-app-text-tertiary pt-2 border-t border-app-border">
            {{ 'retention.funnel.trail' | translate }}
          </h4>
          @if (loadingDetail()) {
            <p class="text-sm text-app-text-tertiary">{{ 'common.loading' | translate }}</p>
          } @else if (d.interactions.length === 0) {
            <p class="text-sm text-app-text-tertiary">{{ 'retention.funnel.trailEmpty' | translate }}</p>
          } @else {
            <ul class="space-y-2">
              @for (i of d.interactions; track i.id) {
                <li class="rounded-md border border-app-border px-3 py-2 text-sm">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-app-text">{{ 'retention.funnel.outcomes.' + i.outcome | translate }}</span>
                    <span class="text-[11px] text-app-text-tertiary">{{ i.createdAt | date:'short' }}</span>
                  </div>
                  <div class="text-xs text-app-text-secondary">
                    {{ 'retention.funnel.channels.' + i.channel | translate }}@if (i.performedByName) { · {{ i.performedByName }} }
                  </div>
                  @if (i.note) { <p class="text-xs text-app-text mt-1 whitespace-pre-line">{{ i.note }}</p> }
                </li>
              }
            </ul>
          }
        </div>
      }
    </p-drawer>
  `,
})
export class ReactivationFunnelComponent implements OnInit {
  private retentionService = inject(RetentionService);
  private serviceService = inject(ServiceService);
  private authService = inject(AuthService);
  private translate = inject(TranslateService);
  private messageService = inject(MessageService);
  private router = inject(Router);
  private notificationService = inject(NotificationService);
  private destroyRef = inject(DestroyRef);

  readonly columns = COLUMNS;
  readonly tomorrow = new Date(Date.now() + DAY_MS);

  private rows = signal<Partial<Record<ReactivationOpportunityStatus, ReactivationOpportunity[]>>>({});
  totals = signal<Partial<Record<ReactivationOpportunityStatus, number>>>({});
  loading = signal(true);
  /** Só passa a true depois da primeira resposta: durante um refresh o estado vazio não pisca para o kanban. */
  loaded = signal(false);
  saving = signal(false);
  dragOver = signal<ReactivationOpportunityStatus | null>(null);
  draggingId = signal<string | null>(null);
  target = signal<ReactivationOpportunity | null>(null);
  detail = signal<ReactivationOpportunity | null>(null);
  loadingDetail = signal(false);
  categoryServices = signal<CatalogService[]>([]);

  interactionVisible = signal(false);
  snoozeVisible = signal(false);
  quotationVisible = signal(false);
  detailVisible = signal(false);

  canWrite = computed(() => WRITE_ROLES.includes(this.authService.userRole() ?? ''));
  isEmpty = computed(() => this.loaded() && COLUMNS.every(c => (this.totals()[c.status] ?? 0) === 0));
  channelOptions = computed(() => CHANNELS
    .map(value => ({ value, label: this.translate.instant('retention.funnel.channels.' + value) })));
  outcomeOptions = computed(() => OUTCOMES
    .map(value => ({ value, label: this.translate.instant('retention.funnel.outcomes.' + value) })));
  categoryServiceOptions = computed(() => this.categoryServices()
    .filter(s => s.active).map(s => ({ label: s.name, value: s.id })));

  readonly interactionForm = new FormGroup({
    channel: new FormControl<ReactivationInteractionChannel>('WHATSAPP', { nonNullable: true, validators: Validators.required }),
    outcome: new FormControl<ReactivationInteractionOutcome>('CONTACTED', { nonNullable: true, validators: Validators.required }),
    note: new FormControl<string>('', { nonNullable: true }),
  });

  readonly snoozeForm = new FormGroup({
    channel: new FormControl<ReactivationInteractionChannel>('PHONE', { nonNullable: true, validators: Validators.required }),
    until: new FormControl<Date | null>(null, Validators.required),
    note: new FormControl<string>('', { nonNullable: true }),
  });

  readonly quotationForm = new FormGroup({
    serviceId: new FormControl<string | null>(null),
    quantity: new FormControl<number | null>(null),
    validUntil: new FormControl<Date | null>(null, Validators.required),
    terms: new FormControl<string>('', { nonNullable: true }),
    paymentTerms: new FormControl<string>('', { nonNullable: true }),
  });

  ngOnInit(): void {
    this.load();
    // O job diário cria oportunidades fora desta sessão: o push agregado (SSE) recarrega o funil
    // em vez de exigir que o utilizador reabra a tela. O aviso ao utilizador é o toast global.
    const sub = this.notificationService.notificationReceived$.subscribe(notif => {
      if (notif.type === 'REACTIVATION_OPPORTUNITY') this.load();
    });
    this.destroyRef.onDestroy(() => sub.unsubscribe());
  }

  byStatus(status: ReactivationOpportunityStatus): ReactivationOpportunity[] {
    return this.rows()[status] ?? [];
  }

  isOpen(opp: ReactivationOpportunity): boolean {
    return OPEN.includes(opp.status);
  }

  isActionable(opp: ReactivationOpportunity): boolean {
    return ACTIONABLE.includes(opp.status);
  }

  canDrag(opp: ReactivationOpportunity): boolean {
    return this.canWrite() && this.isActionable(opp);
  }

  daysOverdue(opp: ReactivationOpportunity): number {
    return Math.floor((Date.now() - new Date(opp.dueAt).getTime()) / DAY_MS);
  }

  severityOf(status: ReactivationOpportunityStatus): BadgeSeverity {
    return COLUMNS.find(c => c.status === status)?.severity ?? 'secondary';
  }

  load(): void {
    this.loading.set(true);
    forkJoin(COLUMNS.map(c => this.retentionService.listOpportunities(c.status, PAGE_SIZE))).subscribe({
      next: pages => {
        const rows: Partial<Record<ReactivationOpportunityStatus, ReactivationOpportunity[]>> = {};
        const totals: Partial<Record<ReactivationOpportunityStatus, number>> = {};
        COLUMNS.forEach((c, i) => {
          rows[c.status] = pages[i].content;
          totals[c.status] = pages[i].page.totalElements;
        });
        this.rows.set(rows);
        this.totals.set(totals);
        this.loaded.set(true);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('retention.funnel.loadError') });
      },
    });
  }

  // --- drag & drop -------------------------------------------------------------------------

  beginDrag(event: DragEvent, opp: ReactivationOpportunity): void {
    if (!this.canDrag(opp)) return;
    this.draggingId.set(opp.id);
    event.dataTransfer?.setData('text/plain', opp.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  endDrag(): void {
    this.draggingId.set(null);
    this.dragOver.set(null);
  }

  private dragged(): ReactivationOpportunity | null {
    const id = this.draggingId();
    if (!id) return null;
    return COLUMNS.flatMap(c => this.byStatus(c.status)).find(o => o.id === id) ?? null;
  }

  private accepts(col: Column, opp: ReactivationOpportunity | null): boolean {
    return !!opp && col.status !== opp.status && (col.status === 'SNOOZED' || col.status in DROP_OUTCOME);
  }

  onColumnDragOver(event: DragEvent, col: Column): void {
    if (!this.accepts(col, this.dragged())) return;
    event.preventDefault();
    this.dragOver.set(col.status);
  }

  onDrop(event: DragEvent, col: Column): void {
    event.preventDefault();
    const opp = this.dragged();
    this.endDrag();
    if (!opp || !this.accepts(col, opp)) return;
    if (col.status === 'SNOOZED') {
      this.openSnooze(opp);
    } else {
      this.openInteraction(opp, DROP_OUTCOME[col.status]);
    }
  }

  // --- ações -------------------------------------------------------------------------------

  openInteraction(opp: ReactivationOpportunity, outcome: ReactivationInteractionOutcome = 'CONTACTED'): void {
    this.target.set(opp);
    this.interactionForm.reset({ channel: 'WHATSAPP', outcome, note: '' });
    this.interactionVisible.set(true);
  }

  saveInteraction(): void {
    const opp = this.target();
    if (!opp || this.interactionForm.invalid) return;
    const v = this.interactionForm.getRawValue();
    this.run(this.retentionService.recordInteraction(opp.id, { channel: v.channel, outcome: v.outcome, note: v.note.trim() || null }),
      () => this.interactionVisible.set(false));
  }

  openSnooze(opp: ReactivationOpportunity): void {
    this.target.set(opp);
    this.snoozeForm.reset({ channel: 'PHONE', until: null, note: '' });
    this.snoozeVisible.set(true);
  }

  saveSnooze(): void {
    const opp = this.target();
    const v = this.snoozeForm.getRawValue();
    if (!opp || !v.until || this.snoozeForm.invalid) return;
    const until = new Date(v.until);
    until.setHours(9, 0, 0, 0);
    this.run(this.retentionService.snooze(opp.id, { channel: v.channel, until: until.toISOString(), note: v.note.trim() || null }),
      () => this.snoozeVisible.set(false));
  }

  openQuotation(opp: ReactivationOpportunity): void {
    this.target.set(opp);
    const validUntil = new Date(Date.now() + 15 * DAY_MS);
    this.quotationForm.reset({ serviceId: null, quantity: null, validUntil, terms: '', paymentTerms: '' });
    this.quotationForm.controls.serviceId.setValidators(opp.serviceId ? [] : [Validators.required]);
    this.quotationForm.controls.serviceId.updateValueAndValidity();
    this.categoryServices.set([]);
    if (!opp.serviceId && opp.categoryId) {
      this.serviceService.list({ categoryId: opp.categoryId, active: true, size: 100 })
        .subscribe(page => this.categoryServices.set(page.content));
    }
    this.quotationVisible.set(true);
  }

  saveQuotation(): void {
    const opp = this.target();
    const v = this.quotationForm.getRawValue();
    if (!opp || !v.validUntil || this.quotationForm.invalid) return;
    this.saving.set(true);
    this.retentionService.generateQuotation(opp.id, {
      serviceId: opp.serviceId ? null : v.serviceId,
      quantity: v.quantity,
      validUntil: this.toDateString(v.validUntil),
      terms: v.terms.trim() || null,
      paymentTerms: v.paymentTerms.trim() || null,
    }).subscribe({
      next: quotation => {
        this.saving.set(false);
        this.quotationVisible.set(false);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('retention.funnel.quotationCreated') });
        this.router.navigate(['/quotations', quotation.id, 'edit']);
      },
      error: err => {
        this.saving.set(false);
        this.messageService.add({ severity: 'error', summary: this.errorMessage(err) });
      },
    });
  }

  openDetail(opp: ReactivationOpportunity): void {
    this.detail.set({ ...opp, interactions: [] });
    this.detailVisible.set(true);
    this.loadingDetail.set(true);
    this.retentionService.getOpportunity(opp.id).subscribe({
      next: full => { this.detail.set(full); this.loadingDetail.set(false); },
      error: () => this.loadingDetail.set(false),
    });
  }

  goToQuotation(id: string): void {
    this.router.navigate(['/quotations', id]);
  }

  private run(request$: ReturnType<RetentionService['recordInteraction']>, done: () => void): void {
    this.saving.set(true);
    request$.subscribe({
      next: () => {
        this.saving.set(false);
        done();
        this.messageService.add({ severity: 'success', summary: this.translate.instant('retention.funnel.saved') });
        this.load();
      },
      error: err => {
        this.saving.set(false);
        this.messageService.add({ severity: 'error', summary: this.errorMessage(err) });
      },
    });
  }

  private toDateString(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private errorMessage(err: unknown): string {
    const code = (err as { error?: { errorCode?: string } })?.error?.errorCode;
    const key = code ? `retention.errors.${code}` : null;
    const translated = key ? this.translate.instant(key) : null;
    return translated && translated !== key ? translated : this.translate.instant('retention.funnel.actionError');
  }
}
