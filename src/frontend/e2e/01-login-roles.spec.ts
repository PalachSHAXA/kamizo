import { test, expect } from '@playwright/test';
import { apiLogin, loginAs, type Role } from './helpers/auth';

const ROLES: { role: Role; label: string }[] = [
  { role: 'superadmin', label: 'Super Admin' },
  { role: 'admin', label: 'Администратор' },
  { role: 'director', label: 'Директор Демо' },
  { role: 'manager', label: 'Управляющий' },
  { role: 'department_head', label: 'Глава отдела' },
  { role: 'dispatcher', label: 'Диспетчер Демо' },
  { role: 'resident', label: 'Житель Демо' },
  { role: 'executor', label: 'Исполнитель Демо' },
  { role: 'security', label: 'Охранник Демо' },
];

test.describe('Auth: API login per role', () => {
  for (const { role } of ROLES) {
    test(`api login: ${role}`, async () => {
      const { user, token } = await apiLogin(role);
      expect(user).toBeTruthy();
      expect(token).toMatch(/^eyJ/);
      expect(user.role).toBeTruthy();
    });
  }
});

test.describe('UI: dashboard loads for each role', () => {
  for (const { role } of ROLES) {
    test(`dashboard renders: ${role}`, async ({ page }) => {
      await loginAs(page, role);
      await page.goto('/');
      // Wait for either dashboard content or an unmistakable layout element.
      // Be lenient — different roles see different headings.
      await page.waitForLoadState('networkidle');
      await expect(page).not.toHaveURL(/\/login/);
      // Body should not be empty / pure error
      const body = await page.locator('body').innerText();
      expect(body.length).toBeGreaterThan(20);
    });
  }
});
