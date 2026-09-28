import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { SkeletonModule } from 'primeng/skeleton';
import { MessageService } from 'primeng/api';
import { Quotation, QuotationHistoryEntry, QuotationItem, QuotationSchedule, QuotationSendEntry, QuotationService } from '../../../core/services/quotation.service';
import { CustomerService } from '../../../core/services/customer.service';
import { CatalogService, ServiceCategoryService, ServiceService } from '../../../core/services/catalog.service';
import { TenantService } from '../../../core/services/tenant.service';
import { TagBadgeComponent } from '../../../shared/components/tag-badge/tag-badge.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { LocalizedDatePipe } from '../../../shared/pipes/localized-date.pipe';
import { DurationMinutesPipe } from '../../../shared/pipes/duration-minutes.pipe';
import {
  formatQuotationNumber, itemDiscountPercent, itemGrossAmount, paymentTermsDisplay, priceTypeUnitLabelKey,
  quotationDiscountPercent, quotationErrorMessage, quotationItemsDiscountTotal, quotationItemsGrossSubtotal,
  quotationStatusSeverity,
} from '../quotation-form.utils';
import { scheduleDurationMinutes, technicianNamesLabel } from '../../../shared/utils/schedule-window.util';

/**
 * Vista somente-leitura de um orçamento (`/quotations/:id`), qualquer status incluindo DRAFT —
 * é para onde o número do orçamento na listagem sempre leva. Editar um DRAFT é uma ação à parte
 * (o lápis da listagem, {@link QuotationEditComponent}), nunca um efeito colateral de olhar o
 * orçamento.
 */
