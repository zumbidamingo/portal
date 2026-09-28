import { CommonModule, CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';
import { forkJoin } from 'rxjs';
import { BillingPeriod, PlanFit, PlanLimits, PlanPrice, SubscriptionPlanId } from '../../core/models/subscription.model';
import { PlanId, SubscriptionMe, SubscriptionService } from '../../core/services/subscription.service';
import { AuthService } from '../../core/auth/auth.service';
import { LocalizedDatePipe } from '../../shared/pipes/localized-date.pipe';
import { TagBadgeComponent } from '../../shared/components/tag-badge/tag-badge.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { WhatsAppPacksCardComponent } from './whatsapp-packs-card.component';

/**
 * `PlanLimits` (API) mais o nome traduzido do plano — os tetos vêm de `PlanPolicy` no backend,
 * nunca copiados à mão aqui.
 */
interface PlanCard extends PlanLimits {
  id: PlanId;
  nameKey: string;
}

const UNLIMITED = -1;

const PLAN_RANK: Record<SubscriptionPlanId, number> = { SUSPENSO: 0, ESSENCIAL: 1, PROFISSIONAL: 2, INTELIGENCIA: 3 };

const PLAN_NAME_KEYS: Record<PlanId, string> = {
  ESSENCIAL: 'subscription.plans.essencial',
  PROFISSIONAL: 'subscription.plans.profissional',
  INTELIGENCIA: 'subscription.plans.inteligencia',
};

interface FeatureLine {
  icon: string;
  key: string;
  params?: Record<string, string | number>;
}

interface LostFeature {
  icon: string;
  key: string;
  params?: Record<string, string | number>;
}

function toCard(limits: PlanLimits): PlanCard {
  return { ...limits, id: limits.plan as PlanId, nameKey: PLAN_NAME_KEYS[limits.plan as PlanId] };
}

function planFeatures(card: PlanCard, showWhatsApp: boolean): FeatureLine[] {
  const lines: FeatureLine[] = [
    { icon: 'pi-user', key: 'subscription.plans.adminUsers', params: { count: card.adminUsers } },
    { icon: 'pi-users', key: 'subscription.plans.fieldUsers', params: { count: card.fieldUsers } },
    {
      icon: 'pi-briefcase',
      key: card.ordersPerMonth === UNLIMITED ? 'subscription.plans.ordersUnlimited' : 'subscription.plans.ordersPerMonth',
      params: card.ordersPerMonth === UNLIMITED ? undefined : { count: card.ordersPerMonth },
    },
    { icon: 'pi-building', key: 'subscription.plans.maxUnits', params: { count: card.maxUnits } },
    { icon: 'pi-map', key: card.routeOptimization ? 'subscription.plans.routeOptimizationYes' : 'subscription.plans.routeOptimizationNo' },
    { icon: 'pi-inbox', key: card.laundryModule ? 'subscription.plans.laundryModuleYes' : 'subscription.plans.laundryModuleNo' },
    { icon: 'pi-history', key: card.fullHistory ? 'subscription.plans.fullHistoryYes' : 'subscription.plans.fullHistoryNo' },
    {
      icon: 'pi-sparkles',
      key: card.aiCreditsPerMonth > 0 ? 'subscription.plans.aiCreditsYes' : 'subscription.plans.aiCreditsNo',
      params: card.aiCreditsPerMonth > 0 ? { count: card.aiCreditsPerMonth } : undefined,
    },
    { icon: 'pi-code', key: card.publicApi ? 'subscription.plans.publicApiYes' : 'subscription.plans.publicApiNo' },
  ];
  // Não anunciar uma quota de um canal que não está ligado (regra: nunca UI que só aparenta funcionar).
  if (showWhatsApp) {
    const publicApiAt = lines.length - 1;
    lines.splice(publicApiAt, 0, { icon: 'pi-whatsapp', ...whatsAppFeature(card.whatsAppMessagesPerMonth) });
  }
  return lines;
}

function whatsAppFeature(limit: number): { key: string; params?: Record<string, number> } {
  if (limit === UNLIMITED) return { key: 'subscription.plans.whatsAppPerMonthUnlimited' };
  if (limit === 0) return { key: 'subscription.plans.whatsAppPerMonthNone' };
  return { key: 'subscription.plans.whatsAppPerMonth', params: { count: limit } };
}

@Component({
  selector: 'app-subscription',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslatePipe, ButtonModule, TagModule, SkeletonModule, DialogModule, LocalizedDatePipe, CurrencyPipe, TagBadgeComponent, PageHeaderComponent, WhatsAppPacksCardComponent],
  template: `
    <div class="space-y-6 max-w-5xl">
      <app-page-header [title]="'subscription.title' | translate" [description]="'subscription.subtitle' | translate"
                       [breadcrumb]="breadcrumb()"></app-page-header>

      @if (!loading() && currentPlan() === 'INTELIGENCIA' && !showAllPlans()) {
        <div class="bg-app-bg border border-app-accent rounded-xl overflow-hidden">
          <div class="bg-app-accent-soft px-6 py-6 sm:px-8 sm:py-8">
            <div class="flex flex-wrap items-center justify-between gap-4">
              <div class="flex items-center gap-3">
                <div class="w-12 h-12 rounded-full bg-app-bg flex items-center justify-center shrink-0 border border-app-border">
                  <i class="pi pi-crown text-app-accent-hover text-2xl" aria-hidden="true"></i>
                </div>
                <div>
                  <div class="flex items-center gap-2 flex-wrap">
                    <h2 class="text-xl font-bold text-app-text">{{ 'subscription.plans.inteligencia' | translate }}</h2>
                    <app-tag-badge [value]="'subscription.statusActive' | translate" severity="success"></app-tag-badge>
                  </div>
                  <p class="text-app-text-secondary text-sm mt-0.5">{{ 'subscription.heroSubtitle' | translate }}</p>
                </div>
              </div>
              @if (findPrice('INTELIGENCIA'); as price) {
                <div class="text-right">
                  <p class="text-3xl font-bold text-app-text">{{ price.price | currency:price.currency:'symbol':'1.2-2' }}</p>
                  <p class="text-app-text-secondary text-sm">/{{ (billingPeriod() === 'YEARLY' ? 'subscription.plans.perYear' : 'subscription.plans.perMonth') | translate }}</p>
                </div>
              }
            </div>
          </div>

          <div class="p-6 sm:p-8 space-y-6">
            <div>
              <h3 class="text-xs font-semibold text-app-text-tertiary uppercase tracking-wide mb-3">{{ 'subscription.usageTitle' | translate }}</h3>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                @for (u of usageStats(); track u.labelKey) {
                  <div class="bg-app-surface rounded-lg p-4">
                    <div class="flex items-center gap-2 text-app-text-secondary text-xs mb-1">
                      <i [class]="'pi ' + u.icon" aria-hidden="true"></i>
                      {{ u.labelKey | translate }}
                    </div>
                    <p class="text-lg font-bold text-app-text">
                      {{ u.used }}
                      <span class="text-sm font-normal text-app-text-tertiary">
                        / {{ u.limit === -1 ? ('subscription.usage.unlimited' | translate) : u.limit }}
                      </span>
                    </p>
                  </div>
                }
              </div>
            </div>

            <div>
              <h3 class="text-xs font-semibold text-app-text-tertiary uppercase tracking-wide mb-3">{{ 'subscription.benefitsTitle' | translate }}</h3>
              <ul class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm text-app-text-secondary">
                @for (line of heroBenefits(); track line.key) {
                  <li><i class="pi pi-check text-app-success mr-2" aria-hidden="true"></i>{{ line.key | translate:line.params }}</li>
                }
              </ul>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-app-border">
              <p class="text-xs text-app-text-tertiary">{{ 'subscription.manageHint' | translate }}</p>
              <p-button [label]="'subscription.manage' | translate" icon="pi pi-cog" (click)="openPortal()" [loading]="portalLoading()"></p-button>
            </div>
          </div>
        </div>
      }

      @if (onTrial(); as trialEnd) {
        <div class="bg-app-warning/10 border border-app-warning/30 rounded-lg p-4 flex items-center gap-3">
          <i class="pi pi-clock text-app-warning text-xl" aria-hidden="true"></i>
          <p class="text-sm text-app-text">
            {{ 'subscription.trialBanner' | translate:{ date: (trialEnd | localizedDate) } }}
          </p>
        </div>
      }

      @if (trialExhausted()) {
        <div class="bg-app-surface border border-app-border rounded-lg p-4 flex items-center gap-3">
          <i class="pi pi-info-circle text-app-text-tertiary text-xl" aria-hidden="true"></i>
          <p class="text-sm text-app-text-secondary">{{ 'subscription.trialExhausted' | translate }}</p>
        </div>
      }

      @if (currentPlanYearlySavings(); as savings) {
        <div class="bg-app-accent-soft border border-app-accent/30 rounded-lg p-4 flex items-center gap-3">
          <i class="pi pi-percentage text-app-accent-hover text-xl" aria-hidden="true"></i>
          <p class="text-sm text-app-text">
            {{ 'subscription.yearlyBanner' | translate:{ pct: savings.pct, amount: (savings.amount | currency:savings.currency:'symbol':'1.2-2') } }}
          </p>
        </div>
      }

      @if (!loading() && currentPlan() === 'INTELIGENCIA') {
        <div class="flex justify-end">
          @if (showAllPlans()) {
            <p-button [label]="'subscription.hideOtherPlans' | translate" [text]="true" icon="pi pi-eye-slash" (click)="showAllPlans.set(false)"></p-button>
          } @else {
            <p-button [label]="'subscription.viewOtherPlans' | translate" [text]="true" icon="pi pi-list" (click)="showAllPlans.set(true)"></p-button>
          }
        </div>
      }

      @if (pricesError()) {
        <div class="bg-app-danger/10 border border-app-danger/30 rounded-lg p-4 flex items-center gap-3">
          <i class="pi pi-exclamation-circle text-app-danger text-xl" aria-hidden="true"></i>
          <p class="text-sm text-app-text">{{ 'subscription.pricesLoadError' | translate }}</p>
        </div>
      }

      @if (showPlanGrid()) {

      @if (!pricesError() && !loading()) {
        <div class="flex justify-center">
          <div class="inline-flex rounded-lg bg-app-surface p-1 gap-1" role="group" [attr.aria-label]="'subscription.plans.perMonth' | translate">
            <button type="button"
                    [attr.aria-pressed]="billingPeriod() === 'MONTHLY'"
                    class="px-4 py-1.5 rounded-md cursor-pointer text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-app-accent focus-visible:ring-offset-2"
                    [class]="billingPeriod() === 'MONTHLY' ? 'bg-app-bg text-app-text' : 'text-app-text-secondary hover:text-app-text'"
                    (click)="billingPeriod.set('MONTHLY')">
              {{ 'subscription.plans.perMonth' | translate }}
            </button>
            <button type="button"
                    [attr.aria-pressed]="billingPeriod() === 'YEARLY'"
                    class="px-4 py-1.5 rounded-md cursor-pointer text-sm font-medium transition-colors flex items-center gap-1.5 outline-none focus-visible:ring-2 focus-visible:ring-app-accent focus-visible:ring-offset-2"
                    [class]="billingPeriod() === 'YEARLY' ? 'bg-app-bg text-app-text' : 'text-app-text-secondary hover:text-app-text'"
                    (click)="billingPeriod.set('YEARLY')">
              {{ 'subscription.plans.perYear' | translate }}
              @if (yearlySavingsPct(); as pct) {
                <span class="bg-app-accent-soft text-app-accent-hover text-xs font-semibold px-1.5 py-0.5 rounded">-{{ pct }}%</span>
              }
            </button>
          </div>
        </div>
      }

      @if (!pricesError()) {
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        @if (loading()) {
          @for (i of [1,2,3]; track i) {
            <div class="bg-app-bg border border-app-border rounded-xl p-6">
              <p-skeleton height="280px"></p-skeleton>
            </div>
          }
        } @else {
          @for (card of cards(); track card.id) {
            <div class="relative bg-app-bg rounded-xl p-6 flex flex-col gap-4"
                 [class]="card.highlight ? 'border-2 border-app-accent' : 'border border-app-border'">
              @if (card.highlight) {
                <span class="absolute -top-3 left-1/2 -translate-x-1/2 bg-app-accent-soft text-app-accent-hover text-xs font-semibold px-3 py-1 rounded-full border border-app-accent/30">
                  {{ 'subscription.mostPopular' | translate }}
                </span>
              }
              @if (isCurrentPlan(card.id)) {
                <app-tag-badge [value]="'subscription.currentPlan' | translate" severity="success"></app-tag-badge>
              }
              <h2 class="text-xl font-bold text-app-text">{{ card.nameKey | translate }}</h2>

              @if (findPrice(card.id); as price) {
                <p class="text-3xl font-bold text-app-text">
                  {{ price.price | currency:price.currency:'symbol':'1.2-2' }}
                  <span class="text-sm font-normal text-app-text-secondary">/{{ (billingPeriod() === 'YEARLY' ? 'subscription.plans.perYear' : 'subscription.plans.perMonth') | translate }}</span>
                </p>
              } @else {
                <p class="text-sm text-app-text-tertiary">{{ 'subscription.plans.priceUnavailable' | translate }}</p>
              }

              <ul class="text-sm text-app-text-secondary space-y-2 flex-1">
                @for (line of cardFeatures(card); track line.key) {
                  <li><i [class]="'pi ' + line.icon + ' text-app-text-tertiary mr-2'" aria-hidden="true"></i>{{ line.key | translate:line.params }}</li>
                }
              </ul>

              @if (isCurrentPlan(card.id)) {
                <p-button [label]="'subscription.manage' | translate" fluid icon="pi pi-cog"
                          (click)="openPortal()" [loading]="portalLoading()"></p-button>
              } @else if (isDowngrade(card.id)) {
                <p-button [label]="'subscription.downgrade' | translate" fluid [outlined]="true" severity="danger" icon="pi pi-arrow-down"
                          (click)="startDowngrade(card)"></p-button>
              } @else {
                <p-button [label]="'subscription.upgrade' | translate" fluid icon="pi pi-crown"
                          (click)="checkout(card.id)" [loading]="checkingOutPlan() === card.id"></p-button>
              }
            </div>
          }
        }
      </div>
      }

      }

      <!-- O backend só devolve o saldo com o canal WhatsApp ligado; desligado, não há o que mostrar nem vender. -->
      @if (!loading() && me()?.usage?.whatsApp; as whatsApp) {
        <app-whatsapp-packs-card [usage]="whatsApp"></app-whatsapp-packs-card>
      }

      @if (pendingDowngrade(); as target) {
        <p-dialog [visible]="true" [modal]="true" [dismissableMask]="true" [closable]="true"
                  [header]="'subscription.downgradeDialogTitle' | translate" styleClass="w-full max-w-md" (onHide)="cancelDowngrade()">
          <div class="space-y-4 pt-2">
            <div class="flex items-start gap-3 bg-app-warning/10 border border-app-warning/30 rounded-lg p-4">
              <i class="pi pi-exclamation-triangle text-app-warning text-xl mt-0.5" aria-hidden="true"></i>
              <p class="text-sm text-app-text">
                {{ 'subscription.downgradeWarning' | translate:{ plan: planName(currentPlan()) } }}
              </p>
            </div>
            <ul class="text-sm text-app-text-secondary space-y-2">
              @for (loss of lostFeatures(target); track loss.key) {
                <li class="flex items-center gap-2">
                  <i [class]="'pi ' + loss.icon" class="text-app-danger" aria-hidden="true"></i>
                  {{ loss.key | translate:loss.params }}
                </li>
              }
            </ul>

            @if (downgradeFitLoading()) {
              <p class="text-sm text-app-text-secondary flex items-center gap-2">
                <i class="pi pi-spin pi-spinner" aria-hidden="true"></i>{{ 'subscription.downgradeFitChecking' | translate }}
              </p>
            } @else if (downgradeFit(); as fit) {
              @if (!fit.fits) {
                <div class="bg-app-danger/10 border border-app-danger/30 rounded-lg p-4 space-y-1">
                  <p class="text-sm font-medium text-app-text">{{ 'subscription.downgradeBlocked' | translate }}</p>
                  <ul class="text-sm text-app-text-secondary space-y-1">
                    @if (fit.administrativeExcess > 0) {
                      <li>{{ 'subscription.downgradeBlockedAdmin' | translate:{ count: fit.administrativeExcess } }}</li>
                    }
                    @if (fit.fieldExcess > 0) {
                      <li>{{ 'subscription.downgradeBlockedField' | translate:{ count: fit.fieldExcess } }}</li>
                    }
                  </ul>
                </div>
              }
            }

            <div class="flex justify-end gap-2 pt-2">
              <p-button [label]="'subscription.downgradeCancel' | translate" [text]="true" (click)="cancelDowngrade()"></p-button>
              <p-button [label]="'subscription.downgradeConfirm' | translate" styleClass="p-button-danger" icon="pi pi-arrow-down"
                        [disabled]="downgradeFitLoading() || !downgradeFit()?.fits"
                        (click)="confirmDowngrade()" [loading]="checkingOutPlan() === target.id"></p-button>
            </div>
          </div>
        </p-dialog>
      }
    </div>
  `
})
export class SubscriptionComponent implements OnInit {
  private subService = inject(SubscriptionService);
  private messageService = inject(MessageService);
  private translate = inject(TranslateService);
  private auth = inject(AuthService);

