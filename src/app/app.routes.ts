import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { authRedirectGuard } from './core/guards/auth-redirect.guard';
import { roleGuard } from './core/guards/role.guard';
import { laundryEnabledGuard } from './core/guards/laundry-enabled.guard';
import { routeRoles } from './core/auth/route-access';
import { dashboardRedirectGuard } from './core/guards/dashboard-redirect.guard';
import { profileCompleteGuard } from './core/guards/profile-complete.guard';
import { emailVerifiedGuard } from './core/guards/email-verified.guard';
import { mustChangePasswordGuard } from './core/guards/must-change-password.guard';
import { LayoutComponent } from './layout/layout.component';

/**
 * Rotas do portal de gestão.
 *
 * Só existem aqui os ecrãs que têm backend a sustentá-los. As secções operacionais do
 * SuaOperacao — clientes, catálogo, orçamentos, agenda, ordens, técnicos, rotas, lavandaria,
 * financeiro, comissões, relatórios, intelligence — entram fase a fase, cada uma com a sua
 * API real. Rota sem fluxo por trás é ecrã que finge funcionar.
 */
export const routes: Routes = [
  // Vista pública do orçamento (sem layout, sem sessão — autenticada só pelo token na URL, issue #140)
  {
    path: 'quotations/public/:token',
    loadComponent: () => import('./features/quotations/quotation-public/quotation-public.component').then(m => m.QuotationPublicComponent)
  },

  // Exclusão de conta (sem layout, sem sessão obrigatória): destinos dos links do email e despedida.
  {
    path: 'account-deletion/confirm',
    loadComponent: () => import('./features/account-deletion/confirm-account-deletion.component').then(m => m.ConfirmAccountDeletionComponent)
  },
  {
    path: 'account-deletion/cancel',
    loadComponent: () => import('./features/account-deletion/cancel-account-deletion.component').then(m => m.CancelAccountDeletionComponent)
  },
  {
    path: 'goodbye',
    loadComponent: () => import('./features/account-deletion/goodbye.component').then(m => m.GoodbyeComponent)
  },

  // Autenticação (sem layout)
  {
    path: 'auth',
    children: [
      {
        path: 'login',
        canActivate: [authRedirectGuard],
        loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent)
      },
      {
        path: 'register',
        loadComponent: () => import('./features/auth/register/register.component').then(m => m.RegisterComponent)
      },
      {
        path: 'forgot-password',
        loadComponent: () => import('./features/auth/forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent)
      },
      {
        path: 'reset-password',
        loadComponent: () => import('./features/auth/reset-password/reset-password.component').then(m => m.ResetPasswordComponent)
      },
      {
        path: 'verify-email',
        loadComponent: () => import('./features/auth/verify-email/verify-email.component').then(m => m.VerifyEmailComponent)
      },
      {
        path: 'accept-invitation',
        loadComponent: () => import('./features/auth/accept-invitation/accept-invitation.component').then(m => m.AcceptInvitationComponent)
      },
      {
        path: 'change-initial-password',
        canActivate: [authGuard],
        loadComponent: () => import('./features/auth/change-initial-password/change-initial-password.component').then(m => m.ChangeInitialPasswordComponent)
      },
      { path: '', redirectTo: 'login', pathMatch: 'full' }
    ]
  },

  // Onboarding do primeiro acesso do dono (issue #136): ecrã inteiro, sem sidebar — o portal
  // ainda está vazio e a navegação só distrairia. Dispensável a qualquer momento.
  {
    path: 'onboarding',
    canActivate: [authGuard, mustChangePasswordGuard, emailVerifiedGuard, profileCompleteGuard, roleGuard(['OWNER'])],
    loadComponent: () => import('./features/onboarding/onboarding.component').then(m => m.OnboardingComponent)
  },

  // Rotas protegidas (com layout)
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard, mustChangePasswordGuard, emailVerifiedGuard, profileCompleteGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        // Destino por omissão de roleGuard quando uma rota recusa acesso (issue #118).
        path: 'dashboard',
        canActivate: [dashboardRedirectGuard],
        children: []
      },
      {
        path: 'dashboard/owner',
        canActivate: [roleGuard(routeRoles('dashboard/owner'))],
        loadComponent: () => import('./features/dashboard/owner-dashboard.component').then(m => m.OwnerDashboardComponent)
      },
      {
        path: 'dashboard/commercial',
        canActivate: [roleGuard(routeRoles('dashboard/commercial'))],
        loadComponent: () => import('./features/dashboard/commercial-dashboard.component').then(m => m.CommercialDashboardComponent)
      },
      {
        path: 'dashboard/operator',
        canActivate: [roleGuard(routeRoles('dashboard/operator'))],
        loadComponent: () => import('./features/dashboard/operator-dashboard.component').then(m => m.OperatorDashboardComponent)
      },
      {
        path: 'dashboard/finance',
        canActivate: [roleGuard(routeRoles('dashboard/finance'))],
        loadComponent: () => import('./features/dashboard/finance-dashboard.component').then(m => m.FinanceDashboardComponent)
      },
      {
        path: 'profile',
        loadComponent: () => import('./features/profile/profile.component').then(m => m.ProfileComponent)
      },
      {
        path: 'customers',
        canActivate: [roleGuard(routeRoles('customers'))],
        loadComponent: () => import('./features/customers/customers.component').then(m => m.CustomersComponent)
      },
      {
        path: 'customers/imports',
        canActivate: [roleGuard(routeRoles('customers/imports'))],
        loadComponent: () => import('./features/customers/imports/customer-imports-history.component').then(m => m.CustomerImportsHistoryComponent)
      },
      {
        path: 'customers/imports/:id',
        canActivate: [roleGuard(routeRoles('customers/imports/:id'))],
        loadComponent: () => import('./features/customers/imports/customer-import-detail.component').then(m => m.CustomerImportDetailComponent)
      },
      {
        path: 'leads',
        canActivate: [roleGuard(routeRoles('leads'))],
        loadComponent: () => import('./features/leads/leads.component').then(m => m.LeadsComponent)
      },
      {
        path: 'quotations',
        canActivate: [roleGuard(routeRoles('quotations'))],
        loadComponent: () => import('./features/quotations/quotations.component').then(m => m.QuotationsComponent)
      },
      {
        path: 'quotations/:id/edit',
        canActivate: [roleGuard(routeRoles('quotations/:id/edit'))],
        loadComponent: () => import('./features/quotations/quotation-edit/quotation-edit.component').then(m => m.QuotationEditComponent)
      },
      {
        path: 'quotations/:id',
        canActivate: [roleGuard(routeRoles('quotations/:id'))],
        loadComponent: () => import('./features/quotations/quotation-view/quotation-view.component').then(m => m.QuotationViewComponent)
      },
      {
        path: 'orders',
        canActivate: [roleGuard(routeRoles('orders'))],
        loadComponent: () => import('./features/orders/orders.component').then(m => m.OrdersComponent)
      },
      { path: 'catalog', redirectTo: 'catalog/categories', pathMatch: 'full' },
      {
        path: 'catalog/categories',
        canActivate: [roleGuard(routeRoles('catalog/categories'))],
        loadComponent: () => import('./features/catalog/categories/categories.component').then(m => m.CategoriesComponent)
      },
      {
        path: 'catalog/services',
        canActivate: [roleGuard(routeRoles('catalog/services'))],
        loadComponent: () => import('./features/catalog/services/services.component').then(m => m.ServicesComponent)
      },
      {
        path: 'catalog/skills',
        canActivate: [roleGuard(routeRoles('catalog/skills'))],
        loadComponent: () => import('./features/catalog/skills/skills.component').then(m => m.SkillsComponent)
      },
      {
        path: 'providers',
        canActivate: [roleGuard(routeRoles('providers'))],
        loadComponent: () => import('./features/providers/providers.component').then(m => m.ProvidersComponent)
      },
      {
        path: 'routing',
        canActivate: [roleGuard(routeRoles('routing'))],
        loadComponent: () => import('./features/routing/routing.component').then(m => m.RoutingComponent)
      },
      {
        path: 'laundry',
        canActivate: [roleGuard(routeRoles('laundry')), laundryEnabledGuard],
        loadComponent: () => import('./features/laundry/laundry.component').then(m => m.LaundryComponent)
      },
      {
        path: 'laundry/history',
        canActivate: [roleGuard(routeRoles('laundry/history')), laundryEnabledGuard],
        loadComponent: () => import('./features/laundry/laundry-history/laundry-history.component').then(m => m.LaundryHistoryComponent)
      },
      {
        path: 'laundry/pending-delivery',
        canActivate: [roleGuard(routeRoles('laundry/pending-delivery')), laundryEnabledGuard],
        loadComponent: () => import('./features/laundry/laundry-pending-delivery/laundry-pending-delivery.component').then(m => m.LaundryPendingDeliveryComponent)
      },
      {
        path: 'financial/invoices',
        canActivate: [roleGuard(routeRoles('financial/invoices'))],
        loadComponent: () => import('./features/financial/invoices-tab/invoices-tab.component').then(m => m.InvoicesTabComponent)
      },
      {
        path: 'financial/payments',
        canActivate: [roleGuard(routeRoles('financial/payments'))],
        loadComponent: () => import('./features/financial/payments-tab/payments-tab.component').then(m => m.PaymentsTabComponent)
      },
      {
        path: 'financial/commissions',
        canActivate: [roleGuard(routeRoles('financial/commissions'))],
        loadComponent: () => import('./features/financial/commissions-tab/commissions-tab.component').then(m => m.CommissionsTabComponent)
      },
      { path: 'financial/rules', redirectTo: 'financial/commissions', pathMatch: 'full' },
      // A margem virou a aba "Resultado" da própria ordem — o link antigo leva à lista de ordens.
      { path: 'financial/margin', redirectTo: 'orders', pathMatch: 'full' },
      {
        path: 'automation/rules',
        canActivate: [roleGuard(routeRoles('automation/rules'))],
        loadComponent: () => import('./features/automation-rules/automation-rules.component').then(m => m.AutomationRulesComponent)
      },
      {
        path: 'automation/recurring-contracts',
        canActivate: [roleGuard(routeRoles('automation/recurring-contracts'))],
        loadComponent: () => import('./features/recurring-contracts/recurring-contracts.component').then(m => m.RecurringContractsComponent)
      },
      {
        path: 'retention/funnel',
        canActivate: [roleGuard(routeRoles('retention/funnel'))],
        loadComponent: () => import('./features/retention/reactivation-funnel/reactivation-funnel.component').then(m => m.ReactivationFunnelComponent)
      },
      {
        path: 'retention/recurrence-policies',
        canActivate: [roleGuard(routeRoles('retention/recurrence-policies'))],
        loadComponent: () => import('./features/retention/recurrence-policies/recurrence-policies.component').then(m => m.RecurrencePoliciesComponent)
      },
      // Automação era um único componente com abas (Regras/Recorrência) — split em duas
      // funcionalidades independentes; redirect mantém link/bookmark antigo vivo.
      { path: 'automation', redirectTo: 'automation/rules', pathMatch: 'full' },
      {
        path: 'intelligence',
        canActivate: [roleGuard(routeRoles('intelligence'))],
        loadComponent: () => import('./features/intelligence/intelligence.component').then(m => m.IntelligenceComponent)
      },
      {
        path: 'subscription',
        canActivate: [roleGuard(routeRoles('subscription'))],
        loadComponent: () => import('./features/subscription/subscription.component').then(m => m.SubscriptionComponent)
      },
      // Administração: hub único que agrupa Empresa/Operação (OWNER apenas — UpdateTenantUseCase
      // exige a identidade do dono) e Acesso e Equipe (OWNER/ADMIN). Substitui os itens soltos
      // que existiam antes (Empresa, Equipe, Funções, Definições, Plano) na sidebar.
      {
        path: 'administration',
        canActivate: [roleGuard(routeRoles('administration'))],
        loadComponent: () => import('./features/administration/administration.component').then(m => m.AdministrationComponent)
      },
      {
        path: 'administration/company',
        canActivate: [roleGuard(routeRoles('administration/company'))],
        loadComponent: () => import('./features/administration/company-info/company-info.component').then(m => m.CompanyInfoComponent)
      },
      {
        path: 'administration/units',
        canActivate: [roleGuard(routeRoles('administration/units'))],
        loadComponent: () => import('./features/administration/units-page/units-page.component').then(m => m.UnitsPageComponent)
      },
      {
        path: 'administration/owner',
        canActivate: [roleGuard(routeRoles('administration/owner'))],
        loadComponent: () => import('./features/administration/owner-info/owner-info.component').then(m => m.OwnerInfoComponent)
      },
      {
        path: 'administration/system-parameters',
        canActivate: [roleGuard(routeRoles('administration/system-parameters'))],
        loadComponent: () => import('./features/administration/system-parameters/system-parameters.component').then(m => m.SystemParametersComponent)
      },
      {
        path: 'administration/laundry-facilities',
        canActivate: [roleGuard(routeRoles('administration/laundry-facilities')), laundryEnabledGuard],
        loadComponent: () => import('./features/administration/laundry-facilities/laundry-facilities.component').then(m => m.LaundryFacilitiesComponent)
      },
      {
        path: 'administration/payment-methods',
        canActivate: [roleGuard(routeRoles('administration/payment-methods'))],
        loadComponent: () => import('./features/administration/payment-methods/payment-methods.component').then(m => m.PaymentMethodsComponent)
      },
      {
        path: 'administration/checklist',
        canActivate: [roleGuard(routeRoles('administration/checklist'))],
        loadComponent: () => import('./features/administration/checklist/checklist.component').then(m => m.ChecklistComponent)
      },
      {
        path: 'administration/whatsapp-business',
        canActivate: [roleGuard(routeRoles('administration/whatsapp-business'))],
        loadComponent: () => import('./features/administration/whatsapp-business/whatsapp-business.component').then(m => m.WhatsAppBusinessComponent)
      },
      {
        path: 'administration/team',
        canActivate: [roleGuard(routeRoles('administration/team'))],
        loadComponent: () => import('./features/tenant-users/tenant-users.component').then(m => m.TenantUsersComponent)
      },
      {
        path: 'notifications/preferences',
        loadComponent: () => import('./features/notifications/notification-preferences.component').then(m => m.NotificationPreferencesComponent)
      },
      {
        path: 'notifications',
        loadComponent: () => import('./features/notifications/notifications.component').then(m => m.NotificationsComponent)
      },
      {
        path: 'admin',
        canActivate: [roleGuard(routeRoles('admin'))],
        loadComponent: () => import('./features/admin/admin.component').then(m => m.AdminComponent)
      },
    ]
  },

  { path: '**', redirectTo: '/auth/login' }
];
