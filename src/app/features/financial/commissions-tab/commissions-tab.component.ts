import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TabsModule } from 'primeng/tabs';
import { ConfirmationService, MessageService } from 'primeng/api';
import {
  CommissionOverview, CommissionPayment, CommissionRates, FinancialService, PaymentMethod, ProviderBalance,
} from '../../../core/services/financial.service';
import { TenantService } from '../../../core/services/tenant.service';
import { AuthService } from '../../../core/auth/auth.service';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { TagBadgeComponent } from '../../../shared/components/tag-badge/tag-badge.component';
import { TableStandardDirective } from '../../../shared/directives/table-standard.directive';
import { LocalizedDatePipe } from '../../../shared/pipes/localized-date.pipe';
import { CommissionExplainerService } from './commission-explainer.service';
import { CommissionPayoutDrawerComponent, PayoutDrawerMode } from './commission-payout-drawer.component';
import { CommissionRatesComponent } from './commission-rates.component';

const PAGE_SIZE = 10;
type CommissionTab = 'toPay' | 'paid' | 'rates';

/** Forma de pagamento mais comum em cada mercado — ponto de partida que o dono só confirma. */
const DEFAULT_METHOD_BY_COUNTRY: Record<string, PaymentMethod> = { BR: 'PIX', PT: 'BANK_TRANSFER' };

/**
 * Comissões, do ponto de vista de quem paga: a primeira frase diz quanto há a pagar, cada prestador
 * tem o seu saldo, e pagar é abrir o painel, conferir e confirmar. O cálculo acontece sozinho quando
 * o serviço é finalizado; o único trabalho do dono é dizer uma vez quanto cada um ganha.
 */
