import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { BrandLogoComponent } from '../brand-logo/brand-logo.component';

@Component({
  selector: 'app-loading',
  standalone: true,
  imports: [CommonModule, TranslatePipe, ProgressSpinnerModule, BrandLogoComponent],
  template: `
    <div class="fixed inset-0 z-[9999] flex items-center justify-center bg-app-bg">
      <div class="flex flex-col items-center gap-4">
        <app-brand-logo variant="symbol" [size]="46" />
        <p-progressSpinner class="w-8 h-8" strokeWidth="4" [style]="{ width: '2rem', height: '2rem' }"></p-progressSpinner>
        <p class="text-sm text-app-text-tertiary font-normal">{{ 'common.loading' | translate }}</p>
      </div>
    </div>
  `
})
export class LoadingComponent {}
