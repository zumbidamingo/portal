import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '../../../core/auth/auth.service';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';

/**
 * Somente leitura: o "Responsável/Proprietário" da empresa é, por definição, a conta OWNER
 * autenticada (UpdateTenantUseCase liga o tenant a tenant.userId, não a um registro à parte).
 * Editar aqui e em "Meu Perfil" duplicaria o mesmo formulário para o mesmo dado — este ecrã só
 * mostra quem é e aponta para onde a edição de fato acontece.
 */
@Component({
  selector: 'app-owner-info',
  standalone: true,
  imports: [RouterLink, TranslatePipe, ButtonModule, PageHeaderComponent],
  template: `
    <div class="max-w-xl">
      <app-page-header [title]="'profile.ownerInfo' | translate" [description]="'administration.cards.ownerDesc' | translate"
                       [breadcrumb]="[{ label: 'nav.administration' | translate, route: '/administration' }]"></app-page-header>

      <div class="flex items-center gap-4 p-4 border border-app-border rounded-lg">
        <div class="w-14 h-14 bg-app-accent-soft rounded-2xl flex items-center justify-center text-app-text text-xl font-medium flex-shrink-0">
          {{ auth.currentUser()?.name?.charAt(0) }}
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium text-app-text truncate">{{ auth.currentUser()?.name }}</p>
          <p class="text-xs text-app-text-tertiary truncate">{{ auth.currentUser()?.email }}</p>
        </div>
        <p-button [label]="'administration.cards.editInPersonal' | translate" icon="pi pi-pencil"
                  [outlined]="true" routerLink="/profile"></p-button>
      </div>
    </div>
  `,
})
export class OwnerInfoComponent {
  auth = inject(AuthService);
}
