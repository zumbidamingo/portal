import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ServiceService } from '../../core/services/catalog.service';
import { CustomerService } from '../../core/services/customer.service';
import { OnboardingStep, Tenant, TenantService } from '../../core/services/tenant.service';
import { OnboardingCompanyStepComponent } from './steps/company-step.component';
import { OnboardingCatalogStepComponent } from './steps/catalog-step.component';
import { OnboardingCustomerStepComponent } from './steps/customer-step.component';
import { OnboardingTeamStepComponent } from './steps/team-step.component';
import { BrandLogoComponent } from '../../shared/components/brand-logo/brand-logo.component';

interface StepDefinition {
  id: OnboardingStep;
  icon: string;
  /** Prefixo das chaves i18n `onboarding.steps.<key>.*`. */
  key: string;
}

/** Ordem em que o dono percorre o onboarding — espelha `OnboardingStep` no backend. */
const STEPS: StepDefinition[] = [
  { id: 'COMPANY', icon: 'pi-building', key: 'company' },
  { id: 'CATALOG', icon: 'pi-tag', key: 'catalog' },
  { id: 'CUSTOMER', icon: 'pi-user', key: 'customer' },
  { id: 'TEAM', icon: 'pi-users', key: 'team' },
];

/**
 * Onboarding do primeiro acesso do dono (issue #136): quatro passos curtos, com o progresso
 * guardado no servidor. Nunca é uma barreira — "Configurar depois" leva ao portal e o convite
 * para retomar fica no dashboard.
 *
 * Estrutura: à esquerda a trilha dos passos (o que vem a seguir e porquê), à direita o passo
 * atual. Em ecrã estreito a trilha reduz-se a uma barra de progresso.
 */
