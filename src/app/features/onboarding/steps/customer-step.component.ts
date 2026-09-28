import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { of, switchMap } from 'rxjs';
import { InputMaskModule } from 'primeng/inputmask';
import { InputTextModule } from 'primeng/inputtext';
import { SelectButtonModule } from 'primeng/selectbutton';
import { MessageService } from 'primeng/api';
import { Customer, CustomerService, CustomerType } from '../../../core/services/customer.service';
import { Tenant } from '../../../core/services/tenant.service';
import { PhoneComponent } from '../../../shared/components/phone/phone.component';
import { SupportedCountry, TAX_ID_META, taxIdValidator } from '../../../shared/utils/tax-id.validator';
import { BrTaxIdMaskDirective } from '../../../shared/directives/br-tax-id-mask.directive';
import { OnboardingFooterComponent } from '../onboarding-footer.component';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ERROR_CODE_KEY: Record<string, string> = {
  TAX_ID_ALREADY_EXISTS: 'customers.errors.taxIdAlreadyExists',
  TAX_ID_REQUIRED: 'customers.errors.taxIdRequired',
  TAX_ID_INVALID: 'errors.taxIdInvalid',
};

/**
 * Passo 3 — primeiro cliente. Um orçamento precisa de cliente; cadastrá-lo aqui (nome e um contato)
 * evita que o dono chegue ao formulário de orçamento e tenha de sair dele para criar um. O contato
 * fica como principal, e é ele que recebe o orçamento por email.
 */
@Component({
  selector: 'app-onboarding-customer-step',
  standalone: true,
  imports: [BrTaxIdMaskDirective, ReactiveFormsModule, TranslatePipe, InputMaskModule, InputTextModule, SelectButtonModule,
    PhoneComponent, OnboardingFooterComponent],
  template: `
    <div class="flex flex-col flex-1">
      @if (created().length) {
        <ul class="space-y-1.5 mb-4" [attr.aria-label]="'onboarding.customer.createdLabel' | translate">
          @for (c of created(); track c.id) {
            <li class="flex items-center gap-2 text-sm rounded-md bg-app-surface px-3 py-2">
              <i class="pi pi-check text-app-success text-xs" aria-hidden="true"></i>
              <span class="truncate text-app-text">{{ c.name }}</span>
            </li>
          }
        </ul>
      }

      <form [formGroup]="form" (ngSubmit)="submit()" class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="md:col-span-2">
          <label class="label">{{ 'customers.type' | translate }} *</label>
          <p-selectbutton [options]="typeOptions" formControlName="type" optionLabel="label" optionValue="value"
                          [allowEmpty]="false"></p-selectbutton>
        </div>
        <div>
          <label class="label" for="ob-customer-name">{{ 'common.name' | translate }} *</label>
          <input id="ob-customer-name" pInputText formControlName="name" fluid
                 [placeholder]="(form.controls.type.value === 'COMPANY' ? 'customers.namePlaceholderCompany' : 'customers.namePlaceholderIndividual') | translate" />
        </div>
        <div>
          <label class="label">{{ taxIdMeta().labelKey | translate }}@if (form.controls.type.value === 'COMPANY') { *}</label>
          @if (taxIdMeta().mask) {
            <input pInputText formControlName="taxId" [pInputMask]="taxIdMeta().mask!" fluid [placeholder]="taxIdMeta().placeholder" />
          } @else if (country() === 'BR') {
            <input pInputText appBrTaxIdMask formControlName="taxId" fluid [placeholder]="taxIdMeta().placeholder" />
          } @else {
            <input pInputText formControlName="taxId" fluid [placeholder]="taxIdMeta().placeholder" />
          }
          @if (form.controls.taxId.hasError('taxId')) {
            <small class="text-app-danger text-xs block mt-1">{{ 'errors.taxIdInvalid' | translate }}</small>
          }
        </div>
        <div>
          <label class="label" for="ob-customer-email">{{ 'common.email' | translate }}</label>
          <input id="ob-customer-email" pInputText type="email" formControlName="email" fluid
                 [placeholder]="'onboarding.customer.emailPlaceholder' | translate" />
          @if (form.controls.email.hasError('pattern')) {
            <small class="text-app-danger text-xs block mt-1">{{ 'errors.invalidEmail' | translate }}</small>
          }
        </div>
        <div>
          <app-phone formControlName="phone" [defaultCountry]="phoneCountry()"></app-phone>
        </div>
      </form>
      <p class="text-xs text-app-text-tertiary mt-3">{{ 'onboarding.customer.contactHint' | translate }}</p>
      @if (created().length) {
        <p class="text-xs text-app-text-tertiary mt-1">{{ 'onboarding.customer.addMoreHint' | translate }}</p>
      }

      <div class="flex-1"></div>
      <app-onboarding-footer [label]="primaryLabel()" [loading]="saving()" [disabled]="filling() && form.invalid"
                             (back)="back.emit()" (primary)="primary()"></app-onboarding-footer>
    </div>
  `,
  styles: [`
    @reference "../../../../styles.css";
    .label { @apply block text-[11px] font-medium text-app-text-secondary mb-1.5; }
  `],
})
export class OnboardingCustomerStepComponent implements OnInit {
  private fb = inject(FormBuilder);
  private customerService = inject(CustomerService);
  private messageService = inject(MessageService);
  private translate = inject(TranslateService);

