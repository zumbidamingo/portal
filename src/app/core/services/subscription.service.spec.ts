import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { beforeEach, describe, expect, it } from 'vitest';
import { SubscriptionMe, SubscriptionService } from './subscription.service';
import { SubscriptionPlanId } from '../models/subscription.model';

function me(plan: SubscriptionPlanId, effectivePlan: SubscriptionPlanId): SubscriptionMe {
  return { plan, effectivePlan } as SubscriptionMe;
}

describe('SubscriptionService.planLabelKey', () => {
  let service: SubscriptionService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    service = TestBed.inject(SubscriptionService);
  });

  it('is empty before the subscription loads', () => {
    expect(service.planLabelKey()).toBe('');
  });

  it('shows trial, not suspended, while a trial covers the unsigned tenant', () => {
    service.me.set(me('SUSPENSO', 'INTELIGENCIA'));
    expect(service.planLabelKey()).toBe('trial');
  });

  it('shows suspended only when persisted and effective plans are both suspended', () => {
    service.me.set(me('SUSPENSO', 'SUSPENSO'));
    expect(service.planLabelKey()).toBe('suspenso');
  });

  it('shows the contracted plan, even during a trial', () => {
    service.me.set(me('ESSENCIAL', 'INTELIGENCIA'));
    expect(service.planLabelKey()).toBe('essencial');
    service.me.set(me('PROFISSIONAL', 'PROFISSIONAL'));
    expect(service.planLabelKey()).toBe('profissional');
    service.me.set(me('INTELIGENCIA', 'INTELIGENCIA'));
    expect(service.planLabelKey()).toBe('inteligencia');
  });
});
