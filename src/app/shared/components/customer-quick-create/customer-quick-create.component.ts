import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, Output, ViewChild, inject, model, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { InputTextModule } from 'primeng/inputtext';
import { InputMaskModule } from 'primeng/inputmask';
import { SelectButtonModule } from 'primeng/selectbutton';
import { MessageService } from 'primeng/api';
import { Customer, CustomerService, CustomerType } from '../../../core/services/customer.service';
import { TenantService } from '../../../core/services/tenant.service';
import { SupportedCountry, TAX_ID_META, taxIdValidator } from '../../utils/tax-id.validator';
import { BrTaxIdMaskDirective } from '../../directives/br-tax-id-mask.directive';

/**
 * Cadastro rápido de cliente, para fluxos que precisam de um {@link Customer} imediatamente
 * (hoje: seleção de cliente no orçamento) sem sair da tela em que estão. Usa o mesmo
 * `CustomerService`, validador de documento e tabela de máscaras por país do cadastro completo
 * em `CustomersComponent` — evita duplicar essa lógica — mas deixa endereço e contactos de fora:
 * podem ser preenchidos depois em Clientes, e exigi-los aqui só atrasaria o orçamento.
 */
@Component({
  selector: 'app-customer-quick-create',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BrTaxIdMaskDirective, CommonModule, ReactiveFormsModule, TranslatePipe, ButtonModule, DrawerModule, InputTextModule,
    InputMaskModule, SelectButtonModule],
  template: `
    <p-drawer [(visible)]="visible" position="right" [dismissible]="true" [closeOnEscape]="true"
              styleClass="w-full! sm:w-[26rem]! md:w-[30rem]!" (onShow)="focusName()">
      <ng-template #header>
        <span class="font-semibold text-app-text">{{ 'customers.addTitle' | translate }}</span>
      </ng-template>

      <form [formGroup]="form" (ngSubmit)="save()" class="space-y-4 pb-4">
        <p class="text-xs text-app-text-tertiary">{{ 'customerQuickCreate.hint' | translate }}</p>

        <div>
          <label class="label">{{ 'customers.type' | translate }} *</label>
          <p-selectbutton [options]="typeOptions" formControlName="type" optionLabel="label" optionValue="value"
                           [allowEmpty]="false"></p-selectbutton>
        </div>
        <div>
          <label class="label">{{ 'common.name' | translate }} *</label>
          <input pInputText formControlName="name" fluid #nameInput
                 [placeholder]="(form.get('type')?.value === 'COMPANY' ? 'customers.namePlaceholderCompany' : 'customers.namePlaceholderIndividual') | translate" />
          @if (form.get('name')?.invalid && form.get('name')?.touched) {
            <small class="text-app-danger text-xs block mt-1">{{ 'errors.required' | translate }}</small>
          }
        </div>
        <div>
          <label class="label">{{ taxIdMeta().labelKey | translate }}
            @if (form.get('type')?.value === 'COMPANY') {*}
          </label>
          @if (taxIdMeta().mask) {
            <input pInputText formControlName="taxId" [pInputMask]="taxIdMeta().mask!" fluid [placeholder]="taxIdMeta().placeholder" />
          } @else if (country() === 'BR') {
            <input pInputText appBrTaxIdMask formControlName="taxId" fluid [placeholder]="taxIdMeta().placeholder" />
          } @else {
            <input pInputText formControlName="taxId" fluid [placeholder]="taxIdMeta().placeholder" />
          }
          @if (form.get('taxId')?.hasError('taxId')) {
            <small class="text-app-danger text-xs block mt-1">{{ 'errors.taxIdInvalid' | translate }}</small>
          } @else {
            <p class="text-xs text-app-text-tertiary mt-1">
              {{ (form.get('type')?.value === 'COMPANY' ? 'customers.taxIdHelpCompany' : 'customers.taxIdHelpIndividual') | translate }}
            </p>
          }
        </div>
        <p class="text-xs text-app-text-tertiary border-t border-app-border pt-3">
          <i class="pi pi-info-circle" aria-hidden="true"></i> {{ 'customerQuickCreate.addressLaterHint' | translate }}
        </p>
      </form>

      <ng-template #footer>
        <div class="flex justify-end gap-2">
          <p-button type="button" [label]="'common.close' | translate" [outlined]="true" (onClick)="visible.set(false)"></p-button>
          <p-button [label]="'customerQuickCreate.save' | translate" icon="pi pi-check"
                    [loading]="saving()" [disabled]="form.invalid" (onClick)="save()"></p-button>
        </div>
      </ng-template>
    </p-drawer>
  `,
  styles: [`
    @reference "../../../../styles.css";
    .label { @apply block text-[11px] font-medium text-app-text-secondary mb-1.5; }
  `],
})
export class CustomerQuickCreateComponent {
  private fb = inject(FormBuilder);
  private customerService = inject(CustomerService);
  private tenantService = inject(TenantService);
  private translate = inject(TranslateService);
  private messageService = inject(MessageService);

