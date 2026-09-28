import { Component } from '@angular/core';

@Component({
  selector: 'app-loading-spinner',
  standalone: true,
  template: `
    <div class="flex items-center justify-center p-8">
      <div class="w-10 h-10 border-4 border-app-border border-t-app-accent rounded-full animate-spin"></div>
    </div>
  `
})
export class LoadingSpinnerComponent {}
