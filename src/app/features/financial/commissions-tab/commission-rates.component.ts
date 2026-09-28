import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { MessageService } from 'primeng/api';
import { FinancialService, ProviderRate } from '../../../core/services/financial.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { CommissionExplainerService } from './commission-explainer.service';

/** Valor de referência do exemplo ao vivo ("num serviço de R$ 100,00, João recebe R$ 10,00"). */
const EXAMPLE_BASE = 100;

/**
 * "Quanto cada prestador ganha" — uma frase por prestador, um número para confirmar. Sem tipos de
 * regra, vigências ou tabelas: o dono escolhe um percentual, vê um exemplo com dinheiro de verdade
 * e o SuaOperacao passa a calcular sozinho. Serviços já realizados que aguardavam esse percentual
 * são calculados no mesmo passo (backend).
 */
@Component({
  selector: 'app-commission-rates',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe, ButtonModule, InputNumberModule, EmptyStateComponent],
  template: `
    <div class="space-y-4 pt-3">
      <p class="text-sm text-app-text-secondary max-w-2xl">{{ 'financial.commissions.rates.intro' | translate }}</p>

      @if (rates().length === 0) {
        <app-empty-state icon="pi pi-users" [message]="'financial.commissions.rates.empty' | translate"></app-empty-state>
      } @else {
        <ul class="space-y-3">
          @for (rate of rates(); track rate.providerId) {
            <li class="bg-app-bg border rounded-xl p-4"
                [class.border-app-border]="rate.ruleType"
                [class.border-app-warning]="!rate.ruleType">
              <div class="flex flex-wrap items-center gap-3">
                <span class="w-10 h-10 rounded-full bg-app-accent-soft text-app-accent flex items-center justify-center font-medium shrink-0"
                      aria-hidden="true">{{ initial(rate) }}</span>
                <div class="min-w-0 flex-1">
                  <p class="font-medium text-app-text truncate">{{ rate.providerName || rate.providerId }}</p>
                  <p class="text-sm" [class.text-app-text-secondary]="rate.ruleType" [class.text-app-warning]="!rate.ruleType">
                    {{ sentence(rate) }}
                  </p>
                </div>

                @if (canManage() && editingId() !== rate.providerId) {
                  <div class="flex items-center gap-2">
                    @if (!rate.ruleType) {
                      <p-button [label]="'financial.commissions.rates.confirm' | translate:{ percentage: suggestedLabel() }"
                                icon="pi pi-check" size="small" [loading]="savingId() === rate.providerId"
                                (onClick)="save(rate, suggested())"></p-button>
                      <p-button [label]="'financial.commissions.rates.other' | translate" [outlined]="true" size="small"
                                (onClick)="startEdit(rate)"></p-button>
                    } @else {
                      <p-button [label]="'financial.commissions.rates.change' | translate" [outlined]="true" size="small"
                                icon="pi pi-pencil" (onClick)="startEdit(rate)"></p-button>
                    }
                  </div>
                }
              </div>

              @if (editingId() === rate.providerId) {
                <form class="mt-4 pt-4 border-t border-app-border-subtle space-y-3" [formGroup]="rateForm" (ngSubmit)="submitEdit(rate)">
                  <div class="flex flex-wrap items-end gap-3">
                    <div class="w-40">
                      <label class="block text-[11px] font-medium text-app-text-secondary mb-1.5" for="commission-rate-input">
                        {{ 'financial.commissions.rates.percentageLabel' | translate }}
                      </label>
                      <p-inputNumber inputId="commission-rate-input" formControlName="percentage" mode="decimal" suffix="%"
                                     [minFractionDigits]="0" [maxFractionDigits]="2" [min]="0.01" [max]="100" fluid></p-inputNumber>
                    </div>
                    <p-button type="submit" [label]="'financial.commissions.rates.save' | translate" icon="pi pi-check"
                              [loading]="savingId() === rate.providerId" [disabled]="rateForm.invalid"></p-button>
                    <p-button type="button" [label]="'common.cancel' | translate" [outlined]="true" severity="secondary"
                              (onClick)="cancelEdit()"></p-button>
                  </div>
                  @if (exampleAmount(); as example) {
                    <p class="text-sm text-app-text-secondary">
                      {{ 'financial.commissions.rates.example' | translate:{ base: example.base, name: rate.providerName, amount: example.amount } }}
                    </p>
                  }
                </form>
              }
            </li>
          }
        </ul>
        @if (!canManage()) {
          <p class="text-xs text-app-text-tertiary">{{ 'financial.commissions.rates.managerOnly' | translate }}</p>
        }
      }
    </div>
  `,
})
export class CommissionRatesComponent {
  private readonly financialService = inject(FinancialService);
  private readonly messageService = inject(MessageService);
  private readonly translate = inject(TranslateService);
  private readonly explainer = inject(CommissionExplainerService);

