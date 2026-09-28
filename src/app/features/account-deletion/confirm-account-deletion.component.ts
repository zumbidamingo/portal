import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '../../core/auth/auth.service';
import { AccountDeletionService } from '../../core/services/account-deletion.service';
import { AccountDeletionShellComponent } from './account-deletion-shell.component';

type State = 'ready' | 'working' | 'invalid' | 'expired' | 'used' | 'failed';

/**
 * Destino do link de confirmação do email. Não confirma ao abrir: quem abre pode ser um scanner
 * de links ou um clique por engano, então a exclusão só é agendada num clique explícito aqui.
 */
@Component({
  selector: 'app-confirm-account-deletion',
  standalone: true,
  imports: [TranslatePipe, ButtonModule, RouterLink, AccountDeletionShellComponent],
  template: `
    <app-account-deletion-shell>
      @if (state() === 'ready' || state() === 'working') {
        <div class="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 bg-app-danger/10">
          <i class="pi pi-exclamation-triangle text-app-danger text-3xl"></i>
        </div>
        <h1 class="text-2xl font-bold text-app-text mb-2">{{ 'accountDeletion.confirmPage.title' | translate }}</h1>
        <p class="text-app-text-secondary text-sm mb-6">{{ 'accountDeletion.confirmPage.body' | translate }}</p>
        <p-button severity="danger" class="block mb-3" [label]="'accountDeletion.confirmPage.confirm' | translate"
                  icon="pi pi-trash" [loading]="state() === 'working'" [fluid]="true" (onClick)="confirm()"></p-button>
        <a routerLink="/" class="text-sm text-app-text-tertiary hover:text-app-text-secondary">
          {{ 'accountDeletion.confirmPage.keep' | translate }}
        </a>
      } @else {
        <div class="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 bg-app-danger/10">
          <i class="pi pi-times-circle text-app-danger text-3xl"></i>
        </div>
        <h1 class="text-2xl font-bold text-app-text mb-2">{{ 'accountDeletion.confirmPage.errorTitle' | translate }}</h1>
        <p class="text-app-text-secondary text-sm mb-6">{{ ('accountDeletion.confirmPage.error.' + state()) | translate }}</p>
        <a routerLink="/" class="text-sm text-app-text-tertiary hover:text-app-text-secondary">
          {{ 'accountDeletion.confirmPage.keep' | translate }}
        </a>
      }
    </app-account-deletion-shell>
  `,
})
export class ConfirmAccountDeletionComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private auth = inject(AuthService);
  private accountDeletion = inject(AccountDeletionService);

  private readonly token = this.route.snapshot.queryParamMap.get('token');
  state = signal<State>(this.token ? 'ready' : 'invalid');

  confirm(): void {
    if (!this.token || this.state() === 'working') return;
    this.state.set('working');
    this.accountDeletion.confirm(this.token).subscribe({
      next: ({ scheduledFor }) => {
        // O backend já revogou as sessões; limpar o dispositivo evita um pedido com token morto.
        this.auth.endSessionLocally();
        this.router.navigate(['/goodbye'], { queryParams: { on: scheduledFor } });
      },
      error: (err) => {
        const code = err?.error?.errorCode;
        this.state.set(code === 'TOKEN_EXPIRED' ? 'expired' : code === 'TOKEN_ALREADY_USED' ? 'used'
          : code === 'INVALID_TOKEN' ? 'invalid' : 'failed');
      },
    });
  }
}