  /** Visibilidade do diálogo — controlado pelo chamador via `[(visible)]`. */
  visible = model(false);

  /** Nome ou documento já digitados na busca que originou o cadastro — pré-preenche o formulário. */
  @Input() set prefill(value: { name?: string | null; taxId?: string | null } | null) {
    this.form.patchValue({ name: value?.name ?? '', taxId: value?.taxId ?? '' });
  }

  @Output() customerCreated = new EventEmitter<Customer>();

  @ViewChild('nameInput') private nameInputRef?: ElementRef<HTMLInputElement>;

  readonly saving = signal(false);
  readonly country = signal<SupportedCountry>('BR');
  taxIdMeta = () => TAX_ID_META[this.country()];

  readonly typeOptions = [
    { label: this.translate.instant('customers.typeINDIVIDUAL'), value: 'INDIVIDUAL' },
    { label: this.translate.instant('customers.typeCOMPANY'), value: 'COMPANY' },
  ];

  form = this.fb.group({
    type: ['INDIVIDUAL' as CustomerType, Validators.required],
    name: ['', Validators.required],
    taxId: ['', taxIdValidator(() => this.country())],
  });

  constructor() {
    this.tenantService.getMe().subscribe({
      next: t => { if (t.countryCode) this.country.set(t.countryCode as SupportedCountry); },
      error: () => {},
    });
    this.form.get('type')!.valueChanges.subscribe(type => this.syncTaxIdValidators(type));
  }

  private syncTaxIdValidators(type: CustomerType | null): void {
    const control = this.form.get('taxId')!;
    const validators = type === 'COMPANY'
      ? [Validators.required, taxIdValidator(() => this.country())]
      : [taxIdValidator(() => this.country())];
    control.setValidators(validators);
    control.updateValueAndValidity({ emitEvent: false });
  }

  focusName(): void {
    queueMicrotask(() => this.nameInputRef?.nativeElement.focus());
  }

  save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.saving.set(true);
    const v = this.form.value;
    this.customerService.create({ type: v.type!, name: v.name!, taxId: v.taxId || undefined }).subscribe({
      next: result => {
        this.saving.set(false);
        this.visible.set(false);
        this.form.reset({ type: 'INDIVIDUAL', name: '', taxId: '' });
        this.messageService.add({ severity: 'success', summary: this.translate.instant('customers.saved') });
        // Issue #232/G2: aviso soft, nunca bloqueia — o cliente já foi criado.
        if (result.duplicateWarnings.length) {
          const names = result.duplicateWarnings.map(w => w.name).join(', ');
          this.messageService.add({
            severity: 'warn',
            summary: this.translate.instant('customers.duplicateWarningTitle'),
            detail: this.translate.instant('customers.duplicateWarningDetail', { names }),
            life: 8000,
          });
        }
        this.customerCreated.emit(result.customer);
      },
      error: (err) => {
        this.saving.set(false);
        this.messageService.add({ severity: 'error', summary: this.errorMessage(err) });
      },
    });
  }

  private static readonly ERROR_CODE_KEY: Record<string, string> = {
    TAX_ID_ALREADY_EXISTS: 'customers.errors.taxIdAlreadyExists',
    TAX_ID_REQUIRED: 'customers.errors.taxIdRequired',
    TAX_ID_INVALID: 'errors.taxIdInvalid',
    CUSTOMER_NAME_REQUIRED: 'customers.errors.nameRequired',
    CUSTOMER_TYPE_INVALID: 'customers.errors.typeInvalid',
  };

  private errorMessage(err: unknown): string {
    const code = (err as { error?: { errorCode?: string } })?.error?.errorCode;
    const key = code ? CustomerQuickCreateComponent.ERROR_CODE_KEY[code] : undefined;
    return this.translate.instant(key ?? 'customers.saveError');
  }
}