@Component({
  selector: 'app-commissions-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, TranslatePipe, CurrencyPipe, LocalizedDatePipe, ButtonModule, SkeletonModule, TableModule, TabsModule,
    PageHeaderComponent, EmptyStateComponent, TagBadgeComponent, TableStandardDirective,
    CommissionPayoutDrawerComponent, CommissionRatesComponent,
  ],
  template: `
    <app-page-header [title]="'financial.tabCommissions' | translate" [description]="'financial.commissions.subtitle' | translate"></app-page-header>

    <div class="space-y-4">
      <!-- A resposta principal: quanto há a pagar -->
      <section class="bg-app-bg border border-app-border rounded-xl p-6" aria-live="polite">
        @if (loading()) {
          <p-skeleton height="2.5rem" width="60%"></p-skeleton>
        } @else if (overview(); as o) {
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div class="min-w-0">
              @if (o.toPayCount > 0) {
                <p class="text-2xl text-app-text [&_strong]:font-semibold" [innerHTML]="'financial.commissions.hero.toPay' | translate:{ amount: explainer.money(o.toPayTotal) }"></p>
                <p class="text-sm text-app-text-secondary mt-1">
                  {{ 'financial.commissions.hero.toPaySub' | translate:{ providers: providersToPay().length, services: o.toPayCount } }}
                </p>
              } @else {
                <p class="text-2xl text-app-text"><i class="pi pi-check-circle text-app-success mr-2" aria-hidden="true"></i>{{ 'financial.commissions.hero.allPaid' | translate }}</p>
                <p class="text-sm text-app-text-secondary mt-1">{{ 'financial.commissions.hero.allPaidSub' | translate }}</p>
              }
            </div>
            <div class="text-right">
              <p class="text-xs text-app-text-tertiary">{{ 'financial.commissions.hero.paidThisMonth' | translate }}</p>
              <p class="text-lg font-medium text-app-text">{{ o.paidThisMonthTotal.amount | currency:o.paidThisMonthTotal.currency }}</p>
            </div>
          </div>
        }
      </section>

      <!-- O que fazer agora: definir quanto cada um ganha -->
      @if (canManage() && providersWithoutRate().length > 0) {
        <section class="bg-app-bg border border-app-warning rounded-xl p-4 flex flex-wrap items-center gap-4" role="status">
          <i class="pi pi-info-circle text-app-warning text-xl" aria-hidden="true"></i>
          <div class="flex-1 min-w-[16rem]">
            <p class="text-sm font-medium text-app-text">{{ 'financial.commissions.setup.title' | translate }}</p>
            <p class="text-sm text-app-text-secondary">
              {{ 'financial.commissions.setup.body' | translate:{ names: namesWithoutRate(), percentage: suggestedLabel() } }}
              @if ((overview()?.toCalculateCount ?? 0) > 0) {
                {{ 'financial.commissions.setup.awaiting' | translate:{ count: overview()!.toCalculateCount } }}
              }
            </p>
          </div>
          <div class="flex gap-2 flex-wrap">
            <p-button [label]="'financial.commissions.setup.applyAll' | translate:{ percentage: suggestedLabel() }" icon="pi pi-check"
                      [loading]="applyingAll()" (onClick)="confirmApplyAll()"></p-button>
            <p-button [label]="'financial.commissions.setup.customize' | translate" [outlined]="true" (onClick)="activeTab.set('rates')"></p-button>
          </div>
        </section>
      }

      <p-tabs [value]="activeTab()" (valueChange)="onTabChange($event)">
        <p-tablist>
          <p-tab value="toPay">{{ 'financial.commissions.tabs.toPay' | translate }}</p-tab>
          <p-tab value="paid">{{ 'financial.commissions.tabs.paid' | translate }}</p-tab>
          <p-tab value="rates">{{ 'financial.commissions.tabs.rates' | translate }}</p-tab>
        </p-tablist>
        <p-tabpanels>
          <!-- A pagar: um cartão por prestador -->
          <p-tabpanel value="toPay">
            <div class="pt-3">
              @if (loading()) {
                <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <p-skeleton height="9rem"></p-skeleton>
                  <p-skeleton height="9rem"></p-skeleton>
                </div>
              } @else if (overview()?.providers?.length === 0) {
                <app-empty-state icon="pi pi-wallet" [message]="'financial.commissions.toPay.empty' | translate"
                                 [subtitle]="'financial.commissions.toPay.emptyHint' | translate"></app-empty-state>
              } @else {
                <ul class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  @for (p of overview()!.providers; track p.providerId) {
                    <li class="bg-app-bg border border-app-border rounded-xl p-4 flex flex-col gap-3">
                      <div class="flex items-center gap-3 min-w-0">
                        <span class="w-10 h-10 rounded-full bg-app-accent-soft text-app-accent flex items-center justify-center font-medium shrink-0"
                              aria-hidden="true">{{ initial(p) }}</span>
                        <div class="min-w-0">
                          <p class="font-medium text-app-text truncate">{{ p.providerName || p.providerId }}</p>
                          @if (p.toPayCount > 0) {
                            <p class="text-xs text-app-text-tertiary">
                              {{ 'financial.commissions.toPay.services' | translate:{ count: p.toPayCount, date: (p.oldestCalculatedAt | localizedDate) } }}
                            </p>
                          }
                        </div>
                      </div>
                      <p class="text-2xl font-medium text-app-text">{{ p.toPayTotal.amount | currency:p.toPayTotal.currency }}</p>
                      @if (p.toCalculateCount > 0) {
                        <p class="text-xs text-app-warning flex items-center gap-1.5">
                          <i class="pi pi-clock" aria-hidden="true"></i>
                          {{ 'financial.commissions.toPay.awaiting' | translate:{ count: p.toCalculateCount } }}
                        </p>
                      }
                      <div class="mt-auto">
                        <p-button [label]="(p.toPayCount > 0 ? 'financial.commissions.toPay.payAction' : 'financial.commissions.toPay.viewAction') | translate"
                                  [icon]="p.toPayCount > 0 ? 'pi pi-wallet' : 'pi pi-eye'" size="small"
                                  [outlined]="p.toPayCount === 0" (onClick)="openPay(p)"></p-button>
                      </div>
                    </li>
                  }
                </ul>
              }
            </div>
          </p-tabpanel>

          <!-- Histórico de pagamentos -->
          <p-tabpanel value="paid">
            <div class="pt-3">
              @if (!paymentsLoading() && paymentsTotal() === 0) {
                <app-empty-state icon="pi pi-history" [message]="'financial.commissions.paid.empty' | translate"
                                 [subtitle]="'financial.commissions.paid.emptyHint' | translate"></app-empty-state>
              } @else {
                <p-table appTableStandard [value]="payments()" dataKey="id" styleClass="p-datatable-sm"
                         [lazy]="true" [lazyLoadOnInit]="false" [paginator]="paymentsTotal() > pageSize" [rows]="pageSize"
                         [totalRecords]="paymentsTotal()" [first]="paymentsFirst()" [loading]="paymentsLoading()"
                         (onLazyLoad)="loadPayments($event)">
                  <ng-template pTemplate="header">
                    <tr>
                      <th>{{ 'financial.commissions.paid.date' | translate }}</th>
                      <th>{{ 'financial.commissions.paid.provider' | translate }}</th>
                      <th>{{ 'financial.commissions.paid.amount' | translate }}</th>
                      <th>{{ 'financial.commissions.paid.method' | translate }}</th>
                      <th>{{ 'financial.commissions.paid.status' | translate }}</th>
                      <th class="w-32"></th>
                    </tr>
                  </ng-template>
                  <ng-template pTemplate="body" let-row>
                    <tr>
                      <td>{{ row.paidAt | localizedDate }}</td>
                      <td class="text-app-text">{{ row.providerName || row.providerId }}</td>
                      <td class="font-medium">{{ row.totalAmount.amount | currency:row.totalAmount.currency }}</td>
                      <td>{{ explainer.methodLabel(row.paymentMethod) }}</td>
                      <td>
                        <app-tag-badge [value]="('financial.commissions.paid.status' + row.status) | translate"
                                       [severity]="row.status === 'PAID' ? 'success' : 'secondary'"></app-tag-badge>
                      </td>
                      <td class="text-right">
                        <p-button [label]="'financial.commissions.paid.view' | translate" [text]="true" size="small" (onClick)="openPaid(row)"></p-button>
                      </td>
                    </tr>
                  </ng-template>
                </p-table>
              }
            </div>
          </p-tabpanel>

          <!-- Quanto cada um ganha -->
          <p-tabpanel value="rates">
            @if (rates(); as r) {
              <app-commission-rates [rates]="r.providers" [suggested]="r.suggestedPercentage" [currency]="currency()"
                                    [canManage]="canManage()" (saved)="reload()"></app-commission-rates>
            } @else {
              <div class="pt-3"><p-skeleton height="5rem"></p-skeleton></div>
            }
          </p-tabpanel>
        </p-tabpanels>
      </p-tabs>
    </div>

    <app-commission-payout-drawer [(visible)]="drawerVisible" [mode]="drawerMode()" [providerId]="drawerProviderId()"
                                  [providerName]="drawerProviderName()" [payment]="drawerPayment()" [canManage]="canManage()"
                                  [defaultMethod]="defaultMethod()" (changed)="reload()" (defineRate)="goToRates()"></app-commission-payout-drawer>
  `,
})
export class CommissionsTabComponent implements OnInit {
  private readonly financialService = inject(FinancialService);
  private readonly tenantService = inject(TenantService);
  private readonly authService = inject(AuthService);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly translate = inject(TranslateService);
  protected readonly explainer = inject(CommissionExplainerService);