  readonly rates = input.required<ProviderRate[]>();
  readonly suggested = input.required<number>();
  readonly currency = input.required<string>();
  readonly canManage = input(false);
  readonly saved = output<void>();

  readonly editingId = signal<string | null>(null);
  readonly savingId = signal<string | null>(null);
  private readonly typedPercentage = signal<number | null>(null);

  readonly rateForm = new FormGroup({
    percentage: new FormControl<number | null>(null, [Validators.required, Validators.min(0.01), Validators.max(100)]),
  });

  readonly suggestedLabel = computed(() => this.explainer.percentage(this.suggested()));

  readonly exampleAmount = computed(() => {
    const pct = this.typedPercentage();
    if (pct == null || pct <= 0) return null;
    const currency = this.currency();
    return {
      base: this.explainer.money({ amount: EXAMPLE_BASE, currency }),
      amount: this.explainer.money({ amount: (EXAMPLE_BASE * pct) / 100, currency }),
    };
  });

  constructor() {
    this.rateForm.controls.percentage.valueChanges.pipe(takeUntilDestroyed()).subscribe(v => this.typedPercentage.set(v));
  }

  initial(rate: ProviderRate): string {
    return (rate.providerName || '?').trim().charAt(0).toUpperCase();
  }

  sentence(rate: ProviderRate): string {
    const name = rate.providerName ?? '';
    if (rate.ruleType === 'PERCENTAGE' && rate.percentage != null) {
      return this.translate.instant('financial.commissions.rates.sentencePercentage', {
        name, percentage: this.explainer.percentage(rate.percentage),
      });
    }
    if (rate.fixedAmount) {
      return this.translate.instant('financial.commissions.rates.sentenceFixed', {
        name, fixed: this.explainer.money(rate.fixedAmount),
      });
    }
    return this.translate.instant('financial.commissions.rates.sentenceNone', { name });
  }

  startEdit(rate: ProviderRate): void {
    this.rateForm.reset({ percentage: rate.percentage ?? this.suggested() });
    this.typedPercentage.set(rate.percentage ?? this.suggested());
    this.editingId.set(rate.providerId);
  }

  cancelEdit(): void {
    this.editingId.set(null);
  }

  submitEdit(rate: ProviderRate): void {
    const value = this.rateForm.controls.percentage.value;
    if (this.rateForm.invalid || value == null) return;
    this.save(rate, value);
  }

  save(rate: ProviderRate, percentage: number): void {
    this.savingId.set(rate.providerId);
    this.financialService.setCommissionRate(rate.providerId, percentage).subscribe({
      next: () => {
        this.savingId.set(null);
        this.editingId.set(null);
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('financial.commissions.rates.saved', { name: rate.providerName ?? '' }),
        });
        this.saved.emit();
      },
      error: (err: HttpErrorResponse) => {
        this.savingId.set(null);
        this.messageService.add({ severity: 'error', summary: this.businessError(err, 'financial.commissions.rates.saveError') });
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
