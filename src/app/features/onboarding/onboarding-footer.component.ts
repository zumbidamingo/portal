import { Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';

/** Rodapé comum aos passos do onboarding: voltar à esquerda, ação principal à direita. */
@Component({
  selector: 'app-onboarding-footer',
  standalone: true,
  imports: [TranslatePipe, ButtonModule],
  template: `
    <div class="flex items-center justify-between gap-3 pt-6 mt-auto border-t border-app-border">
      @if (showBack()) {
        <p-button type="button" [label]="'onboarding.back' | translate" icon="pi pi-arrow-left"
                  severity="secondary" [text]="true" [disabled]="loading()" (onClick)="back.emit()"></p-button>
      } @else {
        <span></span>
      }
      <p-button type="button" [label]="label() | translate" [icon]="icon()" iconPos="right"
                [loading]="loading()" [disabled]="disabled()" (onClick)="primary.emit()"></p-button>
    </div>
  `,
})
export class OnboardingFooterComponent {
  showBack = input(true);
  label = input('onboarding.saveAndContinue');
  icon = input<string | undefined>(undefined);
  loading = input(false);
  disabled = input(false);
  back = output<void>();
  primary = output<void>();
}
