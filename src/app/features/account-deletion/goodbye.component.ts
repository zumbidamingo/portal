import { Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { LandingLinksService } from '../../core/services/landing-links.service';
import { AccountDeletionShellComponent } from './account-deletion-shell.component';

/**
 * Despedida depois de a exclusão ficar agendada. A data vem na URL só para ser exibida: a fonte
 * de verdade é o backend, que a envia também por email junto do link de cancelamento.
 */
@Component({
  selector: 'app-goodbye',
  standalone: true,
  imports: [TranslatePipe, ButtonModule, DatePipe, AccountDeletionShellComponent],
  template: `
    <app-account-deletion-shell>
      <div class="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 bg-app-accent-soft">
        <i class="pi pi-heart text-app-accent-hover text-3xl"></i>
      </div>
      <h1 class="text-2xl font-bold text-app-text mb-2">{{ 'accountDeletion.goodbye.title' | translate }}</h1>
      <p class="text-app-text-secondary text-sm mb-4">{{ 'accountDeletion.goodbye.body' | translate }}</p>
      @if (scheduledFor(); as date) {
        <p class="text-sm font-semibold text-app-text mb-4">
          {{ 'accountDeletion.goodbye.scheduledFor' | translate: { date: (date | date: 'longDate') } }}
        </p>
      }
      <div class="bg-app-accent-soft rounded-xl p-4 mb-6 text-left">
        <p class="text-xs text-app-text-secondary leading-relaxed">
          <i class="pi pi-info-circle mr-1.5 text-app-accent-hover"></i>{{ 'accountDeletion.goodbye.cancelHint' | translate }}
        </p>
      </div>
      <a [href]="homeUrl" target="_self">
        <p-button severity="secondary" [outlined]="true" [label]="'accountDeletion.goodbye.home' | translate" [fluid]="true"></p-button>
      </a>
    </app-account-deletion-shell>
  `,
})
export class GoodbyeComponent {
  private route = inject(ActivatedRoute);
  readonly homeUrl = inject(LandingLinksService).homeUrl;

  scheduledFor = computed(() => {
    const raw = this.route.snapshot.queryParamMap.get('on');
    const date = raw ? new Date(raw) : null;
    return date && !isNaN(date.getTime()) ? date : null;
  });
}
