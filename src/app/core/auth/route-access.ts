import { UserRole } from '../models/user.model';

/**
 * Fonte única de "quem pode abrir esta rota do portal". Lida por `app.routes.ts` (roleGuard) e
 * pela sidebar (que só mostra o que o perfil consegue abrir) — se as duas lessem listas
 * diferentes, o menu voltaria a oferecer páginas que respondem "acesso negado".
 *
 * Cada entrada tem de espelhar o `@PreAuthorize` dos endpoints que a página carrega ao abrir
 * (READ_ROLES do controller correspondente): o guard esconde a página, o backend continua a ser
 * a camada de segurança real. Ao mudar um perfil aqui, mudar o controller no mesmo commit.
 */
export const ROUTE_ROLES: Record<string, readonly UserRole[]> = {
  'dashboard/owner': ['OWNER', 'ADMIN'],
  'dashboard/commercial': ['COMMERCIAL'],
  'dashboard/operator': ['OPERATOR'],
  'dashboard/finance': ['FINANCE'],
  'customers': ['OWNER', 'ADMIN', 'COMMERCIAL', 'OPERATOR', 'FINANCE'],
  'customers/imports': ['OWNER', 'ADMIN', 'COMMERCIAL', 'OPERATOR', 'FINANCE'],
  'customers/imports/:id': ['OWNER', 'ADMIN', 'COMMERCIAL', 'OPERATOR', 'FINANCE'],
  'leads': ['OWNER', 'ADMIN', 'COMMERCIAL', 'OPERATOR', 'FINANCE'],
  'quotations': ['OWNER', 'ADMIN', 'COMMERCIAL', 'OPERATOR', 'FINANCE'],
  'quotations/:id/edit': ['OWNER', 'ADMIN', 'COMMERCIAL', 'OPERATOR', 'FINANCE'],
  'quotations/:id': ['OWNER', 'ADMIN', 'COMMERCIAL', 'OPERATOR', 'FINANCE'],
  'orders': ['OWNER', 'ADMIN', 'COMMERCIAL', 'OPERATOR', 'FINANCE', 'TECHNICIAN'],
  'catalog/categories': ['OWNER', 'ADMIN', 'COMMERCIAL', 'OPERATOR', 'FINANCE'],
  'catalog/services': ['OWNER', 'ADMIN', 'COMMERCIAL', 'OPERATOR', 'FINANCE'],
  'catalog/skills': ['OWNER', 'ADMIN', 'COMMERCIAL', 'OPERATOR', 'FINANCE'],
  'providers': ['OWNER', 'ADMIN', 'COMMERCIAL', 'OPERATOR', 'FINANCE'],
  'routing': ['OWNER', 'ADMIN', 'OPERATOR', 'TECHNICIAN'],
  'laundry': ['OWNER', 'ADMIN', 'OPERATOR', 'LAUNDRY'],
  'laundry/history': ['OWNER', 'ADMIN', 'OPERATOR', 'LAUNDRY'],
  'laundry/pending-delivery': ['OWNER', 'ADMIN', 'OPERATOR', 'LAUNDRY'],
  'financial/invoices': ['OWNER', 'ADMIN', 'FINANCE'],
  'financial/payments': ['OWNER', 'ADMIN', 'FINANCE'],
  'financial/commissions': ['OWNER', 'ADMIN', 'FINANCE'],
  'automation/rules': ['OWNER', 'ADMIN', 'OPERATOR'],
  'automation/recurring-contracts': ['OWNER', 'ADMIN', 'OPERATOR', 'COMMERCIAL'],
  'retention/funnel': ['OWNER', 'ADMIN', 'COMMERCIAL', 'OPERATOR', 'FINANCE'],
  'retention/recurrence-policies': ['OWNER', 'ADMIN', 'COMMERCIAL', 'OPERATOR', 'FINANCE'],
  'intelligence': ['OWNER', 'ADMIN', 'OPERATOR', 'COMMERCIAL'],
  'subscription': ['OWNER', 'ADMIN'],
  'administration': ['OWNER', 'ADMIN'],
  'administration/company': ['OWNER'],
  'administration/units': ['OWNER'],
  'administration/owner': ['OWNER'],
  'administration/system-parameters': ['OWNER'],
  'administration/laundry-facilities': ['OWNER', 'ADMIN'],
  'administration/payment-methods': ['OWNER', 'ADMIN'],
  'administration/checklist': ['OWNER', 'ADMIN'],
  'administration/whatsapp-business': ['OWNER', 'ADMIN'],
  'administration/team': ['OWNER', 'ADMIN'],
  'admin': ['PLATFORM_ADMIN'],
};

export function routeRoles(path: string): UserRole[] {
  const roles = ROUTE_ROLES[path];
  if (!roles) throw new Error(`Rota sem perfis definidos em ROUTE_ROLES: ${path}`);
  return [...roles];
}

/** Rota sem entrada (perfil, notificações) é aberta a qualquer utilizador autenticado. */
export function canAccessRoute(path: string, role: UserRole | null): boolean {
  const key = path.startsWith('/') ? path.slice(1) : path;
  const roles = ROUTE_ROLES[key];
  if (!roles) return role !== null;
  return role !== null && roles.includes(role);
}
