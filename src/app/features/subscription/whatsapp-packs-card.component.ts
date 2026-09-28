import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ProgressBarModule } from 'primeng/progressbar';
import { AuthService } from '../../core/auth/auth.service';
import { WhatsAppPack, WhatsAppUsage, SubscriptionService } from '../../core/services/subscription.service';
import { LocalizedDatePipe } from '../../shared/pipes/localized-date.pipe';

const UNLIMITED = -1;

/**
 * Saldo de mensagens WhatsApp e compra de pacotes avulsos (issue #151). Os avisos "acabando" e
 * "acabou" chegam decididos do backend (`low`/`exhausted`) — esta tela só os desenha. O crédito
 * do pacote nasce no webhook do Stripe, não aqui: ao voltar do pagamento o saldo pode levar
 * instantes a aparecer, e o texto diz isso em vez de prometer o que ainda não aconteceu.
 */
@Component({
  selector: 'app-whatsapp-packs-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, ButtonModule, ProgressBarModule, CurrencyPipe, DecimalPipe, LocalizedDatePipe],
  template: `
    <section class="bg-app-bg border border-app-border rounded-xl p-6 sm:p-8 space-y-5">
      <div class="flex items-center gap-2">
        <i class="pi pi-whatsapp text-app-accent-hover text-xl" aria-hidden="true"></i>
        <h2 class="text-lg font-bold text-app-text">{{ 'subscription.whatsapp.title' | translate }}</h2>
      </div>

      @if (usage().exhausted) {
        <div class="bg-app-danger/10 border border-app-danger/30 rounded-lg p-4 flex items-start gap-3" role="alert">
          <i class="pi pi-exclamation-circle text-app-danger text-xl mt-0.5" aria-hidden="true"></i>
          <p class="text-sm text-app-text">{{ 'subscription.whatsapp.exhaustedWarning' | translate }}</p>
        </div>
      } @else if (usage().low) {
        <div class="bg-app-warning-bg border border-app-warning/30 rounded-lg p-4 flex items-start gap-3" role="status">
          <i class="pi pi-exclamation-triangle text-app-warning text-xl mt-0.5" aria-hidden="true"></i>
          <p class="text-sm text-app-text">{{ 'subscription.whatsapp.lowWarning' | translate }}</p>
        </div>
      }

      <div class="space-y-2">
        @if (unlimited()) {
          <p class="text-sm text-app-text-secondary">{{ 'subscription.whatsapp.unlimited' | translate }}</p>
        } @else {
          <p class="text-lg font-bold text-app-text">
            {{ usage().used | number }}
            <span class="text-sm font-normal text-app-text-tertiary">
              / {{ usage().limit | number }} {{ 'subscription.whatsapp.usedThisCycle' | translate }}
            </span>
          </p>
          @if (usage().limit > 0) {
            <p-progressbar [value]="usagePercent()" [showValue]="false" [attr.aria-label]="'subscription.whatsapp.title' | translate"></p-progressbar>
          }
        }
        @if (usage().packRemaining > 0) {
          <p class="text-sm text-app-text-secondary">
            {{ 'subscription.whatsapp.packBalance' | translate:{ count: usage().packRemaining } }}
            @if (usage().packNextExpiry; as expiry) {
              · {{ 'subscription.whatsapp.packExpires' | translate:{ date: (expiry | localizedDate) } }}
            }
          </p>
        }
      </div>

      @if (packsLoaded() && packs().length > 0) {
        <div class="space-y-3 pt-4 border-t border-app-border">
          <h3 class="text-xs font-semibold text-app-text-tertiary uppercase tracking-wide">{{ 'subscription.whatsapp.packsTitle' | translate }}</h3>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            @for (pack of packs(); track pack.code) {
              <div class="bg-app-surface rounded-lg p-4 flex flex-col gap-2">
                <p class="text-base font-bold text-app-text">{{ 'subscription.whatsapp.packQuantity' | translate:{ count: pack.quantity } }}</p>
                <p class="text-2xl font-bold text-app-text">{{ amount(pack) | currency:pack.currency:'symbol':'1.2-2' }}</p>
                <p class="text-xs text-app-text-tertiary">{{ 'subscription.whatsapp.packValidity' | translate:{ months: pack.validityMonths } }}</p>
                @if (canBuy()) {
                  <p-button [label]="'subscription.whatsapp.buy' | translate" icon="pi pi-shopping-cart"
                            [loading]="buying() === pack.code" [disabled]="buying() !== null"
                            (click)="buy(pack)"></p-button>
                }
              </div>
            }
          </div>
          <p class="text-xs text-app-text-tertiary">{{ 'subscription.whatsapp.packsHint' | translate }}</p>
          @if (!canBuy()) {
            <p class="text-xs text-app-text-tertiary">{{ 'subscription.whatsapp.ownerOnly' | translate }}</p>
          }
        </div>
      }
    </section>
  `,
})
export class WhatsAppPacksCardComponent implements OnInit {
  private subService = inject(SubscriptionService);
  private messageService = inject(MessageService);
  private translate = inject(TranslateService);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);

  readonly usage = input.required<WhatsAppUsage>();

  packs = signal<WhatsAppPack[]>([]);
  packsLoaded = signal(false);
  buying = signal<string | null>(null);

  unlimited = computed(() => this.usage().limit === UNLIMITED);
  canBuy = computed(() => this.auth.userRole() === 'OWNER');

  usagePercent = computed(() => {
    const { used, limit } = this.usage();
    return limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  });

  ngOnInit() {
    this.subService.getWhatsAppPacks().subscribe({
      next: packs => {
        this.packs.set(packs);
        this.packsLoaded.set(true);
      },
      // Sem pacotes o cartão continua a mostrar o saldo; só a compra some, e o erro diz porquê.
      error: () => {
        this.packsLoaded.set(true);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('subscription.whatsapp.packsLoadError') });
      },
    });

    if (this.route.snapshot.queryParamMap.get('whatsappPack') === 'success') {
      this.messageService.add({ severity: 'success', summary: this.translate.instant('subscription.whatsapp.purchaseSuccess') });
    }
  }

  /** O Stripe devolve na menor unidade da moeda; o número de casas vem da própria moeda. */
  amount(pack: WhatsAppPack): number {
    const digits = new Intl.NumberFormat(undefined, { style: 'currency', currency: pack.currency })
      .resolvedOptions().maximumFractionDigits ?? 2;
    return pack.unitAmount / 10 ** digits;
  }

  buy(pack: WhatsAppPack) {
    this.buying.set(pack.code);
    const successUrl = `${window.location.origin}/subscription?whatsappPack=success`;
    const cancelUrl = `${window.location.origin}/subscription`;
    this.subService.checkoutWhatsAppPack(pack.code, successUrl, cancelUrl).subscribe({
      next: res => { window.location.href = res.url; },
      error: () => {
        this.buying.set(null);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('subscription.whatsapp.buyError') });
      },
    });
  }
}
