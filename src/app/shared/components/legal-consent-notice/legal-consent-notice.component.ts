import { Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { LandingLinksService } from '../../../core/services/landing-links.service';

@Component({
  selector: 'app-legal-consent-notice',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <p class="text-center text-xs text-app-text-tertiary leading-relaxed">
      {{ 'auth.legalConsentPrefix' | translate }}
      <a [href]="termsUrl" target="_self"
         class="text-app-text-secondary hover:text-app-accent-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent focus-visible:ring-offset-1 rounded transition-colors duration-150">{{ 'auth.termsOfService' | translate }}</a>
      {{ 'auth.legalConsentAnd' | translate }}
      <a [href]="privacyUrl" target="_self"
         class="text-app-text-secondary hover:text-app-accent-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent focus-visible:ring-offset-1 rounded transition-colors duration-150">{{ 'auth.privacyPolicy' | translate }}</a>.
    </p>
  `
})
export class LegalConsentNoticeComponent {
  private readonly landingLinks = inject(LandingLinksService);

  readonly termsUrl = this.landingLinks.termsOfServiceUrl;
  readonly privacyUrl = this.landingLinks.privacyPolicyUrl;
}
