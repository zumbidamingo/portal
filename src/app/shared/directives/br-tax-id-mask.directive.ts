import { Directive, ElementRef, HostListener, inject } from '@angular/core';
import { NgControl } from '@angular/forms';
import { maskBrTaxIdInput } from '../utils/tax-id.validator';

/**
 * Máscara de CPF/CNPJ para `<input formControlName>`, aplicada enquanto se digita.
 * O valor do controlo fica formatado (`33.415.588/0001-01`); o validador e o backend
 * normalizam os separadores, então não é preciso limpar antes de enviar.
 */
@Directive({
  selector: 'input[appBrTaxIdMask]',
  standalone: true,
  host: { maxlength: '18', autocomplete: 'off' },
})
export class BrTaxIdMaskDirective {
  private readonly ngControl = inject(NgControl, { self: true });

  private readonly input = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;

  @HostListener('input')
  onInput(): void {
    const masked = maskBrTaxIdInput(this.input.value);
    if (masked !== this.input.value) this.ngControl.control?.setValue(masked);
  }
}
