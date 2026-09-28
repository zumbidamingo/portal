import { ChangeDetectorRef, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, concatMap, tap } from 'rxjs';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { PanelModule } from 'primeng/panel';
import { MessageService } from 'primeng/api';
import {
  PaymentMethodService, PaymentConditionMethodSetting, PaymentCondition, PaymentMethod,
  CreditCardInstallmentTier, PAYMENT_CONDITIONS,
} from '../../../core/services/payment-method.service';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';

/**
 * Forma de pagamento (condição — à vista/a prazo) é quem possui/configura os meios de pagamento
 * disponíveis (reestruturação de Formas de Pagamento): um painel por condição, cada um com uma
 * linha por {@link PaymentMethod} — lista fixa (o enum do backend), sem criar/remover linha, só
 * editar habilitado/juro. Sem botão salvar: cada toggle grava ao mudar e o percentual grava ao
 * perder o foco (PUT em lote com o estado atual do form, ver {@link PaymentMethodsComponent#persist}).
 *
 * À vista nunca tem juro — pagamento integral no ato é, por definição, sem juro — então o painel
 * dela não mostra a coluna de juros; o backend (`SetQuotationPaymentMethodUseCase`) ignora
 * qualquer configuração de juro nessa condição de qualquer forma. Cartão de crédito é exceção só
 * em "A prazo": parcelamento não é um percentual único, é uma tabela de faixas — por isso sai da
 * linha genérica e ganha painel próprio, com o próprio salvar (reestruturação de Formas de
 * Pagamento — parcelamento).
 */

