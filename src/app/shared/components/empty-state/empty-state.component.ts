import { Component, EventEmitter, Input, Output, booleanAttribute } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  host: { '[class.compact-empty]': 'compact' },
  imports: [RouterLink, ButtonModule],
  template: `
    <div class="flex flex-col items-center justify-center text-center" [class]="compact ? 'flex-1 py-4' : 'py-16'">
      <i [class]="icon + ' text-3xl mb-3 ' + iconClass" aria-hidden="true"></i>
      <p class="text-app-text text-sm font-medium">{{ message }}</p>
      @if (subtitle) {
        <p class="text-app-text-tertiary text-sm mt-1">{{ subtitle }}</p>
      }
      @if (actionLabel) {
        @if (actionRoute) {
          <p-button [routerLink]="actionRoute" class="mt-5" [label]="actionLabel" icon="pi pi-arrow-right" iconPos="right"></p-button>
        } @else {
          <p-button (onClick)="actionClick.emit()" class="mt-5" [label]="actionLabel" icon="pi pi-arrow-right" iconPos="right"></p-button>
        }
      }
    </div>
  `
})
export class EmptyStateComponent {
  @Input() icon = 'pi pi-inbox';
  @Input() iconClass = 'text-app-text-disabled';
  /** Versão para dentro de cartões de painel: ocupa a altura livre do cartão e centra o conteúdo. */
  @Input({ transform: booleanAttribute }) compact = false;
  @Input() message = '';
  @Input() subtitle?: string;
  @Input() actionLabel?: string;
  @Input() actionRoute?: string | string[];
  @Output() actionClick = new EventEmitter<void>();
}
