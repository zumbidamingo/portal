import { Component, inject, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { PaywallService, PlanLimitType } from '../../../core/services/paywall.service';
import { SubscriptionPlanId } from '../../../core/models/subscription.model';

const ICON_BY_LIMIT: Record<PlanLimitType, string> = {
  ADMIN_USERS: 'pi pi-user',
  FIELD_USERS: 'pi pi-users',
  ORDERS: 'pi pi-file',
  AI_CREDITS: 'pi pi-sparkles',
  UNITS: 'pi pi-building',
};

const TITLE_KEY_BY_LIMIT: Record<PlanLimitType, string> = {
  ADMIN_USERS: 'paywall.adminUsersTitle',
  FIELD_USERS: 'paywall.fieldUsersTitle',
  ORDERS: 'paywall.ordersTitle',
  AI_CREDITS: 'paywall.aiCreditsTitle',
  UNITS: 'paywall.unitsTitle',
};

/** Plano seguinte no degrau — o que resolve qualquer teto cheio, seja qual for. */
const NEXT_PLAN: Record<SubscriptionPlanId, SubscriptionPlanId> = {
  SUSPENSO: 'ESSENCIAL',
  ESSENCIAL: 'PROFISSIONAL',
  PROFISSIONAL: 'INTELIGENCIA',
  INTELIGENCIA: 'INTELIGENCIA',
};

@Component({
  selector: 'app-paywall-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslatePipe, DialogModule, ButtonModule],
  template: `
    @if (detail(); as d) {
      <p-dialog [visible]="true" [modal]="true" [dismissableMask]="true" [closable]="true"
                [header]="titleKey() | translate" styleClass="w-full max-w-md" (onHide)="close()">
        <div class="space-y-4 pt-2">
          <div class="flex items-center gap-3">
            <i [class]="icon()" class="text-app-warning text-2xl"></i>
            <p class="text-sm text-app-text-secondary">
              {{ 'paywall.description' | translate:{ used: d.used, limit: d.limit, plan: d.currentPlan } }}
            </p>
          </div>
          <div class="bg-app-accent-soft border border-app-border rounded-lg p-4 text-sm text-app-text">
            {{ 'paywall.upgradeHint' | translate:{ plan: requiredPlan() } }}
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <p-button [label]="'paywall.close' | translate" [text]="true" (click)="close()"></p-button>
            <p-button [label]="'paywall.viewPlans' | translate" icon="pi pi-crown" (click)="goToPlans()"></p-button>
          </div>
        </div>
      </p-dialog>
    }
  `
})
export class PaywallModalComponent {
  private paywallService = inject(PaywallService);
  private router = inject(Router);

  detail = this.paywallService.detail;

  icon = computed(() => {
    const d = this.detail();
    return d ? ICON_BY_LIMIT[d.limitType] : '';
  });

  titleKey = computed(() => {
    const d = this.detail();
    return d ? TITLE_KEY_BY_LIMIT[d.limitType] : '';
  });

  requiredPlan = computed(() => {
    const d = this.detail();
    if (!d) return '';
    return NEXT_PLAN[d.currentPlan as SubscriptionPlanId] ?? 'INTELIGENCIA';
  });

  close() {
    this.paywallService.hide();
  }

  goToPlans() {
    this.paywallService.hide();
    this.router.navigate(['/subscription']);
  }
}