@Component({
  selector: 'app-payment-methods',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe, ButtonModule, InputNumberModule, ToggleSwitchModule,
    PanelModule, PageHeaderComponent],
  template: `
    <div class="max-w-2xl space-y-6">
      <app-page-header [title]="'paymentMethods.title' | translate" [description]="'paymentMethods.subtitle' | translate"
                       [breadcrumb]="[{ label: 'nav.administration' | translate, route: '/administration' }]"></app-page-header>

      <form [formGroup]="form" class="space-y-6">
        @for (condition of conditions; track condition) {
          <p-panel [header]="conditionLabel(condition)">
            <p class="text-sm text-app-text-secondary mb-3">{{ 'paymentMethods.conditionHint.' + condition | translate }}</p>
            <div class="space-y-1">
              <div class="grid grid-cols-12 gap-3 px-1 pb-2 text-[11px] font-medium text-app-text-tertiary uppercase tracking-wide">
                <span class="col-span-5">{{ 'paymentMethods.method' | translate }}</span>
                <span class="col-span-3">{{ 'paymentMethods.enabled' | translate }}</span>
                @if (condition === 'DEFERRED') {
                  <span class="col-span-2">{{ 'paymentMethods.interestEnabled' | translate }}</span>
                  <span class="col-span-2">{{ 'paymentMethods.interestPercentage' | translate }}</span>
                }
              </div>

              @for (i of rowIndexesFor(condition)(); track rows.at(i).value.method) {
                <div class="grid grid-cols-12 gap-3 items-center px-1 py-2.5 border-t border-app-border">
                  <span class="col-span-5 text-sm text-app-text">{{ methodLabel(rows.at(i).value.method) }}</span>
                  <span class="col-span-3">
                    <p-toggleswitch [formControl]="enabledControl(i)" (onChange)="persist()"></p-toggleswitch>
                  </span>
                  @if (condition === 'DEFERRED') {
                    @if (rows.at(i).value.method === 'CREDIT_CARD') {
                      <span class="col-span-4 text-xs text-app-text-tertiary italic">
                        {{ 'paymentMethods.creditCard.configuredBelow' | translate }}
                      </span>
                    } @else {
                      <span class="col-span-2">
                        <p-toggleswitch [formControl]="interestEnabledControl(i)" (onChange)="persist()"></p-toggleswitch>
                      </span>
                      <span class="col-span-2">
                        @if (rows.at(i).value.interestEnabled) {
                          <p-inputnumber [formControl]="interestPercentageControl(i)" suffix="%" [min]="0.01" [max]="100"
                                         [maxFractionDigits]="2" [size]="'small'" inputStyleClass="w-full"
                                         (onBlur)="persist()"></p-inputnumber>
                        } @else {
                          <span class="text-sm text-app-text-tertiary">—</span>
                        }
                      </span>
                    }
                  }
                </div>
              }
            </div>
          </p-panel>
        }

      </form>

      <p-panel [header]="'paymentMethods.creditCard.title' | translate">
        <p class="text-sm text-app-text-secondary mb-4">{{ 'paymentMethods.creditCard.subtitle' | translate }}</p>

        @if (!creditCardEnabledOnDeferred()) {
          <p class="text-sm text-app-warning italic mb-4">{{ 'paymentMethods.creditCard.disabledHint' | translate }}</p>
        }

        <form [formGroup]="tiersForm" (ngSubmit)="saveTiers()" class="space-y-3" [class.opacity-60]="!creditCardEnabledOnDeferred()">
          <div class="grid grid-cols-12 gap-3 px-1 pb-1 text-[11px] font-medium text-app-text-tertiary uppercase tracking-wide">
            <span class="col-span-3">{{ 'paymentMethods.creditCard.fromInstallment' | translate }}</span>
            <span class="col-span-3">{{ 'paymentMethods.creditCard.toInstallment' | translate }}</span>
            <span class="col-span-3">{{ 'paymentMethods.interestPercentage' | translate }}</span>
            <span class="col-span-3"></span>
          </div>

          @for (tier of tierRows.controls; track tier; let i = $index) {
            <div class="grid grid-cols-12 gap-3 items-center px-1">
              <span class="col-span-3">
                <p-inputnumber [formControl]="tierMinControl(i)" [min]="1" [max]="999" suffix="x"
                               [size]="'small'" inputStyleClass="w-full"></p-inputnumber>
              </span>
              <span class="col-span-3">
                <p-inputnumber [formControl]="tierMaxControl(i)" [min]="1" [max]="999" suffix="x"
                               [size]="'small'" inputStyleClass="w-full"></p-inputnumber>
              </span>
              <span class="col-span-3">
                <p-inputnumber [formControl]="tierInterestControl(i)" suffix="%" [min]="0" [max]="100"
                               [maxFractionDigits]="2" [size]="'small'" inputStyleClass="w-full"></p-inputnumber>
              </span>
              <span class="col-span-3 text-right">
                <p-button type="button" icon="pi pi-trash" severity="danger" [text]="true" size="small"
                          [disabled]="!creditCardEnabledOnDeferred()" (onClick)="removeTier(i)"></p-button>
              </span>
            </div>
          }

          @if (!tierRows.controls.length) {
            <p class="text-sm text-app-text-tertiary italic px-1">{{ 'paymentMethods.creditCard.noTiers' | translate }}</p>
          }

          <div class="flex justify-between items-center pt-1">
            <p-button type="button" [label]="'paymentMethods.creditCard.addTier' | translate" icon="pi pi-plus"
                      [text]="true" size="small" [disabled]="!creditCardEnabledOnDeferred()" (onClick)="addTier()"></p-button>
            <p-button type="submit" [label]="'common.save' | translate" icon="pi pi-check"
                      [loading]="savingTiers()" [disabled]="tiersForm.invalid || !!overlapError() || !creditCardEnabledOnDeferred()"></p-button>
          </div>

          @if (overlapError()) {
            <p class="text-sm text-app-danger">{{ overlapError() }}</p>
          }

          @if (tierSummary().length) {
            <div class="border-t border-app-border pt-3 mt-3 space-y-1.5">
              <p class="text-[11px] font-medium text-app-text-tertiary uppercase tracking-wide mb-1">
                {{ 'paymentMethods.creditCard.summaryTitle' | translate }}
              </p>
              @for (line of tierSummary(); track line.label) {
                <div class="flex justify-between text-sm" [class.text-app-text]="!line.isGap" [class.text-app-warning]="line.isGap">
                  <span>{{ line.label }}</span>
                  <span>{{ line.detail }}</span>
                </div>
              }
            </div>
          }
        </form>
      </p-panel>
    </div>
  `,
})
export class PaymentMethodsComponent implements OnInit {
  private fb = inject(FormBuilder);
  private paymentMethodService = inject(PaymentMethodService);
  private messageService = inject(MessageService);
  private translate = inject(TranslateService);
  private cdr = inject(ChangeDetectorRef);