  readonly pageSize = PAGE_SIZE;

  /** Pagar e definir percentual são restritos a OWNER/FINANCE no backend — esconder a ação para
   *  ADMIN evita o 403 silencioso. */
  readonly canManage = computed(() => ['OWNER', 'FINANCE'].includes(this.authService.userRole() ?? ''));

  readonly loading = signal(true);
  readonly overview = signal<CommissionOverview | null>(null);
  readonly rates = signal<CommissionRates | null>(null);
  readonly activeTab = signal<CommissionTab>('toPay');
  readonly applyingAll = signal(false);
  readonly defaultMethod = signal<PaymentMethod>('PIX');

  readonly payments = signal<CommissionPayment[]>([]);
  readonly paymentsTotal = signal(0);
  readonly paymentsFirst = signal(0);
  readonly paymentsLoading = signal(false);
  private paymentsPage = 0;

  readonly drawerVisible = signal(false);
  readonly drawerMode = signal<PayoutDrawerMode>('pay');
  readonly drawerProviderId = signal<string | null>(null);
  readonly drawerProviderName = signal('');
  readonly drawerPayment = signal<CommissionPayment | null>(null);

  readonly currency = computed(() => this.overview()?.toPayTotal.currency ?? 'BRL');
  readonly providersToPay = computed(() => (this.overview()?.providers ?? []).filter(p => p.toPayCount > 0));
  readonly providersWithoutRate = computed(() => (this.rates()?.providers ?? []).filter(p => !p.ruleType));
  readonly namesWithoutRate = computed(() => this.providersWithoutRate().map(p => p.providerName || p.providerId).join(', '));
  readonly suggestedLabel = computed(() => this.explainer.percentage(this.rates()?.suggestedPercentage ?? 0));

