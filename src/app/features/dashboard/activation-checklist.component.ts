import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ActivationChecklist, ActivationStepKey, DashboardService } from '../../core/services/dashboard.service';
import { TenantService } from '../../core/services/tenant.service';
import { SystemParamsDiscoveryService } from '../../core/services/system-params-discovery.service';

interface StepView {
  key: ActivationStepKey;
  done: boolean;
  link: string;
  icon: string;
}

/** Ecrã onde cada passo se faz. */
const STEP_LINKS: Record<ActivationStepKey, { link: string; icon: string }> = {
  CATALOG: { link: '/catalog/services', icon: 'pi-tag' },
  CUSTOMER: { link: '/customers', icon: 'pi-user' },
  TECHNICIAN: { link: '/providers', icon: 'pi-users' },
  QUOTATION: { link: '/quotations', icon: 'pi-file' },
  ORDER: { link: '/orders', icon: 'pi-check-square' },
};

/**
 * Checklist de ativação (issue #137): acompanha os primeiros dias do dono depois do onboarding
 * (#136) até o ciclo operacional fechar uma volta. O progresso vem do servidor, derivado do que
 * existe na empresa — nada é marcado à mão. Some sozinha quando todos os passos estão feitos, e
 * quem não a quer pode dispensá-la (preferência deste navegador, não bloqueia nada).
 */
@Component({
  selector: 'app-activation-checklist',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  // margin-top do pai (space-y) não age em caixa inline: o host precisa ser block.
  styles: ':host { display: block; }',
  template: `
    @if (visible()) {
      <section class="bg-app-bg border border-app-border rounded-xl p-4" [attr.aria-label]="'activation.title' | translate">
        <div class="flex items-start gap-3">
          <div class="min-w-0 flex-1">
            <h2 class="text-sm font-semibold text-app-text">{{ 'activation.title' | translate }}</h2>
            <p class="text-xs text-app-text-secondary">
              {{ 'activation.progress' | translate: { done: doneCount(), total: steps().length } }}
            </p>
          </div>
          <button type="button" (click)="dismiss()"
                  class="text-app-text-tertiary hover:text-app-text p-1 rounded"
                  [attr.aria-label]="'activation.dismiss' | translate"
                  [title]="'activation.dismiss' | translate">
            <i class="pi pi-times text-xs" aria-hidden="true"></i>
          </button>
        </div>

        <div class="h-1 rounded-full bg-app-border mt-3 overflow-hidden" role="progressbar"
             aria-valuemin="0" [attr.aria-valuemax]="steps().length" [attr.aria-valuenow]="doneCount()">
          <div class="h-full bg-app-accent transition-all duration-300" [style.width.%]="percent()"></div>
        </div>

        <ol class="mt-3">
          @for (step of steps(); track step.key; let i = $index; let first = $first; let last = $last) {
            <li class="flex gap-3">
              <div class="flex flex-col items-center">
                <span class="w-px flex-1" [class]="first ? 'bg-transparent' : steps()[i - 1].done ? 'bg-app-accent' : 'bg-app-border'"></span>
                <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                      [class]="step.done ? 'bg-app-accent text-white' : step.key === nextKey() ? 'bg-app-action text-app-action-text' : 'border border-app-border bg-app-bg text-app-text-secondary'">
                  @if (step.done) {
                    <i class="pi pi-check text-xs" aria-hidden="true"></i>
                  } @else {
                    {{ i + 1 }}
                  }
                </span>
                <span class="w-px flex-1" [class]="last ? 'bg-transparent' : step.done ? 'bg-app-accent' : 'bg-app-border'"></span>
              </div>
              <div class="min-w-0 flex-1 my-2">
                @if (step.done) {
                  <p class="text-sm text-app-text-tertiary line-through py-1">{{ 'activation.steps.' + step.key + '.title' | translate }}</p>
                } @else {
                  <a [routerLink]="step.link"
                     class="flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors hover:bg-app-surface"
                     [class]="step.key === nextKey() ? 'border-app-accent-border bg-app-accent-soft' : 'border-app-border'">
                    <span class="min-w-0 flex-1">
                      <span class="block text-sm font-medium text-app-text">{{ 'activation.steps.' + step.key + '.title' | translate }}</span>
                      <span class="block text-xs text-app-text-secondary">{{ 'activation.steps.' + step.key + '.hint' | translate }}</span>
                    </span>
                    <i class="pi pi-arrow-right text-xs text-app-text-tertiary" aria-hidden="true"></i>
                  </a>
                }
              </div>
            </li>
          }
        </ol>

        <!-- Opcional: fora da contagem e sem marca de "feito" — os padrões já funcionam. -->
        @if (showParamsInvite()) {
          <a routerLink="/administration/system-parameters"
             class="mt-1 flex items-center gap-3 rounded-lg border border-dashed border-app-border px-3 py-2 transition-colors hover:bg-app-surface">
            <i class="pi pi-sliders-v text-sm text-app-text-tertiary" aria-hidden="true"></i>
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-medium text-app-text">
                {{ 'activation.params.title' | translate }}
                <span class="ml-1 rounded bg-app-surface px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-app-text-tertiary">{{ 'activation.params.optional' | translate }}</span>
              </span>
              <span class="block text-xs text-app-text-secondary">{{ 'activation.params.hint' | translate }}</span>
            </span>
            <i class="pi pi-arrow-right text-xs text-app-text-tertiary" aria-hidden="true"></i>
          </a>
        }
      </section>
    }
  `,
})
export class ActivationChecklistComponent implements OnInit {
  private dashboardService = inject(DashboardService);
  private tenantService = inject(TenantService);
  private discovery = inject(SystemParamsDiscoveryService);
  showParamsInvite = this.discovery.showChecklistInvite;

  private checklist = signal<ActivationChecklist | null>(null);
  private dismissed = signal(false);

  steps = computed<StepView[]>(() =>
    (this.checklist()?.steps ?? []).map(s => ({ ...s, ...STEP_LINKS[s.key] })));
  doneCount = computed(() => this.steps().filter(s => s.done).length);
  percent = computed(() => (this.steps().length ? (this.doneCount() / this.steps().length) * 100 : 0));
  nextKey = computed(() => this.steps().find(s => !s.done)?.key);

  /** Só depois do onboarding fechado (senão o cartão de retoma já pede a atenção do dono) e
   *  enquanto houver passo por fazer. */
  visible = computed(() => {
    const checklist = this.checklist();
    const onboarding = this.tenantService.current()?.onboarding?.status;
    return !!checklist && !checklist.complete && !this.dismissed() && onboarding === 'COMPLETED';
  });

  ngOnInit(): void {
    const tenant = this.tenantService.current();
    if (tenant) {
      this.load(tenant.id);
    } else {
      this.tenantService.getMe().subscribe({ next: t => this.load(t.id), error: () => {} });
    }
  }

  dismiss(): void {
    this.dismissed.set(true);
    const id = this.tenantService.current()?.id;
    if (!id) return;
    try {
      localStorage.setItem(this.storageKey(id), '1');
    } catch {
      // sem armazenamento: a dispensa vale só até recarregar
    }
  }

  private load(tenantId: string): void {
    try {
      this.dismissed.set(localStorage.getItem(this.storageKey(tenantId)) === '1');
    } catch {
      this.dismissed.set(false);
    }
    if (this.dismissed()) return;
    this.dashboardService.getActivationChecklist().subscribe({
      next: c => this.checklist.set(c),
      error: () => {},
    });
  }

  private storageKey(tenantId: string): string {
    return `activation-checklist-dismissed:${tenantId}`;
  }
}