@Component({
  selector: 'app-quotation-view',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, TranslatePipe, CurrencyPipe, DatePipe, DecimalPipe, ButtonModule, TableModule, SkeletonModule,
    TagBadgeComponent, PageHeaderComponent, LocalizedDatePipe, DurationMinutesPipe],
  template: `
    <div>
      <app-page-header [title]="ready() ? ('quotations.numberShort' | translate: { number: formatQuotationNumber(ready()!.quotationNumber) }) : ('quotations.viewer' | translate)"
                        [description]="ready() ? ('quotations.viewer' | translate) : (loading() ? ('common.loading' | translate) : '')">
        @if (ready(); as q) {
          <ng-container badge>
            @if (customerName()) {
              <a [routerLink]="['/customers']" [queryParams]="{ customerId: q.customerId }"
                 class="inline-flex items-center gap-1 text-sm text-app-text-secondary hover:text-app-accent-hover hover:underline">
                <i class="pi pi-user text-xs" aria-hidden="true"></i> {{ customerName() }}
              </a>
            }
            <app-tag-badge [value]="('quotations.status' + q.status) | translate" [severity]="quotationStatusSeverity(q.status)"></app-tag-badge>
            @if (q.revisionNumber > 1) {
              <app-tag-badge [value]="('quotations.revisionLabel' | translate: { number: q.revisionNumber })" severity="secondary"></app-tag-badge>
            }
          </ng-container>
        }
        <p-button [label]="'quotations.backToList' | translate" icon="pi pi-arrow-left" [outlined]="true" (onClick)="back()"></p-button>
        @if (ready(); as q) {
          @if (q.status === 'DRAFT') {
            <p-button [label]="'common.edit' | translate" icon="pi pi-pencil" (onClick)="editQuotation(q)"></p-button>
          }
          @if (q.status === 'SENT') {
            <p-button [label]="'quotations.resend' | translate" icon="pi pi-send"
                      [loading]="resending()" [outlined]="true" (onClick)="resend(q)"></p-button>
          }
          @if (q.status === 'SENT' && !q.superseded) {
            <p-button [label]="'quotations.newRevision' | translate" icon="pi pi-refresh"
                      [loading]="renegotiating()" [outlined]="true" (onClick)="renegotiate(q)"></p-button>
          }
          @if (q.status === 'DECLINED' && !q.superseded) {
            <p-button [label]="'quotations.reopen' | translate" icon="pi pi-replay" [outlined]="true"
                      [loading]="reopening()" (onClick)="reopen(q)"></p-button>
            <p-button [label]="'quotations.renegotiate' | translate" icon="pi pi-refresh"
                      [loading]="renegotiating()" (onClick)="renegotiate(q)"></p-button>
          }
        }
      </app-page-header>

      @if (loading()) {
        <div class="bg-app-bg rounded-md border border-app-border p-5 space-y-5">
          <div class="rounded-md border border-app-border bg-app-surface p-4 space-y-3">
            <p-skeleton height="0.875rem" width="10rem"></p-skeleton>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <p-skeleton height="2.25rem"></p-skeleton>
              <p-skeleton height="2.25rem"></p-skeleton>
              <p-skeleton height="2.25rem" class="sm:col-span-3"></p-skeleton>
            </div>
          </div>
          <p-skeleton height="9rem"></p-skeleton>
        </div>
      } @else if (ready(); as q) {
        <div class="bg-app-bg rounded-md border border-app-border p-5 space-y-5">
          @if (q.supersedesId || q.superseded || (q.status === 'DECLINED' && q.declineReason)) {
            <section class="rounded-md border border-app-border bg-app-surface-hover p-4 space-y-2 text-sm">
              @if (q.supersedesId || nextRevision()) {
                <div class="flex items-center justify-between gap-3">
                  @if (q.supersedesId) {
                    <p-button [label]="'quotations.previousRevisionLink' | translate" icon="pi pi-arrow-left"
                              variant="text" size="small" severity="secondary"
                              (onClick)="goToQuotation(q.supersedesId)"></p-button>
                  } @else {
                    <span></span>
                  }
                  @if (nextRevision(); as next) {
                    <p-button [label]="'quotations.renegotiatedAsLink' | translate: { number: formatQuotationNumber(next.quotationNumber) }"
                              icon="pi pi-arrow-right" iconPos="right" variant="text" size="small" severity="secondary"
                              (onClick)="goToQuotation(next.id)"></p-button>
                  }
                </div>
              }
              @if (q.status === 'DECLINED' && q.declineReason) {
                <p class="text-app-text-secondary"><span class="font-medium text-app-text">{{ 'quotations.declineReasonLabel' | translate }}:</span> {{ q.declineReason }}</p>
              }
            </section>
          }
          <section class="rounded-md border border-app-border bg-app-surface p-4 space-y-3">
            <h3 class="text-sm font-semibold text-app-text">{{ 'quotations.sectionConditions' | translate }}</h3>
            <dl class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div>
                <dt class="text-app-text-tertiary text-xs">{{ 'quotations.validUntil' | translate }}</dt>
                <dd class="text-app-text">{{ q.validUntil | date:'mediumDate' }}</dd>
              </div>
              @if (q.sentAt) {
                <div>
                  <dt class="text-app-text-tertiary text-xs">{{ 'quotations.sentAtLabel' | translate }}</dt>
                  <dd class="text-app-text">{{ q.sentAt | localizedDate:'datetime':tenantTimezone() }}</dd>
                  @if (sendHistory().length > 1) {
                    <div class="mt-2">
                      <span class="text-app-text-tertiary text-xs">{{ 'quotations.sendHistoryLabel' | translate }}</span>
                      <ul class="mt-1 space-y-1 border-l border-app-border pl-3">
                        @for (send of sendHistory(); track send.id) {
                          <li class="text-xs text-app-text-secondary">
                            {{ send.sentAt | localizedDate:'datetime':tenantTimezone() }}
                            <span class="text-app-text-tertiary">· {{ send.sentByName ?? send.sentBy ?? '—' }}</span>
                          </li>
                        }
                      </ul>
                    </div>
                  }
                </div>
              }
              @if (q.paymentTerms) {
                <div>
                  <dt class="text-app-text-tertiary text-xs">{{ 'quotations.paymentTermsLabel' | translate }}</dt>
                  <dd class="text-app-text">{{ paymentTermsText(q.paymentTerms) }}</dd>
                </div>
              }
              <div class="sm:col-span-3">
                <dt class="text-app-text-tertiary text-xs">{{ 'quotations.observationsLabel' | translate }}</dt>
                <dd class="text-app-text whitespace-pre-line">{{ q.terms || '—' }}</dd>
              </div>
            </dl>
          </section>

          @if (schedules().length) {
            <section class="rounded-md border border-app-border bg-app-surface p-4 space-y-3">
              <h3 class="text-sm font-semibold text-app-text">{{ 'quotations.schedule.title' | translate }}</h3>
              <div class="space-y-2">
                @for (s of schedules(); track s.executionMode) {
                  <div class="flex items-center gap-2 text-sm text-app-text bg-app-surface-hover rounded px-3 py-2 flex-wrap">
                    <span class="font-medium">{{ ('catalog.services.executionMode' + s.executionMode) | translate }}</span>
                    <span class="text-app-text-tertiary">·</span>
                    <span>{{ technicianNamesLabel(s.technicianNames) }}</span>
                    <span class="text-app-text-secondary">
                      {{ 'common.estimatedArrival' | translate }}: {{ s.scheduledStartAt | localizedDate:'datetime':tenantTimezone() }}
                      <span class="text-app-text-tertiary">· {{ 'common.estimatedDuration' | translate: { duration: (scheduleDurationMinutes(s.scheduledStartAt, s.scheduledEndAt) | durationMinutes) } }}</span>
                    </span>
                    <span class="text-xs text-app-text-tertiary ml-auto">
                      {{ s.routeId ? ('quotations.schedule.existingRoute' | translate) : ('quotations.schedule.newRoute' | translate) }}
                    </span>
                  </div>
                }
              </div>
            </section>
          }

          <div class="bg-app-surface p-4 rounded border border-app-border space-y-2">
            @if (quotationItemsDiscountTotal(q.items) > 0) {
              <div class="flex justify-between text-sm text-app-text">
                <span>{{ 'quotations.itemsGrossSubtotal' | translate }}</span>
                <span>{{ quotationItemsGrossSubtotal(q.items) | currency:q.currency }}</span>
              </div>
              <div class="flex justify-between text-sm text-app-text">
                <span>{{ 'quotations.itemsDiscountTotal' | translate }}</span>
                <span>-{{ quotationItemsDiscountTotal(q.items) | currency:q.currency }}</span>
              </div>
              @if (q.discountAmount > 0) {
                <div class="flex justify-between text-sm text-app-text">
                  <span>{{ 'quotations.subtotalAfterItemDiscounts' | translate }}</span>
                  <span>{{ q.subtotal | currency:q.currency }}</span>
                </div>
              }
            } @else {
              <div class="flex justify-between text-sm text-app-text">
                <span>{{ 'quotations.subtotal' | translate }}</span>
                <span>{{ q.subtotal | currency:q.currency }}</span>
              </div>
            }
            @if (q.discountAmount > 0) {
              <div class="flex justify-between text-sm text-app-text">
                <span>{{ 'quotations.totalDiscountLabel' | translate }}</span>
                <span>-{{ q.discountAmount | currency:q.currency }} ({{ quotationDiscountPercent(q) | number:'1.0-1' }}%)</span>
              </div>
            }
            @if (q.paymentMethod) {
              @if (q.paymentCondition) {
                <div class="flex justify-between text-sm text-app-text">
                  <span>{{ 'quotations.paymentConditionLabel' | translate }}</span>
                  <span>{{ conditionLabel(q.paymentCondition) }}</span>
                </div>
              }
              <div class="flex justify-between text-sm text-app-text">
                <span>{{ 'quotations.paymentMethodLabel' | translate }}</span>
                <span>{{ methodLabel(q.paymentMethod) }}</span>
              </div>
              @if (q.installments) {
                <div class="flex justify-between text-sm text-app-text">
                  <span>{{ 'quotations.installmentsLabel' | translate }}</span>
                  <span>{{ q.installments }}x</span>
                </div>
              }
              @if (q.interestAmount > 0) {
                <div class="flex justify-between text-sm text-app-text">
                  <span>{{ 'quotations.amountBeforeInterest' | translate }}</span>
                  <span>{{ q.amountBeforeInterest | currency:q.currency }}</span>
                </div>
                <div class="flex justify-between text-sm text-app-text">
                  <span>{{ 'quotations.interestAmount' | translate: { percentage: q.paymentMethodInterestPercentage } }}</span>
                  <span>+{{ q.interestAmount | currency:q.currency }}</span>
                </div>
              }
            }
            <div class="flex justify-between text-base font-bold text-app-text border-t border-app-border pt-2">
              <span>{{ 'quotations.total' | translate }}</span>
              <span>{{ q.total | currency:q.currency }}</span>
            </div>
          </div>

          <div class="overflow-x-auto min-w-0">
            <p-table [value]="q.items" class="p-datatable-sm" [rowHover]="true">
              <ng-template pTemplate="header">
                <tr>
                  <th>{{ 'common.name' | translate }}</th>
                  <th>{{ 'quotations.quantity' | translate }}</th>
                  <th>{{ 'quotations.unitPrice' | translate }}</th>
                  <th>{{ 'quotations.subtotalBeforeDiscount' | translate }}</th>
                  <th>{{ 'quotations.discount' | translate }}</th>
                  <th>{{ 'quotations.lineTotal' | translate }}</th>
                </tr>
              </ng-template>
              <ng-template pTemplate="body" let-item>
                <tr>
                  <td>
                    <div class="flex flex-col">
                      <span>{{ item.description }}</span>
                      @if (categoryNameForService(item.serviceId); as catName) {
                        <span class="text-xs text-app-text-tertiary">{{ catName }}</span>
                      }
                    </div>
                  </td>
                  <td class="whitespace-nowrap">{{ quantityDisplay(item) }}</td>
                  <td class="whitespace-nowrap">{{ item.unitPrice | currency:q.currency }}{{ unitLabel(item.priceType) ? '/' + unitLabel(item.priceType) : '' }}</td>
                  <td class="whitespace-nowrap">{{ itemGrossAmount(item) | currency:q.currency }}</td>
                  <td class="whitespace-nowrap">
                    {{ item.discountAmount | currency:q.currency }}
                    @if (item.discountAmount > 0) {
                      <span class="text-app-text-tertiary text-xs">({{ itemDiscountPercent(item) | number:'1.0-1' }}%)</span>
                    }
                  </td>
                  <td class="whitespace-nowrap font-medium">{{ item.lineTotal | currency:q.currency }}</td>
                </tr>
              </ng-template>
              <ng-template pTemplate="emptymessage">
                <tr>
                  <td colspan="6" class="text-center text-sm text-app-text-tertiary py-6">
                    {{ 'quotations.noItemsYet' | translate }}
                  </td>
                </tr>
              </ng-template>
            </p-table>
          </div>
        </div>
      }
    </div>
  `,
})
export class QuotationViewComponent implements OnInit {
  private quotationService = inject(QuotationService);
  private customerService = inject(CustomerService);
  private serviceService = inject(ServiceService);
  private serviceCategoryService = inject(ServiceCategoryService);
  private tenantService = inject(TenantService);
  private messageService = inject(MessageService);
  private translate = inject(TranslateService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  loading = signal(true);
  quotation = signal<Quotation | null>(null);
  /** Só não-nulo quando o carregamento inicial terminou — guarda que o template usa para
   *  decidir entre skeleton e conteúdo real, e para liberar o badge de status no cabeçalho. */
  ready = computed(() => (this.loading() ? null : this.quotation()));
  customerName = signal('');
  schedules = signal<QuotationSchedule[]>([]);
  renegotiating = signal(false);
  resending = signal(false);
  reopening = signal(false);
  /** Próximo elo da cadeia (a revisão que renegociou este orçamento) — só buscado quando
   *  {@code superseded}, via {@link QuotationService#history}; resto da cadeia não interessa aqui. */
  nextRevision = signal<QuotationHistoryEntry | null>(null);
  /** Histórico de envio (issue #227) — uma entrada por send/resend, mais recente primeiro. Vazio
   *  para um orçamento nunca enviado (DRAFT). */
  sendHistory = signal<QuotationSendEntry[]>([]);
  /** Fuso do tenant (não o do browser): quando o técnico chega é hora local dele, não do
   *  dispositivo de quem está a consultar (issue: agendamento sumia da consulta). */
  tenantTimezone = signal<string | null>(null);

  /** Sem filtro de ativo — um orçamento já aprovado pode referenciar serviço hoje inativo, e o
   *  subtítulo de categoria continua útil como registo histórico. */
  private services = signal<CatalogService[]>([]);
  private servicesById = computed(() => new Map(this.services().map(s => [s.id, s])));
  /** Nome da categoria por id — só para o subtítulo do serviço na lista de itens (contexto
   *  visual, não persistido: o item do orçamento não guarda categoria própria). */
  private categoryNamesById = signal<Map<string, string>>(new Map());

  ngOnInit(): void {
    // paramMap, não snapshot: navegar de uma revisão pra outra ("ver anterior"/"renegociado
    // como") fica na mesma rota (/quotations/:id), o Angular reaproveita esta instância do
    // componente em vez de recriá-la — só o snapshot ficaria preso no id da primeira visita.
    this.route.paramMap.subscribe(params => this.loadQuotation(params.get('id')!));
    this.serviceService.list({ size: 100 }).subscribe({
      next: s => this.services.set(s.content),
      error: () => {},
    });
    this.serviceCategoryService.list({ size: 100 }).subscribe({
      next: c => this.categoryNamesById.set(new Map(c.content.map(cat => [cat.id, cat.name]))),
      error: () => {},
    });
    this.tenantService.getMe().subscribe({
      next: t => { if (t.timezone) this.tenantTimezone.set(t.timezone); },
      error: () => {},
    });
  }

  private loadQuotation(id: string): void {
    this.loading.set(true);
    this.nextRevision.set(null);
    this.schedules.set([]);
    this.sendHistory.set([]);
    this.quotationService.get(id).subscribe({
      next: q => {
        this.quotation.set(q);
        this.loading.set(false);
        this.customerService.get(q.customerId).subscribe(c => this.customerName.set(c.name));
        this.quotationService.schedules(q.id).subscribe({
          next: s => this.schedules.set(s),
          error: () => {},
        });
        if (q.sentAt) {
          this.quotationService.sends(q.id).subscribe({
            next: history => this.sendHistory.set(history),
            error: () => {},
          });
        }
        if (q.superseded) {
          this.quotationService.history(q.id).subscribe({
            next: chain => {
              const index = chain.findIndex(entry => entry.id === q.id);
              this.nextRevision.set(index >= 0 ? (chain[index + 1] ?? null) : null);
            },
            error: () => {},
          });
        }
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: this.translate.instant('quotations.notFound') });
        this.router.navigate(['/quotations']);
      },
    });
  }

  /** Sempre a listagem de orçamentos, nunca o histórico do browser — não importa se chegou aqui
   *  a partir duma ordem, da expansão de versões ou de outra revisão da cadeia. Quem quiser a
   *  página anterior de fato usa o botão de voltar do próprio browser. */
  back(): void {
    this.router.navigate(['/quotations']);
  }

  /** Navega pra outro elo da cadeia de renegociação (anterior/próxima revisão) — não recarrega a
   *  página atual, entra direto no id de destino (mesma rota, componente é recriado). */
  goToQuotation(id: string): void {
    this.router.navigate(['/quotations', id]);
  }

  /** Atalho direto do detalhe pra edição — sem passar pela listagem de novo. */
  editQuotation(q: Quotation): void {
    this.router.navigate(['/quotations', q.id, 'edit']);
  }

  /** Reenvio do orçamento já SENT (issue #227): o e-mail falhou ou o link público (24h) expirou,
   *  e quem está na tela quer uma via de recuperação sem recriar o orçamento. Depois de reenviar,
   *  recarrega o orçamento para atualizar {@code sentAt}; o link novo vai para a área de
   *  transferência, como no envio original. */
  resend(q: Quotation): void {
    if (this.resending()) return;
    this.resending.set(true);
    this.quotationService.resend(q.id).subscribe({
      next: res => {
        this.resending.set(false);
        navigator.clipboard?.writeText(`${window.location.origin}/quotations/public/${res.publicToken}`);
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('quotations.resendSuccess', { number: formatQuotationNumber(q.quotationNumber) }),
        });
        this.loadQuotation(q.id);
      },
      error: (err) => {
        this.resending.set(false);
        this.messageService.add({ severity: 'error', summary: quotationErrorMessage(err, this.translate, 'quotations.resendError') });
      },
    });
  }

  /** Cria a próxima revisão (DRAFT, pré-preenchida com itens e desconto de {@code q}) e vai
   *  direto pra edição — mesmo destino de "Novo orçamento", origem diferente. */
  renegotiate(q: Quotation): void {
    if (this.renegotiating()) return;
    this.renegotiating.set(true);
    this.quotationService.renegotiate(q.id).subscribe({
      next: renegotiated => {
        this.renegotiating.set(false);
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('quotations.renegotiatedToast', { number: formatQuotationNumber(renegotiated.quotationNumber) }),
        });
        this.router.navigate(['/quotations', renegotiated.id, 'edit']);
      },
      error: (err) => {
        this.renegotiating.set(false);
        this.messageService.add({ severity: 'error', summary: quotationErrorMessage(err, this.translate, 'quotations.renegotiateError') });
      },
    });
  }

  reopen(q: Quotation): void {
    if (this.reopening()) return;
    this.reopening.set(true);
    this.quotationService.reopen(q.id).subscribe({
      next: () => {
        this.reopening.set(false);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('quotations.reopenedToast') });
        this.loadQuotation(q.id);
      },
      error: (err) => {
        this.reopening.set(false);
        this.messageService.add({ severity: 'error', summary: quotationErrorMessage(err, this.translate, 'quotations.reopenError') });
      },
    });
  }

  paymentTermsText(value: string | null): string {
    return paymentTermsDisplay(value, this.translate);
  }

  methodLabel(method: string): string {
    return this.translate.instant(`financial.payments.method${method}`);
  }

  conditionLabel(condition: string): string {
    return this.translate.instant(`financial.payments.condition${condition}`);
  }

  readonly quotationStatusSeverity = quotationStatusSeverity;
  readonly formatQuotationNumber = formatQuotationNumber;
  readonly scheduleDurationMinutes = scheduleDurationMinutes;
  readonly technicianNamesLabel = technicianNamesLabel;
  readonly itemGrossAmount = itemGrossAmount;
  readonly itemDiscountPercent = itemDiscountPercent;
  readonly quotationItemsGrossSubtotal = quotationItemsGrossSubtotal;
  readonly quotationItemsDiscountTotal = quotationItemsDiscountTotal;
  readonly quotationDiscountPercent = quotationDiscountPercent;

  unitLabel(priceType: QuotationItem['priceType']): string {
    const key = priceTypeUnitLabelKey(priceType);
    return key ? this.translate.instant(key) : '';
  }

  quantityDisplay(item: QuotationItem): string {
    const unit = this.unitLabel(item.priceType);
    return unit ? `${item.quantity} ${unit}` : `${item.quantity}`;
  }

  categoryNameForService(serviceId: string): string | null {
    const categoryId = this.servicesById().get(serviceId)?.categoryId;
    return categoryId ? (this.categoryNamesById().get(categoryId) ?? null) : null;
  }
}
