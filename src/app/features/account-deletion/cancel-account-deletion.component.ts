import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { AccountDeletionService } from '../../core/services/account-deletion.service';
import { AccountDeletionShellComponent } from './account-deletion-shell.component';

type State = 'working' | 'done' | 'invalid' | 'expired' | 'used' | 'failed';

/** Destino do link de cancelamento: desfazer é inofensivo, então age assim que a página abre. */
@Component({
  selector: 'app-cancel-account-deletion',
  standalone: true,
  imports: [TranslatePipe, ButtonModule, RouterLink, AccountDeletionShellComponent],
  template: `
    <app-account-deletion-shell>
      @if (state() === 'working') {
        <div class="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 bg-app-accent-soft">
          <i class="pi pi-spin pi-spinner text-app-accent-hover text-3xl"></i>
        </div>
        <p class="text-app-text-secondary text-sm">{{ 'accountDeletion.cancelPage.working' | translate }}</p>
      } @else if (state() === 'done') {
        <div class="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 bg-app-success/10">
          <i class="pi pi-check-circle text-app-success text-3xl"></i>
        </div>
        <h1 class="text-2xl font-bold text-app-text mb-2">{{ 'accountDeletion.cancelPage.title' | translate }}</h1>
        <p class="text-app-text-secondary text-sm mb-6">{{ 'accountDeletion.cancelPage.body' | translate }}</p>
        <a routerLink="/auth/login">
          <p-button [label]="'accountDeletion.cancelPage.login' | translate" [fluid]="true"></p-button>
        </a>
      } @else {
        <div class="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 bg-app-danger/10">
          <i class="pi pi-times-circle text-app-danger text-3xl"></i>
        </div>
        <h1 class="text-2xl font-bold text-app-text mb-2">{{ 'accountDeletion.cancelPage.errorTitle' | translate }}</h1>
        <p class="text-app-text-secondary text-sm mb-6">{{ ('accountDeletion.cancelPage.error.' + state()) | translate }}</p>
        <a routerLink="/auth/login" class="text-sm text-app-text-tertiary hover:text-app-text-secondary">
          {{ 'accountDeletion.cancelPage.login' | translate }}
        </a>
      }
    </app-account-deletion-shell>
  `,
})
export class CancelAccountDeletionComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private accountDeletion = inject(AccountDeletionService);

  state = signal<State>('working');

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.state.set('invalid');
      return;
    }
    this.accountDeletion.cancel(token).subscribe({
      next: () => this.state.set('done'),
      error: (err) => {
        const code = err?.error?.errorCode;
        this.state.set(code === 'TOKEN_EXPIRED' ? 'expired' : code === 'TOKEN_ALREADY_USED' ? 'used'
          : code === 'INVALID_TOKEN' ? 'invalid' : 'failed');
      },
    });
  }
}
