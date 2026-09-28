import { Component, forwardRef, inject, input, signal, computed } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import {
  ControlValueAccessor, NG_VALIDATORS, NG_VALUE_ACCESSOR,
  FormsModule, ValidationErrors, Validator, AbstractControl,
} from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import {
  AsYouType, CountryCode, getCountries, getCountryCallingCode,
  isValidPhoneNumber, parsePhoneNumberFromString,
} from 'libphonenumber-js';

interface CountryOption {
  iso: CountryCode;
  name: string;
  dialCode: string;
  flag: string;
  searchText: string;
}

/** Converts an ISO 3166-1 alpha-2 code to its Unicode regional-indicator flag emoji. */
function flagEmoji(iso: string): string {
  return iso
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

const DEFAULT_COUNTRY: CountryCode = 'PT';

/**
 * Reusable phone input: country selector (flag + dial code) plus a national-number
 * field that reformats live per the selected country's dialing plan. The committed
 * form value is always E.164 (e.g. "+351912345678") or null — never a display string.
 *
 * Reactive-forms ready via ControlValueAccessor; also self-validates through
 * NG_VALIDATORS, adding an `invalidPhone` error when the number is non-empty but
 * not a valid number for the selected country.
 */
@Component({
  selector: 'app-phone',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, SelectModule, InputTextModule],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => PhoneComponent), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => PhoneComponent), multi: true },
  ],
  template: `
    <div>
      @if (label()) {
        <label class="ph-label">{{ label()! | translate }} @if (required()) {*}</label>
      }
      <div class="flex gap-2">
        <p-select
          [options]="countryOptions()"
          [ngModel]="country()"
          (ngModelChange)="onCountryChange($event)"
          optionLabel="name"
          optionValue="iso"
          [filter]="true"
          filterBy="searchText"
          [filterPlaceholder]="'phone.searchCountry' | translate"
          [disabled]="disabled()"
          styleClass="w-36 shrink-0"
          [appendTo]="'body'">
          <ng-template let-opt pTemplate="selectedItem">
            @if (opt) {
              <span class="flex items-center gap-1.5">
                <span>{{ opt.flag }}</span>
                <span class="text-sm">+{{ opt.dialCode }}</span>
              </span>
            }
          </ng-template>
          <ng-template let-opt pTemplate="item">
            <span class="flex items-center gap-2">
              <span>{{ opt.flag }}</span>
              <span class="flex-1 text-sm">{{ opt.name }}</span>
              <span class="text-xs text-app-text-tertiary">+{{ opt.dialCode }}</span>
            </span>
          </ng-template>
        </p-select>
        <input pInputText type="tel" fluid inputmode="tel"
               [ngModel]="displayValue()"
               (ngModelChange)="onNumberInput($event)"
               (blur)="onTouched()"
               [disabled]="disabled()" />
      </div>
      @if (touched() && displayValue() && !valid()) {
        <small class="text-app-danger">{{ 'errors.invalidPhone' | translate }}</small>
      }
    </div>
  `,
  styles: [`
    @reference "../../../../styles.css";
    .ph-label { @apply block text-sm font-medium text-app-text mb-1; }
  `],
})
export class PhoneComponent implements ControlValueAccessor, Validator {
  private translate = inject(TranslateService);

  label = input<string | null>('common.phone');
  required = input(false);
  defaultCountry = input<CountryCode>(DEFAULT_COUNTRY);

  country = signal<CountryCode>(DEFAULT_COUNTRY);
  displayValue = signal('');
  disabled = signal(false);
  touched = signal(false);
  valid = signal(true);

  private lang = toSignal(this.translate.onLangChange, { initialValue: null });

  private countryNames = computed(() => {
    this.lang();
    const locale = this.translate.getCurrentLang() || 'en';
    try {
      return new Intl.DisplayNames([locale], { type: 'region' });
    } catch {
      return new Intl.DisplayNames(['en'], { type: 'region' });
    }
  });

  countryOptions = computed<CountryOption[]>(() => {
    const names = this.countryNames();
    return getCountries()
      .map((iso) => {
        const name = names.of(iso) ?? iso;
        const dialCode = getCountryCallingCode(iso);
        return { iso, name, dialCode, flag: flagEmoji(iso), searchText: `${name} +${dialCode}` };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  private onChange: (v: string | null) => void = () => {};
  onTouched: () => void = () => { this.touched.set(true); };

  onCountryChange(iso: CountryCode): void {
    this.country.set(iso);
    this.reformatAndEmit(this.displayValue());
  }

  onNumberInput(raw: string): void {
    this.reformatAndEmit(raw);
  }

  private reformatAndEmit(raw: string): void {
    const formatter = new AsYouType(this.country());
    const formatted = formatter.input(raw);
    this.displayValue.set(formatted);

    const phoneNumber = formatter.getNumber();
    const e164 = phoneNumber?.number ?? null;
    this.valid.set(!raw || (!!e164 && isValidPhoneNumber(e164)));
    this.onChange(e164);
  }

  // ── ControlValueAccessor ──
  writeValue(v: string | null): void {
    if (!v) {
      this.country.set(this.defaultCountry());
      this.displayValue.set('');
      this.valid.set(true);
      return;
    }
    const parsed = parsePhoneNumberFromString(v);
    if (parsed) {
      this.country.set((parsed.country ?? this.defaultCountry()) as CountryCode);
      this.displayValue.set(parsed.formatNational());
      this.valid.set(parsed.isValid());
    } else {
      this.displayValue.set(v);
      this.valid.set(false);
    }
  }
  registerOnChange(fn: (v: string | null) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void { this.disabled.set(isDisabled); }

  // ── Validator ──
  validate(control: AbstractControl): ValidationErrors | null {
    const v = control.value;
    if (!v) return this.required() ? { required: true } : null;
    return isValidPhoneNumber(v) ? null : { invalidPhone: true };
  }
}
