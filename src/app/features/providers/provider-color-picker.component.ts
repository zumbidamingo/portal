import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TooltipModule } from 'primeng/tooltip';
import { TranslatePipe } from '@ngx-translate/core';
import { ProviderColor, ProviderColorOption, PROVIDER_COLOR_HEX } from '../../core/services/provider.service';

/**
 * Grelha visual das 17 cores Tailwind do Prestador (issue "Cor do Prestador") — cor tomada por
 * outro prestador ativo do tenant aparece riscada e não clicável, a própria seleção aparece com
 * check. Usado no cadastro rápido e no separador "Cor" do Drawer de gestão.
 */
@Component({
  selector: 'app-provider-color-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TooltipModule, TranslatePipe],
  template: `
    <div class="flex flex-wrap gap-2">
      @for (option of options(); track option.color) {
        <button type="button"
                class="w-8 h-8 rounded-full flex items-center justify-center border-2 transition-transform"
                [class.cursor-pointer]="option.available"
                [class.cursor-not-allowed]="!option.available"
                [class.opacity-40]="!option.available"
                [class.scale-110]="selected() === option.color"
                [style.background]="hex(option.color)"
                [style.border-color]="selected() === option.color ? 'var(--app-text)' : 'transparent'"
                [disabled]="!option.available"
                [pTooltip]="(option.available ? 'providers.color.optionAvailable' : 'providers.color.optionTaken') | translate"
                tooltipPosition="top"
                (click)="colorSelected.emit(option.color)">
          @if (selected() === option.color) {
            <i class="pi pi-check text-white text-xs"></i>
          } @else if (!option.available) {
            <i class="pi pi-lock text-white text-[10px]"></i>
          }
        </button>
      }
    </div>
  `,
})
export class ProviderColorPickerComponent {
  options = input.required<ProviderColorOption[]>();
  selected = input<ProviderColor | null>(null);
  colorSelected = output<ProviderColor>();

  hex(color: ProviderColor): string {
    return PROVIDER_COLOR_HEX[color];
  }
}
