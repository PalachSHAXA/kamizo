import { test, expect } from './fixtures';
import { apiLogin, loginAs, type Role } from './helpers/auth';

const ROLES: { role: Role; expectedRole: string }[] = [
  { role: 'superadmin', expectedRole: 'super_admin' },
  { role: 'admin', expectedRole: 'admin' },
  { role: 'director', expectedRole: 'director' },
  { role: 'manager', expectedRole: 'manager' },
  { role: 'department_head', expectedRole: 'department_head' },
  { role: 'dispatcher', expectedRole: 'dispatcher' },
  { role: 'resident', expectedRole: 'resident' },
  { role: 'executor', expectedRole: 'executor' },
  { role: 'security', expectedRole: 'security' },
  { role: 'advertiser', expectedRole: 'advertiser' },
];
const DASHBOARD_ROLES = ROLES.filter(({ role }) => role !== 'advertiser');
const ROLE_SURFACES: Record<string, {
  kind: 'heading' | 'button' | 'text';
  marker: RegExp;
  negative?: RegExp;
  url?: RegExp;
}> = {
  superadmin: { kind: 'heading', marker: /^Kamizo$/, negative: /^Панель управления$/ },
  admin: { kind: 'heading', marker: /^Панель управления$/, negative: /^Обзор компании$/ },
  director: { kind: 'heading', marker: /^Обзор компании$/, negative: /^Панель управления$/ },
  manager: { kind: 'text', marker: /^Менеджер$/, negative: /^Обзор компании$/ },
  department_head: { kind: 'heading', marker: /^Отдел:/, negative: /^Панель управления$/ },
  dispatcher: { kind: 'text', marker: /^Диспетчер$/, negative: /^Обзор компании$/ },
  resident: { kind: 'button', marker: /^(Заявка|Ariza)$/, negative: /^Панель управления$/ },
  executor: { kind: 'heading', marker: /^Исполнитель$/, negative: /^Панель управления$/ },
  security: { kind: 'text', marker: /^(Сканер QR|QR skaner)$/, negative: /^Панель управления$/, url: /\/qr-scanner$/ },
};

test.describe('Auth: API login per role', () => {
  for (const { role, expectedRole } of ROLES) {
    test(`api login: ${role}`, async () => {
      const { user, token } = await apiLogin(role);
      expect(user).toBeTruthy();
      expect(token).toMatch(/^eyJ/);
      expect(user.role).toBe(expectedRole);
    });
  }
});

test.describe('UI: dashboard loads for each role', () => {
  for (const { role, expectedRole } of DASHBOARD_ROLES) {
    test(`dashboard renders: ${role}`, async ({ page }) => {
      await loginAs(page, role);
      await page.goto('/');
      // Wait for either dashboard content or an unmistakable layout element.
      // Be lenient — different roles see different headings.
      await page.waitForLoadState('domcontentloaded');
      await expect(page).not.toHaveURL(/\/login/);
      const surface = ROLE_SURFACES[role];
      if (surface.url) await expect(page).toHaveURL(surface.url);
      const marker = surface.kind === 'heading'
        ? page.getByRole('heading', { name: surface.marker })
        : surface.kind === 'button'
          ? page.getByRole('button', { name: surface.marker })
          : page.getByText(surface.marker);
      await expect(marker.first()).toBeVisible({ timeout: 20_000 });
      if (surface.negative) {
        await expect(page.getByRole('heading', { name: surface.negative })).toHaveCount(0);
      }
      const storedRole = await page.evaluate(() => {
        const raw = localStorage.getItem('uk-auth-storage');
        return raw ? JSON.parse(raw).state?.user?.role : null;
      });
      expect(storedRole).toBe(expectedRole);
    });
  }
});