  breadcrumb = computed(() => {
    const role = this.auth.userRole();
    return role === 'OWNER' || role === 'ADMIN'
      ? [{ label: this.translate.instant('nav.administration'), route: '/administration' }]
      : [];
  });

  cards = signal<PlanCard[]>([]);
  me = signal<SubscriptionMe | null>(null);
  prices = signal<PlanPrice[]>([]);
  loading = signal(true);
  pricesError = signal(false);
  billingPeriod = signal<BillingPeriod>('YEARLY');
  checkingOutPlan = signal<PlanId | null>(null);
  portalLoading = signal(false);
  showAllPlans = signal(false);
  pendingDowngrade = signal<PlanCard | null>(null);
  /** Excedente real de utilizadores no plano visado pelo downgrade em curso, ou `null` enquanto carrega. */
  downgradeFit = signal<PlanFit | null>(null);
  downgradeFitLoading = signal(false);

  onTrial = computed(() => {
    const me = this.me();
    if (!me?.trialEndsAt || me.plan === 'INTELIGENCIA') return null;
    return new Date(me.trialEndsAt) > new Date() ? me.trialEndsAt : null;
  });

  /**
   * Conta sem trial disponível. Sem esta explicação, quem recriou a conta e não recebeu a
   * degustação lê a ausência como avaria e abre um pedido de suporte.
   */
  trialExhausted = computed(() => {
    const me = this.me();
    return !!me && me.plan === 'SUSPENSO' && me.trialAlreadyUsed;
  });