@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [BrandLogoComponent, TranslatePipe, ButtonModule, ToastModule,
    OnboardingCompanyStepComponent, OnboardingCatalogStepComponent,
    OnboardingCustomerStepComponent, OnboardingTeamStepComponent],
  providers: [MessageService],
  styles: [`
    @keyframes step-in {
      from { opacity: 0; transform: translateX(16px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    @keyframes step-in-back {
      from { opacity: 0; transform: translateX(-16px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    .step-panel { animation: step-in 240ms cubic-bezier(0.22, 1, 0.36, 1) both; }
    .step-panel.step-back { animation-name: step-in-back; }
    @media (prefers-reduced-motion: reduce) {
      .step-panel, .step-panel.step-back { animation: none; }
    }
  `],
  template: `
    <p-toast position="top-right"></p-toast>

    <div class="min-h-screen bg-app-surface">
      <header class="border-b border-app-border bg-app-bg">
        <div class="max-w-6xl mx-auto px-4 sm:px-8 h-14 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <app-brand-logo variant="wordmark" [size]="25" />
          </div>
          <p-button type="button" [label]="'onboarding.skip' | translate" icon="pi pi-arrow-right" iconPos="right"
                    severity="secondary" [text]="true" size="small" [loading]="leaving()" (onClick)="skip()"></p-button>
        </div>
      </header>

      <main class="max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
        @if (loadError()) {
          <div class="bg-app-bg border border-app-border rounded-xl p-8 text-center max-w-md mx-auto">
            <i class="pi pi-exclamation-circle text-app-danger text-2xl mb-3" aria-hidden="true"></i>
            <p class="text-sm text-app-text mb-4">{{ 'onboarding.loadError' | translate }}</p>
            <p-button type="button" [label]="'common.retry' | translate" severity="secondary" [outlined]="true"
                      (onClick)="load()"></p-button>
          </div>
        } @else if (tenant(); as t) {
          <div class="grid grid-cols-1 lg:grid-cols-[20rem_1fr] gap-4 lg:gap-6 items-stretch">

            <!-- Trilha: em ecrã largo mostra cada passo e o que ele faz; em estreito só o progresso. -->
            <aside class="hidden lg:block bg-app-bg border border-app-border rounded-xl p-6"
                   [attr.aria-label]="'onboarding.railLabel' | translate">
              <p class="text-sm text-app-text-secondary mb-6">{{ 'onboarding.railIntro' | translate }}</p>
              <ol>
                @for (s of steps; track s.id; let i = $index; let last = $last) {
                  <li class="flex gap-3">
                    <div class="flex flex-col items-center">
                      <span class="w-9 h-9 rounded-full border flex items-center justify-center shrink-0"
                            [class.bg-app-accent]="i < current()"
                            [class.border-app-accent]="i <= current()"
                            [class.border-app-border]="i > current()"
                            [class.bg-app-bg]="i >= current()">
                        @if (i < current()) {
                          <i class="pi pi-check text-xs text-app-action-text" aria-hidden="true"></i>
                        } @else {
                          <i class="pi {{ s.icon }} text-sm" aria-hidden="true"
                             [class.text-app-accent]="i === current()"
                             [class.text-app-text-tertiary]="i > current()"></i>
                        }
                      </span>
                      @if (!last) {
                        <span class="w-px flex-1 my-1 min-h-6" [class.bg-app-accent]="i < current()" [class.bg-app-border]="i >= current()"></span>
                      }
                    </div>
                    <button type="button" class="text-left pb-6 flex-1 min-w-0 disabled:cursor-default"
                            [disabled]="i > reached()" [attr.aria-current]="i === current() ? 'step' : null"
                            (click)="go(i)">
                      <span class="block text-sm font-semibold" [class.text-app-text]="i <= reached()"
                            [class.text-app-text-tertiary]="i > reached()">
                        {{ 'onboarding.steps.' + s.key + '.title' | translate }}
                      </span>
                      <span class="block text-xs text-app-text-tertiary mt-0.5">
                        {{ 'onboarding.steps.' + s.key + '.rail' | translate }}
                      </span>
                    </button>
                  </li>
                }
              </ol>
            </aside>

            <section class="bg-app-bg border border-app-border rounded-xl p-5 sm:p-8 flex flex-col min-h-[32rem]">
              <div class="lg:hidden mb-5" role="progressbar" [attr.aria-valuenow]="current() + 1" aria-valuemin="1" [attr.aria-valuemax]="steps.length">
                <div class="h-1 rounded-full bg-app-border overflow-hidden">
                  <div class="h-full bg-app-accent transition-all" [style.width.%]="((current() + 1) / steps.length) * 100"></div>
                </div>
              </div>

              <!-- Um wrapper novo por passo (track por id) para a animação de entrada correr a cada troca. -->
              @for (step of [active()]; track step.id) {
              <div class="step-panel flex flex-col flex-1" [class.step-back]="direction() === 'back'">
              <p class="text-[11px] font-medium uppercase tracking-wide text-app-accent mb-2">
                {{ 'onboarding.stepOf' | translate: { current: current() + 1, total: steps.length } }}
              </p>
              <h1 class="text-2xl font-semibold text-app-text mb-2">
                {{ 'onboarding.steps.' + active().key + '.heading' | translate }}
              </h1>
              <p class="text-sm text-app-text-secondary mb-6 max-w-2xl">
                {{ 'onboarding.steps.' + active().key + '.description' | translate }}
              </p>

              @switch (active().id) {
                @case ('COMPANY') {
                  <app-onboarding-company-step [tenant]="t" (saved)="onSaved($event, 1)"></app-onboarding-company-step>
                }
                @case ('CATALOG') {
                  <app-onboarding-catalog-step [tenant]="t" (next)="go(2)" (back)="go(0)"></app-onboarding-catalog-step>
                }
                @case ('CUSTOMER') {
                  <app-onboarding-customer-step [tenant]="t" (next)="go(3)" (back)="go(1)"></app-onboarding-customer-step>
                }
                @case ('TEAM') {
                  <app-onboarding-team-step [hasService]="hasService()" [hasCustomer]="hasCustomer()"
                                            (goStep)="go($event)" (finish)="finish()" (back)="go(2)"></app-onboarding-team-step>
                }
              }
              </div>
              }
            </section>
          </div>
          <p class="text-xs text-app-text-tertiary text-center mt-4">{{ 'onboarding.skipHint' | translate }}</p>
        }
      </main>
    </div>
  `,
})
export class OnboardingComponent implements OnInit {
  private tenantService = inject(TenantService);
  private router = inject(Router);
  private messageService = inject(MessageService);
  private translate = inject(TranslateService);
  private serviceService = inject(ServiceService);
  private customerService = inject(CustomerService);

