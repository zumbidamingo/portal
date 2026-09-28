import { describe, expect, it } from 'vitest';
import { canAccessRoute } from '../../core/auth/route-access';
import { UserRole } from '../../core/models/user.model';
import { navigationFor, NavContext } from './sidebar-navigation';

const FULL: NavContext = { laundryActive: true, hasAi: true };
const ALL_ROLES: UserRole[] = ['OWNER', 'ADMIN', 'COMMERCIAL', 'OPERATOR', 'FINANCE', 'TECHNICIAN', 'LAUNDRY', 'PLATFORM_ADMIN'];

function routes(role: UserRole | null, ctx: NavContext = FULL): string[] {
  const nav = navigationFor(role, ctx);
  return [...nav.groups.flatMap(g => g.items), ...nav.footer].map(i => i.route);
}

describe('navigationFor', () => {
  it('never offers a route the role cannot open', () => {
    for (const role of ALL_ROLES) {
      for (const route of routes(role)) {
        expect(canAccessRoute(route, role), `${role} → ${route}`).toBe(true);
      }
    }
  });

  it('gives every management role exactly one dashboard', () => {
    for (const role of ['OWNER', 'ADMIN', 'COMMERCIAL', 'OPERATOR', 'FINANCE'] as UserRole[]) {
      expect(routes(role).filter(r => r.startsWith('/dashboard/')), role).toHaveLength(1);
    }
  });

  it('keeps the owner reaching every management screen of the portal', () => {
    expect(routes('OWNER')).toEqual([
      '/dashboard/owner',
      '/leads', '/quotations', '/customers', '/automation/recurring-contracts', '/retention/funnel',
      '/orders', '/routing', '/laundry',
      '/financial/invoices', '/financial/payments', '/financial/commissions',
      '/catalog/services', '/catalog/categories', '/catalog/skills', '/providers', '/retention/recurrence-policies',
      '/automation/rules', '/intelligence',
      '/administration',
    ]);
  });

  it('shows no billing to commercial and no dispatch to finance', () => {
    expect(routes('COMMERCIAL').some(r => r.startsWith('/financial'))).toBe(false);
    expect(routes('FINANCE')).not.toContain('/routing');
    expect(routes('FINANCE')).not.toContain('/laundry');
  });

  it('leaves administration to OWNER and ADMIN', () => {
    expect(navigationFor('OWNER', FULL).footer.map(i => i.route)).toEqual(['/administration']);
    expect(navigationFor('OPERATOR', FULL).footer).toEqual([]);
  });

  it('gives the laundry operator only the laundry and the platform admin only the platform', () => {
    expect(routes('LAUNDRY')).toEqual(['/laundry']);
    expect(routes('PLATFORM_ADMIN')).toEqual(['/admin']);
  });

  it('has no menu for technicians or anonymous users', () => {
    expect(routes('TECHNICIAN')).toEqual([]);
    expect(routes(null)).toEqual([]);
  });

  it('hides the laundry when the company does not use it, dropping emptied groups', () => {
    expect(routes('OWNER', { ...FULL, laundryActive: false })).not.toContain('/laundry');
    expect(routes('LAUNDRY', { ...FULL, laundryActive: false })).toEqual([]);
  });

  it('shows the AI center without AI only to who can subscribe', () => {
    const noAi = { ...FULL, hasAi: false };
    expect(routes('OWNER', noAi)).toContain('/intelligence');
    expect(routes('OPERATOR', noAi)).not.toContain('/intelligence');
    expect(routes('OPERATOR', FULL)).toContain('/intelligence');
  });

  it('never repeats a route across groups', () => {
    const all = routes('OWNER');
    expect(new Set(all).size).toBe(all.length);
  });
});