  ngOnInit(): void {
    this.tenantService.getMe().subscribe({
      next: tenant => this.defaultMethod.set(DEFAULT_METHOD_BY_COUNTRY[tenant.countryCode ?? ''] ?? 'CASH'),
      error: () => {},
    });
    this.reload();
  }

  reload(): void {
    forkJoin({ overview: this.financialService.getCommissionOverview(), rates: this.financialService.getCommissionRates() }).subscribe({
      next: ({ overview, rates }) => {
        this.overview.set(overview);
        this.rates.set(rates);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('financial.loadError') });
      },
    });
    this.fetchPayments();
  }

  onTabChange(value: string | number | undefined): void {
    this.activeTab.set((value as CommissionTab) ?? 'toPay');
  }

  goToRates(): void {
    this.drawerVisible.set(false);
    this.activeTab.set('rates');
  }

  initial(p: ProviderBalance): string {
    return (p.providerName || '?').trim().charAt(0).toUpperCase();
  }

  openPay(p: ProviderBalance): void {
    this.drawerMode.set('pay');
    this.drawerProviderId.set(p.providerId);
    this.drawerProviderName.set(p.providerName || p.providerId);
    this.drawerPayment.set(null);
    this.drawerVisible.set(true);
  }

  openPaid(payment: CommissionPayment): void {
    this.drawerMode.set('paid');
    this.drawerProviderId.set(payment.providerId);
    this.drawerProviderName.set(payment.providerName || payment.providerId);
    this.drawerPayment.set(payment);
    this.drawerVisible.set(true);
  }

  loadPayments(event: TableLazyLoadEvent): void {
    this.paymentsPage = Math.floor((event.first ?? 0) / (event.rows ?? PAGE_SIZE));
    this.paymentsFirst.set(this.paymentsPage * PAGE_SIZE);
    this.fetchPayments();
  }

  private fetchPayments(): void {
    this.paymentsLoading.set(true);
    this.financialService.listCommissionPayments({ page: this.paymentsPage, size: PAGE_SIZE }).subscribe({
      next: result => {
        this.payments.set(result.content);
        this.paymentsTotal.set(result.page.totalElements);
        this.paymentsLoading.set(false);
      },
      error: () => {
        this.paymentsLoading.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('financial.loadError') });
      },
    });
  }

  confirmApplyAll(): void {
    const missing = this.providersWithoutRate();
    const suggested = this.rates()?.suggestedPercentage;
    if (missing.length === 0 || suggested == null) return;
    this.confirmationService.confirm({
      header: this.translate.instant('financial.commissions.setup.confirmTitle'),
      message: this.translate.instant('financial.commissions.setup.confirmMessage', {
        percentage: this.suggestedLabel(), names: this.namesWithoutRate(),
      }),
      icon: 'pi pi-percentage',
      acceptLabel: this.translate.instant('common.confirm'),
      rejectLabel: this.translate.instant('common.cancel'),
      accept: () => this.applyToAll(missing.map(p => p.providerId), suggested),
    });
  }

  private applyToAll(providerIds: string[], percentage: number): void {
    this.applyingAll.set(true);
    forkJoin(providerIds.map(id => this.financialService.setCommissionRate(id, percentage))).subscribe({
      next: () => {
        this.applyingAll.set(false);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('financial.commissions.setup.applied') });
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.applyingAll.set(false);
        this.messageService.add({ severity: 'error', summary: this.businessError(err, 'financial.commissions.rates.saveError') });
        this.reload();
      },
    });
  }

  private businessError(err: HttpErrorResponse, fallbackKey: string): string {
    const code = (err.error as { errorCode?: string } | null)?.errorCode;
    if (code) {
      const key = `financial.errors.${code}`;
      const translated = this.translate.instant(key);
      if (translated !== key) return translated;
    }
    return this.translate.instant(fallbackKey);
  }
}