  currentPlan = computed<SubscriptionPlanId>(() => this.me()?.plan ?? 'SUSPENSO');

  showPlanGrid = computed(() => !(this.currentPlan() === 'INTELIGENCIA' && !this.showAllPlans()));

  usageStats = computed(() => {
    const me = this.me();
    if (!me) return [];
    return [
      { icon: 'pi-user', labelKey: 'subscription.usage.adminUsers', used: me.usage.adminUsers.used, limit: me.usage.adminUsers.limit },
      { icon: 'pi-users', labelKey: 'subscription.usage.fieldUsers', used: me.usage.fieldUsers.used, limit: me.usage.fieldUsers.limit },
      { icon: 'pi-building', labelKey: 'subscription.usage.units', used: me.usage.units.used, limit: me.usage.units.limit },
      // IA fechada (limite 0) não mostra barra: 0 de 0 não diz nada além do que o cartão do plano já diz.
      ...(me.usage.aiCredits.limit !== 0
        ? [{ icon: 'pi-sparkles', labelKey: 'subscription.usage.aiCredits', used: me.usage.aiCredits.used, limit: me.usage.aiCredits.limit }]
        : []),
    ];
  });

  heroBenefits = computed(() => {
    const card = this.cards().find(c => c.id === 'INTELIGENCIA');
    return card ? planFeatures(card, this.whatsAppOn()) : [];
  });

