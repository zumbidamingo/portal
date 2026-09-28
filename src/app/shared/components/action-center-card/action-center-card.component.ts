import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ButtonModule } from 'primeng/button';

export type ActionCenterSeverity = 'info' | 'warn' | 'success' | 'danger';

const ACCENT_CLASS: Record<ActionCenterSeverity, string> = {
  info: 'border-l-app-text-tertiary',
  warn: 'border-l-app-warning',
  success: 'border-l-app-success',
  danger: 'border-l-app-danger',
};

/**
 * Cartão de ação recomendada/pendente com CTA (issue #118) — usado na fila de agendamento
 * rápido do COMMERCIAL e em qualquer outro ponto de ação futuro das dashboards.
 */
@Component({
  selector: 'app-action-center-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ButtonModule],
  template: `
    <div class="bg-app-bg border border-app-border rounded-xl p-4 flex items-center justify-between gap-4 border-l-4"
         [class]="accentClass()">
      <div class="flex items-start gap-3 min-w-0">
        <i [class]="'pi ' + icon() + ' text-app-text-tertiary text-lg mt-0.5'" aria-hidden="true"></i>
        <div class="min-w-0">
          <p class="text-sm font-medium text-app-text truncate">{{ title() }}</p>
          @if (description()) {
            <p class="text-xs text-app-text-secondary mt-0.5">{{ description() }}</p>
          }
        </div>
      </div>
      @if (ctaLabel()) {
        <p-button [label]="ctaLabel()!" size="small" [outlined]="true" (click)="cta.emit()"></p-button>
      }
    </div>
  `,
})
export class ActionCenterCardComponent {
  title = input.required<string>();
  description = input<string | null>(null);
  ctaLabel = input<string | null>(null);
  icon = input<string>('pi pi-bolt');
  severity = input<ActionCenterSeverity>('info');
  cta = output<void>();

  accentClass(): string {
    return ACCENT_CLASS[this.severity()];
  }
}
