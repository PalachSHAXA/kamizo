import { describe, expect, it } from 'vitest';
import {
  ADMIN_NAV_ROLES,
  adminRouteRoles,
  getAdminNavigation,
  getBottomNavigation,
  getRouteRoles,
  isResidentGuestAccessRole,
  isResidentMeetingsRole,
  isStaffShellRole,
  resolveBottomNavigationActiveId,
} from '../adminNavigation';

describe('admin navigation manifest', () => {
  it.each(ADMIN_NAV_ROLES)('keeps %s bottom routes in the drawer manifest', (role) => {
    const drawerPaths = getAdminNavigation(role, 'ru').map(item => item.path);
    const bottomItems = getBottomNavigation(role, 'ru');

    expect(bottomItems.length).toBeLessThanOrEqual(3);
    expect(bottomItems.every(item => drawerPaths.includes(item.path))).toBe(true);
  });

  it('limits dispatcher navigation to operational routes', () => {
    expect(getAdminNavigation('dispatcher', 'ru').map(item => item.path)).toEqual([
      '/',
      '/requests',
      '/work-orders',
      '/executors',
    ]);

    expect(getAdminNavigation('dispatcher', 'ru').map(item => item.label)).not.toEqual(
      expect.arrayContaining(['Жильцы', 'Дома', 'Финансы', 'Отчёты', 'Настройки']),
    );
  });

  it('gives dispatcher Home, Requests, Executors and More on mobile', () => {
    expect(getBottomNavigation('dispatcher', 'ru').map(item => item.id)).toEqual([
      'home',
      'requests',
      'executors',
    ]);
  });

  it('activates More instead of Home for a secondary drawer route', () => {
    const drawer = getAdminNavigation('dispatcher', 'ru');
    const bottom = getBottomNavigation('dispatcher', 'ru');

    expect(resolveBottomNavigationActiveId('/work-orders', '', bottom, drawer)).toBe('more');
  });

  it('leaves every tab inactive for an unknown secondary route', () => {
    const drawer = getAdminNavigation('dispatcher', 'ru');
    const bottom = getBottomNavigation('dispatcher', 'ru');

    expect(resolveBottomNavigationActiveId('/unknown', '', bottom, drawer)).toBeNull();
  });

  it.each([
    ['admin', '/executors'],
    ['director', '/executors'],
    ['director', '/work-orders'],
    ['department_head', '/work-orders'],
  ] as const)('exposes authorized secondary route %s -> %s in the drawer only', (role, path) => {
    expect(adminRouteRoles(path === '/executors' ? 'executors' : 'workOrders')).toContain(role);
    expect(getAdminNavigation(role, 'ru').map(item => item.path)).toContain(path);
    expect(getBottomNavigation(role, 'ru').map(item => item.path)).not.toContain(path);
  });

  it.each(ADMIN_NAV_ROLES)('renders exactly three %s primaries before More', (role) => {
    expect(getBottomNavigation(role, 'ru')).toHaveLength(3);
  });

  it.each(['admin', 'director', 'manager', 'department_head', 'dispatcher'] as const)(
    'marks %s as a staff shell role',
    (role) => expect(isStaffShellRole(role)).toBe(true),
  );

  it('does not mark resident-like roles as staff shells', () => {
    expect(isStaffShellRole('resident')).toBe(false);
    expect(isStaffShellRole('commercial_owner')).toBe(false);
  });

  it('routes commercial owners to resident meetings and guest access', () => {
    expect(isResidentMeetingsRole('commercial_owner')).toBe(true);
    expect(isResidentGuestAccessRole('commercial_owner')).toBe(true);
    expect(getRouteRoles('meetings')).toContain('commercial_owner');
    expect(getRouteRoles('guestAccess')).toContain('commercial_owner');
    expect(getRouteRoles('contract')).toEqual(['resident', 'tenant', 'commercial_owner']);
  });
});