  /** O canal WhatsApp está ligado nesta instalação — o backend só devolve o saldo nesse caso. */
  whatsAppOn = computed(() => !!this.me()?.usage?.whatsApp);

  ngOnInit() {
    forkJoin({
      me: this.subService.getMe(),
      prices: this.subService.getPlans(),
      limits: this.subService.getPlanLimits()
    }).subscribe({
      next: ({ me, prices, limits }) => {
        this.me.set(me);
        this.prices.set(prices);
        this.cards.set(limits.map(toCard));
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.pricesError.set(true);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('subscription.pricesLoadError') });
      }
    });
  }

  cardFeatures(card: PlanCard): FeatureLine[] {
    return planFeatures(card, this.whatsAppOn());
  }

  findPrice(planId: PlanId): PlanPrice | undefined {
    return this.prices().find(p => p.plan === planId && p.billingPeriod === this.billingPeriod());
  }

  yearlySavingsPct(): number | null {
    const monthly = this.prices().find(p => p.plan === 'ESSENCIAL' && p.billingPeriod === 'MONTHLY');
    const yearly = this.prices().find(p => p.plan === 'ESSENCIAL' && p.billingPeriod === 'YEARLY');
    if (!monthly || !yearly || monthly.price <= 0) return null;
    const fullYearPrice = monthly.price * 12;
    const pct = Math.round((1 - yearly.price / fullYearPrice) * 100);
    return pct > 0 ? pct : null;
  }

  currentPlanYearlySavings(): { pct: number; amount: number; currency: string } | null {
    const me = this.me();
    if (!me || me.billingPeriod !== 'YEARLY' || !me.plan || me.plan === 'SUSPENSO') return null;
    const monthly = this.prices().find(p => p.plan === me.plan && p.billingPeriod === 'MONTHLY');
    const yearly = this.prices().find(p => p.plan === me.plan && p.billingPeriod === 'YEARLY');
    if (!monthly || !yearly || monthly.price <= 0) return null;
    const fullYearPrice = monthly.price * 12;
    const amount = fullYearPrice - yearly.price;
    const pct = Math.round((amount / fullYearPrice) * 100);
    return pct > 0 ? { pct, amount, currency: yearly.currency } : null;
  }

  /**
   * Plano contratado, nunca o efetivo: durante o trial o `effectivePlan` do backend é
   * INTELIGENCIA sem que nada tenha sido assinado, e marcá-lo como atual dava dois planos
   * atuais no mesmo ecrã.
   */
  isCurrentPlan(planId: PlanId): boolean {
    return this.currentPlan() === planId;
  }

  isDowngrade(planId: PlanId): boolean {
    return PLAN_RANK[planId] < PLAN_RANK[this.currentPlan()];
  }

  planName(planId: SubscriptionPlanId): string {
    const card = this.cards().find(c => c.id === planId);
    return card ? this.translate.instant(card.nameKey) : planId;
  }

  /**
   * SUSPENSO nunca é vendido, portanto nunca é o `target` de um downgrade: a única saída da
   * operação para SUSPENSO é cancelar no portal Stripe, fora deste fluxo.
   */
  lostFeatures(target: PlanCard): LostFeature[] {
    const current = this.cards().find(c => c.id === this.currentPlan());
    if (!current) return [];
    const items: LostFeature[] = [];

    if (target.adminUsers < current.adminUsers) {
      items.push({ icon: 'pi-user', key: 'subscription.downgradeLoss.adminUsers', params: { count: target.adminUsers } });
    }
    if (target.fieldUsers < current.fieldUsers) {
      items.push({ icon: 'pi-users', key: 'subscription.downgradeLoss.fieldUsers', params: { count: target.fieldUsers } });
    }
    if (current.ordersPerMonth === UNLIMITED && target.ordersPerMonth !== UNLIMITED) {
      items.push({ icon: 'pi-briefcase', key: 'subscription.downgradeLoss.orders', params: { count: target.ordersPerMonth } });
    } else if (target.ordersPerMonth !== UNLIMITED && target.ordersPerMonth < current.ordersPerMonth) {
      items.push({ icon: 'pi-briefcase', key: 'subscription.downgradeLoss.orders', params: { count: target.ordersPerMonth } });
    }
    if (target.maxUnits < current.maxUnits) {
      items.push({ icon: 'pi-building', key: 'subscription.downgradeLoss.maxUnits', params: { count: target.maxUnits } });
    }
    if (current.routeOptimization && !target.routeOptimization) {
      items.push({ icon: 'pi-map', key: 'subscription.downgradeLoss.routeOptimization' });
    }
    if (current.laundryModule && !target.laundryModule) {
      items.push({ icon: 'pi-inbox', key: 'subscription.downgradeLoss.laundryModule' });
    }
    if (current.fullHistory && !target.fullHistory) {
      items.push({ icon: 'pi-history', key: 'subscription.downgradeLoss.fullHistory' });
    }
    if (current.aiCreditsPerMonth > 0 && target.aiCreditsPerMonth === 0) {
      items.push({ icon: 'pi-sparkles', key: 'subscription.downgradeLoss.aiCredits' });
    }
    if (current.publicApi && !target.publicApi) {
      items.push({ icon: 'pi-code', key: 'subscription.downgradeLoss.publicApi' });
    }
    return items;
  }

  /**
   * Abre o diálogo já com o excedente real de utilizadores — não o diff estático dos cartões —
   * para o cliente saber, antes de ir ao Stripe, quantas pessoas tem de desativar.
   */
  startDowngrade(card: PlanCard) {
    this.pendingDowngrade.set(card);
    this.downgradeFit.set(null);
    this.downgradeFitLoading.set(true);
    this.subService.checkFit(card.id).subscribe({
      next: fit => {
        this.downgradeFit.set(fit);
        this.downgradeFitLoading.set(false);
      },
      error: () => {
        this.downgradeFitLoading.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('subscription.downgradeFitError') });
      }
    });
  }

  cancelDowngrade() {
    this.pendingDowngrade.set(null);
    this.downgradeFit.set(null);
  }

  confirmDowngrade() {
    const target = this.pendingDowngrade();
    if (!target || !this.downgradeFit()?.fits) return;
    this.pendingDowngrade.set(null);
    this.checkout(target.id);
  }

  checkout(plan: PlanId) {
    this.checkingOutPlan.set(plan);
    const successUrl = `${window.location.origin}/dashboard`;
    const cancelUrl = `${window.location.origin}/subscription`;
    this.subService.checkout(plan, this.billingPeriod(), successUrl, cancelUrl).subscribe({
      next: res => { window.location.href = res.url; },
      error: () => {
        this.messageService.add({ severity: 'error', summary: this.translate.instant('subscription.checkoutError') });
        this.checkingOutPlan.set(null);
      }
    });
  }

  openPortal() {
    this.portalLoading.set(true);
    const returnUrl = `${window.location.origin}/subscription`;
    this.subService.openPortal(returnUrl).subscribe({
      next: res => { window.location.href = res.url; },
      error: () => {
        this.messageService.add({ severity: 'error', summary: this.translate.instant('subscription.portalError') });
        this.portalLoading.set(false);
      }
    });
  }
}