  readonly conditions: PaymentCondition[] = PAYMENT_CONDITIONS;

  savingTiers = signal(false);

  /** Fila serial: cliques rápidos em toggles diferentes chegam ao servidor na ordem, e o último
   *  estado do form é sempre o que fica gravado. */
  private persistQueue = new Subject<PaymentConditionMethodSetting[]>();

  /** Espelha o toggle "Habilitado" da linha Cartão de crédito × A prazo da tabela genérica —
   *  ainda não salvo, é o valor ao vivo do form (CLAUDE.md §16: nunca deixar a UI "aparentar
   *  funcionar" desligada; parcelamento não faz sentido para uma combinação que o tenant nem
   *  aceita). */
  creditCardEnabledOnDeferred = signal(true);

  constructor() {
    this.persistQueue.pipe(
      concatMap(payload => this.paymentMethodService.update(payload).pipe(
        tap(() => this.messageService.add({ severity: 'success', summary: this.translate.instant('paymentMethods.saved') })),
        catchError(() => {
          this.messageService.add({ severity: 'error', summary: this.translate.instant('paymentMethods.saveError') });
          // Desfaz o estado otimista: o form volta ao que o servidor realmente tem.
          this.paymentMethodService.list().subscribe(settings => this.setRows(settings));
          return EMPTY;
        }),
      )),
      takeUntilDestroyed(),
    ).subscribe();

    // Reage à troca do toggle acima e a linhas de faixa recém-criadas — trava/destrava os campos
    // ao vivo, sem esperar o "Salvar" de nenhum dos dois formulários.
    effect(() => {
      const enabled = this.creditCardEnabledOnDeferred();
      for (const group of this.tierRows.controls) {
        if (enabled) group.enable({ emitEvent: false }); else group.disable({ emitEvent: false });
      }
    });
  }

  form = this.fb.group({
    rows: this.fb.array<FormGroup>([]),
  });

  tiersForm = this.fb.group({
    tiers: this.fb.array<FormGroup>([]),
  });

  /** Recomputado a cada mudança de valor das faixas — feedback imediato, sem esperar o PUT
   *  (o backend continua sendo a validação final antes de gravar). */
  private tiersSnapshot = signal<{ minInstallments: number; maxInstallments: number; interestPercentage: number }[]>([]);

  overlapError = computed(() => {
    const tiers = [...this.tiersSnapshot()].sort((a, b) => a.minInstallments - b.minInstallments);
    for (const t of tiers) {
      if (t.maxInstallments < t.minInstallments) {
        return this.translate.instant('paymentMethods.creditCard.invalidRangeError');
      }
    }
    for (let i = 1; i < tiers.length; i++) {
      if (tiers[i].minInstallments <= tiers[i - 1].maxInstallments) {
        return this.translate.instant('paymentMethods.creditCard.overlapError');
      }
    }
    return null;
  });

  tierSummary = computed(() => {
    if (this.overlapError()) return [];
    const tiers = [...this.tiersSnapshot()].sort((a, b) => a.minInstallments - b.minInstallments);
    const lines: { label: string; detail: string; isGap: boolean }[] = [];
    let expected = 1;
    for (const t of tiers) {
      if (t.minInstallments > expected) {
        lines.push({
          label: this.rangeLabel(expected, t.minInstallments - 1),
          detail: this.translate.instant('paymentMethods.creditCard.notConfigured'),
          isGap: true,
        });
      }
      lines.push({
        label: this.rangeLabel(t.minInstallments, t.maxInstallments),
        detail: t.interestPercentage > 0
          ? this.translate.instant('paymentMethods.creditCard.interestOf', { percentage: t.interestPercentage })
          : this.translate.instant('paymentMethods.creditCard.noInterest'),
        isGap: false,
      });
      expected = t.maxInstallments + 1;
    }
    return lines;
  });

