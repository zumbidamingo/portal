import { Component, OnInit, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/auth/auth.service';
import { TenantService } from '../../core/services/tenant.service';

/**
 * Convite para retomar o onboarding no dashboard do dono (issue #136). Aparece enquanto o
 * onboarding não estiver concluído — quem o dispensou continua a poder entrar no produto e
 * voltar quando quiser. Some sozinho ao concluir; só o dono o vê, porque só ele o pode fazer.
 */
@Component({
  selector: 'app-onboarding-resume-card',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  template: `
    @if (visible()) {
      <div class="bg-app-accent-soft border border-app-accent-border rounded-xl p-4 flex flex-wrap items-center gap-4">
        <i class="pi pi-compass text-app-accent text-xl" aria-hidden="true"></i>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-semibold text-app-text">{{ 'onboarding.resume.title' | translate }}</p>
          <p class="text-xs text-app-text-secondary">{{ 'onboarding.resume.body' | translate }}</p>
        </div>
        <a routerLink="/onboarding"
           class="text-sm font-medium rounded-lg bg-app-action text-app-action-text px-3 py-1.5 hover:bg-app-action-hover">
          {{ 'onboarding.resume.action' | translate }}
        </a>
      </div>
    }
  `,
})
export class OnboardingResumeCardComponent implements OnInit {
  private auth = inject(AuthService);
  private tenantService = inject(TenantService);

  visible = computed(() => {
    const status = this.tenantService.current()?.onboarding?.status;
    return this.auth.userRole() === 'OWNER' && !!status && status !== 'COMPLETED';
  });

  ngOnInit(): void {
    if (this.auth.userRole() === 'OWNER' && !this.tenantService.current()) {
      this.tenantService.getMe().subscribe({ error: () => {} });
    }
  }
}