  tenant = input.required<Tenant>();
  next = output<void>();
  back = output<void>();

  readonly country = signal<SupportedCountry>('BR');
  taxIdMeta = computed(() => TAX_ID_META[this.country()]);
  phoneCountry = computed<'BR' | 'PT'>(() => (this.country() === 'PT' ? 'PT' : 'BR'));

  readonly typeOptions = [
    { label: this.translate.instant('customers.typeINDIVIDUAL'), value: 'INDIVIDUAL' as CustomerType },
    { label: this.translate.instant('customers.typeCOMPANY'), value: 'COMPANY' as CustomerType },
  ];

  form = this.fb.group({
    type: ['INDIVIDUAL' as CustomerType, Validators.required],
    name: ['', Validators.required],
    taxId: ['', taxIdValidator(() => this.country())],
    email: ['', Validators.pattern(EMAIL_RE)],
    phone: [''],
  });
  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  saving = signal(false);
  created = signal<Customer[]>([]);
  private existing = signal(0);

  filling = computed(() => !!this.value().name?.trim());
  hasCustomer = computed(() => this.existing() + this.created().length > 0);
  primaryLabel = computed(() =>
    this.filling() ? 'onboarding.saveAndContinue' : this.hasCustomer() ? 'onboarding.continue' : 'onboarding.skipStep');

  ngOnInit(): void {
    const code = this.tenant().countryCode;
    if (code === 'BR' || code === 'PT') this.country.set(code);
    this.form.controls.type.valueChanges.subscribe(type => {
      const control = this.form.controls.taxId;
      control.setValidators(type === 'COMPANY'
        ? [Validators.required, taxIdValidator(() => this.country())]
        : [taxIdValidator(() => this.country())]);
      control.updateValueAndValidity({ emitEvent: false });
    });
    this.customerService.list({ active: true, size: 1 }).subscribe({
      next: page => this.existing.set(page.page.totalElements),
      error: () => {},
    });
  }

  primary(): void {
    if (!this.filling()) {
      this.next.emit();
      return;
    }
    this.submit(() => this.next.emit());
  }

  submit(onDone?: () => void): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const name = v.name!.trim();
    this.saving.set(true);
    this.customerService.create({ type: v.type!, name, taxId: v.taxId || undefined }).pipe(
      switchMap(result => (v.email || v.phone)
        ? this.customerService.addContact(result.customer.id, {
            name, email: v.email || undefined, phone: v.phone || undefined, primary: true,
          })
        : of(result.customer)),
    ).subscribe({
      next: customer => {
        this.saving.set(false);
        this.created.update(list => [...list, customer]);
        this.form.reset({ type: v.type, name: '', taxId: '', email: '', phone: '' });
        onDone?.();
      },
      error: err => {
        this.saving.set(false);
        const code = err?.error?.errorCode as string | undefined;
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant((code && ERROR_CODE_KEY[code]) || 'customers.saveError'),
        });
      },
    });
  }
}
