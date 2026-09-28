import { Component, forwardRef, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { AutoCompleteCompleteEvent, AutoCompleteSelectEvent } from 'primeng/types/autocomplete';
import { InputTextModule } from 'primeng/inputtext';
import { AddressSuggestion, GeoService } from '../../../core/services/geo.service';

/** Structured value produced by the address autocomplete. */
export interface AddressValue {
  street: string;
  complement?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
}

const EMPTY: AddressValue = { street: '' };

/**
 * Single-field address search with autocomplete backed by the existing geocoding
 * service (`GET /geocode/search`). On selection it fills street/postal/city/country/coords,
 * and exposes a separate "complement" input for number/floor/door/block.
 *
 * Reactive-forms ready via ControlValueAccessor — bind with `formControlName`.
 */
@Component({
  selector: 'app-address-autocomplete',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, AutoCompleteModule, InputTextModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AddressAutocompleteComponent),
      multi: true
    }
  ],
  template: `
    <div class="space-y-3">
      <div>
        <label class="af-label">{{ label() | translate }} @if (required()) {*}</label>
        <p-autoComplete
          [ngModel]="model()"
          (completeMethod)="search($event)"
          (onSelect)="onSelect($event)"
          (onClear)="onClear()"
          (ngModelChange)="onType($event)"
          [suggestions]="suggestions()"
          [delay]="350"
          [minLength]="3"
          [forceSelection]="true"
          [showClear]="true"
          [disabled]="disabled()"
          optionLabel="displayName"
          [appendTo]="'body'"
          autocomplete="new-password"
          fluid
          inputStyleClass="w-full"
          [placeholder]="placeholder() | translate">
          <ng-template let-s pTemplate="item">
            <div class="flex items-start gap-2 py-0.5">
              <i class="pi pi-map-marker text-app-accent-hover text-sm mt-0.5"></i>
              <span class="text-sm leading-snug">{{ s.displayName }}</span>
            </div>
          </ng-template>
          <ng-template pTemplate="empty">
            <div class="px-3 py-2 text-sm text-app-text-secondary">{{ 'address.noResults' | translate }}</div>
          </ng-template>
        </p-autoComplete>
        @if (loading()) {
          <p class="text-xs text-app-text-tertiary flex items-center gap-1 mt-1">
            <i class="pi pi-spin pi-spinner"></i>{{ 'address.searching' | translate }}
          </p>
        } @else if (selectedSummary(); as sum) {
          <p class="text-xs text-app-success flex items-center gap-1 mt-1">
            <i class="pi pi-check-circle"></i>{{ sum }}
          </p>
        }
        @if (hint()) {
          <p class="text-xs text-app-text-tertiary mt-1">{{ hint() | translate }}</p>
        }
      </div>

      <div>
        <label class="af-label">{{ 'address.complement' | translate }}</label>
        <input pInputText [ngModel]="value.complement ?? ''" (ngModelChange)="onComplement($event)"
               [disabled]="disabled()" fluid
               [placeholder]="'address.complementPlaceholder' | translate" />
      </div>
    </div>
  `,
  styles: [`
    @reference "../../../../styles.css";
    .af-label { @apply block text-sm font-medium text-app-text mb-1; }
  `]
})
export class AddressAutocompleteComponent implements ControlValueAccessor {
  private geo = inject(GeoService);

  label = input('common.address');
  placeholder = input('address.searchPlaceholder');
  required = input(false);
  hint = input<string | undefined>(undefined);

  suggestions = signal<AddressSuggestion[]>([]);
  loading = signal(false);
  disabled = signal(false);
  /** What the p-autoComplete input displays: a suggestion object or a plain string. */
  model = signal<AddressSuggestion | string>('');

  value: AddressValue = { ...EMPTY };
  private hasSelection = false;

  private onChange: (v: AddressValue | null) => void = () => {};
  private onTouched: () => void = () => {};

  selectedSummary(): string | null {
    if (!this.hasSelection) return null;
    return [this.value.postalCode, this.value.city, this.value.country].filter(Boolean).join(', ') || null;
  }

  search(event: AutoCompleteCompleteEvent): void {
    const q = event.query?.trim();
    if (!q || q.length < 3) { this.suggestions.set([]); return; }
    this.loading.set(true);
    this.geo.searchAddresses(q).subscribe({
      next: (res) => { this.suggestions.set(res); this.loading.set(false); },
      error: () => { this.suggestions.set([]); this.loading.set(false); }
    });
  }

  onSelect(event: AutoCompleteSelectEvent): void {
    const s = event.value as AddressSuggestion;
    this.hasSelection = true;
    this.model.set(s);
    this.value = {
      street: s.street || s.displayName,
      complement: this.value.complement,
      postalCode: s.postalCode,
      city: s.city,
      country: s.country,
      latitude: s.latitude,
      longitude: s.longitude
    };
    this.emit();
  }

  /**
   * Free typing does NOT commit a value: a valid address must be chosen from the list
   * (forceSelection), so only a complete street+postal+city+country suggestion is accepted.
   */
  onType(v: AddressSuggestion | string): void {
    if (typeof v !== 'string') return; // object handled by onSelect
    this.model.set(v);
    if (this.hasSelection) {
      this.hasSelection = false;
      this.value = { street: '', complement: this.value.complement };
      this.emit();
    }
  }

  onClear(): void {
    this.hasSelection = false;
    this.model.set('');
    this.value = { street: '', complement: this.value.complement };
    this.emit();
  }

  onComplement(v: string): void {
    this.value = { ...this.value, complement: v || undefined };
    this.emit();
  }

  private emit(): void {
    this.onTouched();
    this.onChange(this.value.street ? this.value : null);
  }

  // ── ControlValueAccessor ──
  writeValue(v: AddressValue | null): void {
    this.value = v ? { ...v } : { ...EMPTY };
    this.hasSelection = !!(v && (v.city || v.postalCode || v.latitude != null));
    this.model.set(this.value.street ?? '');
  }
  registerOnChange(fn: (v: AddressValue | null) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void { this.disabled.set(isDisabled); }
}
