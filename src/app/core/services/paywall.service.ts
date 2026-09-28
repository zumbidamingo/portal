import { Injectable, signal } from '@angular/core';

export type PlanLimitType = 'ADMIN_USERS' | 'FIELD_USERS' | 'ORDERS' | 'AI_CREDITS' | 'UNITS';

export interface PaywallDetail {
  limitType: PlanLimitType;
  currentPlan: string;
  limit: number;
  used: number;
}

@Injectable({ providedIn: 'root' })
export class PaywallService {
  readonly detail = signal<PaywallDetail | null>(null);

  show(detail: PaywallDetail) {
    this.detail.set(detail);
  }

  hide() {
    this.detail.set(null);
  }
}
