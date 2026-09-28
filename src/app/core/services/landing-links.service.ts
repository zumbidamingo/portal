import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class LandingLinksService {
  private readonly baseUrl = environment.landingBaseUrl;

  get homeUrl(): string {
    return this.baseUrl;
  }

  get termsOfServiceUrl(): string {
    return `${this.baseUrl}/terms-of-service`;
  }

  get privacyPolicyUrl(): string {
    return `${this.baseUrl}/privacy-policy`;
  }
}