  private rangeLabel(from: number, to: number): string {
    return from === to
      ? this.translate.instant('paymentMethods.creditCard.exactlyN', { n: from })
      : this.translate.instant('paymentMethods.creditCard.fromNToM', { from, to });
  }

  get rows(): FormArray<FormGroup> {
    return this.form.get('rows') as FormArray<FormGroup>;
  }

  get tierRows(): FormArray<FormGroup> {
    return this.tiersForm.get('tiers') as FormArray<FormGroup>;
  }

  /** Índices de {@link rows} pertencentes a uma condição, na ordem em que entraram — evita
   *  reimplementar o filtro em cada bloco do template e mantém os dois painéis lendo do mesmo
   *  FormArray (um PUT em lote continua cobrindo as duas condições de uma vez). */
  rowIndexesFor(condition: PaymentCondition) {
    return computed(() => this.rows.controls
      .map((row, i) => ({ row, i }))
      .filter(({ row }) => row.value.condition === condition)
      .map(({ i }) => i));
  }

  ngOnInit(): void {
    this.paymentMethodService.list().subscribe({
      next: settings => this.setRows(settings),
      error: () => this.messageService.add({ severity: 'error', summary: this.translate.instant('paymentMethods.loadError') }),
    });
    this.paymentMethodService.getCreditCardInstallmentPlan().subscribe({
      next: plan => this.setTierRows(plan.tiers),
      error: () => this.messageService.add({ severity: 'error', summary: this.translate.instant('paymentMethods.creditCard.loadError') }),
    });
  }

  private setRows(settings: PaymentConditionMethodSetting[]): void {
    this.rows.clear();
    settings.forEach(s => this.rows.push(this.rowGroup(s)));
    const deferredCreditCardRow = this.rows.controls.find(
      g => g.value.condition === 'DEFERRED' && g.value.method === 'CREDIT_CARD');
    const enabledControl = deferredCreditCardRow?.get('enabled') as FormControl<boolean> | undefined;
    this.creditCardEnabledOnDeferred.set(enabledControl?.value ?? true);
    enabledControl?.valueChanges.subscribe(v => this.creditCardEnabledOnDeferred.set(v));
    // ngOnInit popula fora de um evento de template (clique, submit) — em zoneless, sem isto o
    // CD só roda na próxima interação do utilizador e a tabela fica vazia até lá.
    this.cdr.markForCheck();
  }

  private rowGroup(setting: PaymentConditionMethodSetting): FormGroup {
    return this.fb.group({
      condition: this.fb.control<PaymentCondition>(setting.condition, { nonNullable: true }),
      method: this.fb.control<PaymentMethod>(setting.method, { nonNullable: true }),
      enabled: this.fb.control<boolean>(setting.enabled, { nonNullable: true }),
      interestEnabled: this.fb.control<boolean>(setting.interestEnabled, { nonNullable: true }),
      interestPercentage: this.fb.control<number>(setting.interestPercentage || 0.01, {
        nonNullable: true, validators: [Validators.required, Validators.min(0.01), Validators.max(100)],
      }),
    });
  }

  enabledControl(index: number): FormControl<boolean> {
    return this.rows.at(index).get('enabled') as FormControl<boolean>;
  }

  interestEnabledControl(index: number): FormControl<boolean> {
    return this.rows.at(index).get('interestEnabled') as FormControl<boolean>;
  }

  interestPercentageControl(index: number): FormControl<number> {
    return this.rows.at(index).get('interestPercentage') as FormControl<number>;
  }

  conditionLabel(condition: PaymentCondition): string {
    return this.translate.instant(`financial.payments.condition${condition}`);
  }

  methodLabel(method: PaymentMethod): string {
    return this.translate.instant(`financial.payments.method${method}`);
  }