  readonly steps = STEPS;

  tenant = signal<Tenant | null>(null);
  loadError = signal(false);
  leaving = signal(false);
  current = signal(0);
  /** Sentido da última troca de passo — decide de que lado o painel entra. */
  direction = signal<'forward' | 'back'>('forward');
  /** Passo mais avançado a que o dono já chegou — só esses ficam clicáveis na trilha. */
  reached = signal(0);
  /** Do que o primeiro orçamento precisa: um serviço ativo e um cliente. */
  hasService = signal(false);
  hasCustomer = signal(false);
  active = computed(() => STEPS[this.current()]);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loadError.set(false);
    this.tenantService.getMe().subscribe({
      next: tenant => {
        if (!tenant.onboarding || tenant.onboarding.status === 'COMPLETED') {
          this.router.navigateByUrl('/dashboard');
          return;
        }
        const index = Math.max(STEPS.findIndex(s => s.id === tenant.onboarding!.step), 0);
        this.tenant.set(tenant);
        this.current.set(index);
        this.reached.set(index);
        // Reabrir depois de dispensar (ou a primeira visita) passa a "em curso" no servidor.
        if (tenant.onboarding.status !== 'IN_PROGRESS') this.persist(index);
        this.refreshReadiness();
      },
      error: () => this.loadError.set(true),
    });
  }

  /** Um passo gravou os dados da empresa: guarda a versão nova e avança. */
  onSaved(updated: Tenant, nextIndex: number): void {
    this.tenant.set(updated);
    this.go(nextIndex);
  }

  go(index: number): void {
    if (index < 0 || index >= STEPS.length || index > this.reached() + 1) return;
    this.direction.set(index < this.current() ? 'back' : 'forward');
    this.current.set(index);
    this.reached.set(Math.max(this.reached(), index));
    this.persist(index);
    this.refreshReadiness();
  }

  private refreshReadiness(): void {
    this.serviceService.list({ active: true, size: 1 }).subscribe({
      next: page => this.hasService.set(page.page.totalElements > 0),
      error: () => {},
    });
    this.customerService.list({ active: true, size: 1 }).subscribe({
      next: page => this.hasCustomer.set(page.page.totalElements > 0),
      error: () => {},
    });
  }

  /** O progresso é conveniência: falhar a guardá-lo nunca deve travar quem está a configurar. */
  private persist(index: number): void {
    const id = this.tenant()?.id;
    if (!id) return;
    this.tenantService.updateOnboarding(id, { status: 'IN_PROGRESS', step: STEPS[index].id }).subscribe({
      next: updated => this.tenant.set(updated),
      error: () => {},
    });
  }

  skip(): void {
    this.leave('DISMISSED');
  }

  /** Com serviço e cliente prontos, o dono sai direto para o formulário de novo orçamento. */
  finish(): void {
    this.leave('COMPLETED', this.hasService() && this.hasCustomer());
  }

  private leave(status: 'DISMISSED' | 'COMPLETED', toNewQuotation = false): void {
    const id = this.tenant()?.id;
    if (!id || this.leaving()) return;
    this.leaving.set(true);
    this.tenantService.updateOnboarding(id, { status }).subscribe({
      next: () => toNewQuotation
        ? this.router.navigate(['/quotations'], { queryParams: { new: 1 } })
        : this.router.navigateByUrl('/dashboard'),
      error: () => {
        this.leaving.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('onboarding.leaveError') });
      },
    });
  }
}
