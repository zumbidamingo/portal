import { canAccessRoute } from '../../core/auth/route-access';
import { UserRole } from '../../core/models/user.model';

export interface NavItem {
  label: string;
  icon: string;
  route: string;
  /** Item é um hub com sub-rotas próprias (ex.: /administration/company) — marcar ativo em
   * qualquer descendente da rota, não só na página índice exata. */
  matchPrefix?: boolean;
  /** Central de IA: sem IA no plano só aparece a quem pode assinar (OWNER/ADMIN) — para os outros
   * seria uma página vazia sem saída. */
  requiresAiOrPlanManager?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Menu inteiro, na ordem em que o dono pensa o negócio: vender → executar → receber, depois os
 * cadastros que alimentam os três e, por último, o que trabalha sozinho (automação e IA). A mesma
 * ordem para todos os perfis — cada um vê um recorte, nunca uma arrumação diferente.
 *
 * Nenhum perfil é escrito aqui: quem vê cada item é o `ROUTE_ROLES` (o mesmo do roleGuard), por
 * isso o menu nunca oferece uma tela que responde "acesso negado". O painel é um item por perfil,
 * e o `ROUTE_ROLES` já dá exatamente um a cada um.
 */
const NAV_GROUPS: NavGroup[] = [
  {
    label: '',
    items: [
      { label: 'nav.dashboard', icon: 'pi pi-gauge', route: '/dashboard/owner' },
      { label: 'nav.dashboardCommercial', icon: 'pi pi-gauge', route: '/dashboard/commercial' },
      { label: 'nav.dashboardOperator', icon: 'pi pi-gauge', route: '/dashboard/operator' },
      { label: 'nav.dashboardFinance', icon: 'pi pi-gauge', route: '/dashboard/finance' },
      { label: 'nav.admin', icon: 'pi pi-shield', route: '/admin' },
    ],
  },
  {
    // Conquistar e manter clientes: do primeiro contacto ao cliente que já devia ter voltado.
    label: 'nav.section.commercial',
    items: [
      { label: 'nav.leads', icon: 'pi pi-inbox', route: '/leads' },
      { label: 'nav.quotations', icon: 'pi pi-file-check', route: '/quotations' },
      { label: 'nav.customers', icon: 'pi pi-address-book', route: '/customers' },
      { label: 'nav.automationRecurringContracts', icon: 'pi pi-sync', route: '/automation/recurring-contracts' },
      { label: 'nav.retentionFunnel', icon: 'pi pi-replay', route: '/retention/funnel' },
    ],
  },
  {
    // Executar o serviço vendido.
    label: 'nav.section.operations',
    items: [
      { label: 'nav.orders', icon: 'pi pi-calendar', route: '/orders' },
      { label: 'nav.routing', icon: 'pi pi-map', route: '/routing' },
      { label: 'nav.laundry', icon: 'pi pi-box', route: '/laundry' },
    ],
  },
  {
    label: 'nav.section.financial',
    items: [
      { label: 'nav.financialInvoices', icon: 'pi pi-receipt', route: '/financial/invoices' },
      { label: 'nav.financialPayments', icon: 'pi pi-wallet', route: '/financial/payments' },
      { label: 'nav.financialCommissions', icon: 'pi pi-percentage', route: '/financial/commissions' },
    ],
  },
  {
    // Dados de referência que os fluxos acima consomem: o que se vende, quem executa e de quanto
    // em quanto tempo cada serviço devia voltar a ser feito.
    label: 'nav.section.registry',
    items: [
      { label: 'nav.catalogServices', icon: 'pi pi-th-large', route: '/catalog/services' },
      { label: 'nav.catalogCategories', icon: 'pi pi-tags', route: '/catalog/categories' },
      { label: 'nav.catalogSkills', icon: 'pi pi-sparkles', route: '/catalog/skills' },
      { label: 'nav.providers', icon: 'pi pi-id-card', route: '/providers' },
      { label: 'nav.retentionPolicies', icon: 'pi pi-history', route: '/retention/recurrence-policies' },
    ],
  },
  {
    label: 'nav.section.automationAi',
    items: [
      { label: 'nav.automationRules', icon: 'pi pi-bolt', route: '/automation/rules' },
      { label: 'nav.intelligence', icon: 'pi pi-microchip-ai', route: '/intelligence', requiresAiOrPlanManager: true },
    ],
  },
];

/** Configuração da empresa: fica fixa no rodapé, fora do fluxo do dia a dia. */
const FOOTER_ITEMS: NavItem[] = [
  { label: 'nav.administration', icon: 'pi pi-cog', route: '/administration', matchPrefix: true },
];

/**
 * Perfis com menu no portal. TECHNICIAN trabalha na app de campo e não tem menu aqui, mesmo com
 * /orders e /routing abertos no ROUTE_ROLES.
 */
const ROLES_WITH_MENU: readonly UserRole[] = ['OWNER', 'ADMIN', 'COMMERCIAL', 'OPERATOR', 'FINANCE', 'LAUNDRY', 'PLATFORM_ADMIN'];

/** O que a empresa tem ligado e que muda o menu sem mudar permissões. */
export interface NavContext {
  laundryActive: boolean;
  /** Plano com IA (`/tenants/me` → `intelligence`); `false` enquanto a empresa não carregou. */
  hasAi: boolean;
}

/**
 * Menu do perfil: filtro pelo `ROUTE_ROLES` (a mesma tabela do roleGuard), sem as telas de
 * lavanderia quando a empresa não as usa (plano sem o módulo ou desligado em Parâmetros do Sistema)
 * e sem a Central de IA para quem não a pode usar nem assinar. Grupo esvaziado desaparece.
 */
export function navigationFor(role: UserRole | null, ctx: NavContext): { groups: NavGroup[]; footer: NavItem[] } {
  if (!role || !ROLES_WITH_MENU.includes(role)) return { groups: [], footer: [] };
  const visible = (item: NavItem): boolean => {
    if (!canAccessRoute(item.route, role)) return false;
    if (item.route.startsWith('/laundry') && !ctx.laundryActive) return false;
    if (item.requiresAiOrPlanManager) return role === 'OWNER' || role === 'ADMIN' || ctx.hasAi;
    return true;
  };
  return {
    groups: NAV_GROUPS
      .map(g => ({ ...g, items: g.items.filter(visible) }))
      .filter(g => g.items.length > 0),
    footer: FOOTER_ITEMS.filter(visible),
  };
}
