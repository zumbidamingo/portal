import { Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { LandingLinksService } from '../../core/services/landing-links.service';
import { BrandLogoComponent } from '../../shared/components/brand-logo/brand-logo.component';

/** Moldura das páginas públicas do ciclo de exclusão de conta (confirmar, cancelar, despedida). */
@Component({
  selector: 'app-account-deletion-shell',
  standalone: true,
  imports: [BrandLogoComponent, TranslatePipe],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-app-surface p-4">
      <div class="bg-app-bg border border-app-border rounded-xl w-full max-w-md p-8 text-center">
        <a [href]="homeUrl" target="_self" [attr.aria-label]="'auth.backToHome' | translate"
           class="flex w-fit mx-auto items-center justify-center gap-2 mb-7 rounded-lg transition-opacity duration-150 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent focus-visible:ring-offset-2">
          <app-brand-logo variant="wordmark" [size]="28" />
        </a>
        <ng-content></ng-content>
      </div>
    </div>
  `,
})
export class AccountDeletionShellComponent {
  readonly homeUrl = inject(LandingLinksService).homeUrl;
}
