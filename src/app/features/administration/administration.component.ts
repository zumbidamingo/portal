import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { LaundryFeatureService } from '../../core/services/laundry-feature.service';
import { AuthService } from '../../core/auth/auth.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { DeleteAccountComponent } from '../../shared/components/delete-account/delete-account.component';

interface AdminCard {
  icon: string;
  titleKey: string;
  descKey: string;
  route: string;
}

interface AdminSection {
  labelKey: string;
  cards: AdminCard[];
}

/**
 * Hub da Administração: agrupa por contexto (Empresa / Operação / Acesso e Equipe / Assinatura)
 * em vez de espalhar cada tela num item de sidebar à parte — a mistura de "config da empresa"
 * com "config pessoal" (Definições em dois lugares) é exatamente o que motivou esta reestruturação.
 * Empresa/Operação ficam OWNER-only: UpdateTenantUseCase só aceita o dono (ver CompanyInfoComponent),
 * mostrar o cartão a ADMIN seria UI que aparenta funcionar e falha ao salvar.
 */
@Component({
  selector: 'app-administration',
  standalone: true,
  imports: [RouterLink, TranslatePipe, PageHeaderComponent, DeleteAccountComponent],
  template: `
    <app-page-header [title]="'nav.administration' | translate" [description]="'administration.subtitle' | translate"></app-page-header>

    <div class="space-y-8 max-w-4xl">
      @for (section of sections(); track section.labelKey) {
        <div>
          <h2 class="text-[11px] font-semibold text-app-text-tertiary uppercase tracking-wide mb-3">{{ section.labelKey | translate }}</h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            @for (card of section.cards; track card.route) {
              <a [routerLink]="card.route"
                 class="flex items-start gap-3 p-4 rounded-lg border border-app-border hover:border-app-text-tertiary hover:bg-app-surface-hover transition-colors cursor-pointer">
                <div class="w-9 h-9 rounded-md bg-app-accent-soft flex items-center justify-center flex-shrink-0">
                  <i [class]="'pi ' + card.icon + ' text-app-accent-hover text-sm'"></i>
                </div>
                <div class="min-w-0">
                  <p class="text-sm font-medium text-app-text">{{ card.titleKey | translate }}</p>
                  <p class="text-xs text-app-text-tertiary mt-0.5">{{ card.descKey | translate }}</p>
                </div>
              </a>
            }
          </div>
        </div>
      }

      @if (isOwner()) {
        <app-delete-account></app-delete-account>
      }
    </div>
  `,
})
export class AdministrationComponent {
  private auth = inject(AuthService);
  private laundryFeature = inject(LaundryFeatureService);

  isOwner(): boolean {
    return this.auth.userRole() === 'OWNER';
  }

  sections(): AdminSection[] {
    const sections: AdminSection[] = [];
    const checklistCard: AdminCard = {
      icon: 'pi-list-check', titleKey: 'checklist.title', descKey: 'administration.cards.checklistDesc', route: '/administration/checklist',
    };

    if (this.isOwner()) {
      sections.push({
        labelKey: 'nav.company',
        cards: [
          { icon: 'pi-building', titleKey: 'tenant.editInfo', descKey: 'administration.cards.companyInfoDesc', route: '/administration/company' },
          // Cartão de Unidades escondido por enquanto (issue: conceito ainda sem uso de negócio
          // além de rota/quota — CLAUDE.md/COMPETITORS.md). Rota e tela continuam de pé.
          { icon: 'pi-user', titleKey: 'profile.ownerInfo', descKey: 'administration.cards.ownerDesc', route: '/administration/owner' },
        ],
      });
      sections.push({
        labelKey: 'administration.sections.operation',
        cards: [
          { icon: 'pi-sliders-v', titleKey: 'profile.tabSystemParams', descKey: 'administration.cards.systemParamsDesc', route: '/administration/system-parameters' },
          ...(this.laundryFeature.active()
            ? [{ icon: 'pi-building', titleKey: 'laundryFacilities.title', descKey: 'administration.cards.laundryFacilitiesDesc', route: '/administration/laundry-facilities' }]
            : []),
          { icon: 'pi-wallet', titleKey: 'paymentMethods.title', descKey: 'administration.cards.paymentMethodsDesc', route: '/administration/payment-methods' },
          { icon: 'pi-whatsapp', titleKey: 'whatsappBusiness.title', descKey: 'administration.cards.whatsappBusinessDesc', route: '/administration/whatsapp-business' },
          checklistCard,
        ],
      });
    } else {
      // ADMIN também configura o checklist (ChecklistController.WRITE_ROLES = OWNER/ADMIN).
      sections.push({ labelKey: 'administration.sections.operation', cards: [checklistCard] });
    }

    sections.push({
      labelKey: 'administration.sections.access',
      cards: [
        { icon: 'pi-users', titleKey: 'nav.team', descKey: 'administration.cards.teamDesc', route: '/administration/team' },
      ],
    });

    sections.push({
      labelKey: 'administration.sections.subscription',
      cards: [
        { icon: 'pi-crown', titleKey: 'nav.subscription', descKey: 'administration.cards.subscriptionDesc', route: '/subscription' },
      ],
    });

    return sections;
  }
}