  /** Grava o lote inteiro assim que um toggle muda ou o percentual perde o foco. Linha inválida
   *  (percentual vazio/fora da faixa) não é enviada — o utilizador ainda está a editar. */
  persist(): void {
    if (this.form.invalid) return;
    this.persistQueue.next(this.buildPayload());
  }

  private buildPayload(): PaymentConditionMethodSetting[] {
    return this.rows.controls.map(row => {
      const v = row.getRawValue();
      // À vista nunca tem juro (pagamento integral no ato) e Cartão de crédito a prazo usa o
      // painel de faixas abaixo — nos dois casos o percentual fixo desta linha não se aplica.
      const interestApplies = v.condition === 'DEFERRED' && v.method !== 'CREDIT_CARD';
      return {
        condition: v.condition,
        method: v.method,
        enabled: v.enabled,
        interestEnabled: interestApplies ? v.interestEnabled : false,
        interestPercentage: interestApplies && v.interestEnabled ? v.interestPercentage : 0,
      };
    });
  }

  // ── Parcelamento do cartão de crédito (A prazo) ──────────────────────────────────

  private setTierRows(tiers: CreditCardInstallmentTier[]): void {
    this.tierRows.clear();
    [...tiers].sort((a, b) => a.minInstallments - b.minInstallments).forEach(t => this.tierRows.push(this.tierGroup(t)));
    this.refreshTiersSnapshot();
    this.cdr.markForCheck();
  }

  private tierGroup(tier: CreditCardInstallmentTier): FormGroup {
    const group = this.fb.group({
      minInstallments: this.fb.control<number>(tier.minInstallments, { nonNullable: true, validators: [Validators.required, Validators.min(1)] }),
      maxInstallments: this.fb.control<number>(tier.maxInstallments, { nonNullable: true, validators: [Validators.required, Validators.min(1)] }),
      interestPercentage: this.fb.control<number>(tier.interestPercentage, { nonNullable: true, validators: [Validators.required, Validators.min(0), Validators.max(100)] }),
    });
    group.valueChanges.subscribe(() => this.refreshTiersSnapshot());
    if (!this.creditCardEnabledOnDeferred()) {
      group.disable({ emitEvent: false });
    }
    return group;
  }

  private refreshTiersSnapshot(): void {
    this.tiersSnapshot.set(this.tierRows.controls.map(g => g.getRawValue()));
  }

  tierMinControl(index: number): FormControl<number> {
    return this.tierRows.at(index).get('minInstallments') as FormControl<number>;
  }

  tierMaxControl(index: number): FormControl<number> {
    return this.tierRows.at(index).get('maxInstallments') as FormControl<number>;
  }

  tierInterestControl(index: number): FormControl<number> {
    return this.tierRows.at(index).get('interestPercentage') as FormControl<number>;
  }

  addTier(): void {
    const nextStart = this.tierRows.controls.reduce((max, g) => Math.max(max, g.value.maxInstallments ?? 0), 0) + 1;
    this.tierRows.push(this.tierGroup({ minInstallments: nextStart, maxInstallments: nextStart, interestPercentage: 0 }));
    this.refreshTiersSnapshot();
  }

  removeTier(index: number): void {
    this.tierRows.removeAt(index);
    this.refreshTiersSnapshot();
  }

  saveTiers(): void {
    if (this.tiersForm.invalid || this.overlapError()) return;
    this.savingTiers.set(true);
    const payload: CreditCardInstallmentTier[] = this.tierRows.controls.map(g => g.getRawValue());
    this.paymentMethodService.updateCreditCardInstallmentPlan(payload).subscribe({
      next: plan => {
        this.savingTiers.set(false);
        this.setTierRows(plan.tiers);
        this.messageService.add({ severity: 'success', summary: this.translate.instant('paymentMethods.creditCard.saved') });
      },
      error: () => {
        this.savingTiers.set(false);
        this.messageService.add({ severity: 'error', summary: this.translate.instant('paymentMethods.creditCard.saveError') });
      },
    });
  }
}
