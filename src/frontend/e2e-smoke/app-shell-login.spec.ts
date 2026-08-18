import { expect, test } from '@playwright/test';

const viewports = [
  { name: 'desktop-boundary', width: 768, height: 720 },
  { name: 'narrow-mobile', width: 320, height: 667 },
] as const;

for (const viewport of viewports) {
  test(`login app shell is responsive on ${viewport.name}`, async ({ page }) => {
    const mutationRequests: string[] = [];

    await page.route('https://api.kamizo.uz/**', async (route) => {
      const request = route.request();
      if (request.method() !== 'GET') {
        mutationRequests.push(`${request.method()} ${request.url()}`);
        await route.abort('blockedbyclient');
        return;
      }

      const pathname = new URL(request.url()).pathname;
      if (pathname === '/api/tenant/config') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tenant: null, features: [], context: 'apex' }),
        });
        return;
      }

      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: 'Добро пожаловать' })).toBeVisible();
    await expect(page.locator('#login-field')).toBeVisible();
    await expect(page.locator('#password-field')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
    expect(mutationRequests).toEqual([]);

    const breakpoint = await page.evaluate(() => ({
      mobile: matchMedia('(max-width: 767px)').matches,
      desktop: matchMedia('(min-width: 768px)').matches,
    }));
    expect(breakpoint.mobile).toBe(viewport.width === 320);
    expect(breakpoint.desktop).toBe(viewport.width === 768);
  });
}

test('demo gate isolates screen-reader and keyboard access at 320px', async ({ page }) => {
  await page.route('https://api.kamizo.uz/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/tenant/config') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tenant: { id: 'demo-1', name: 'Kamizo Demo', slug: 'demo', color: '#f97316', color_secondary: '#ea580c', plan: 'pro', logo: null, is_demo: true },
          features: [],
          context: 'tenant',
        }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.setViewportSize({ width: 320, height: 667 });
  await page.goto('/login');
  const gate = page.getByRole('dialog', { name: 'Kamizo Demo' });
  await expect(gate).toBeVisible();
  await expect(page.locator('[data-login-page]')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('[data-login-page]')).toHaveAttribute('inert', '');

  await page.keyboard.press('Escape');
  await expect(gate).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Пароль доступа')).toBeFocused();

  const metrics = await gate.evaluate((element) => {
    const input = element.querySelector('input')!;
    const button = element.querySelector('button')!;
    return {
      inputFontSize: getComputedStyle(input).fontSize,
      inputHeight: input.getBoundingClientRect().height,
      buttonHeight: button.getBoundingClientRect().height,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });
  expect(metrics.inputFontSize).toBe('16px');
  expect(metrics.inputHeight).toBeGreaterThanOrEqual(44);
  expect(metrics.buttonHeight).toBeGreaterThanOrEqual(44);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
});

test('demo role grid is backend-driven, touch-safe, and password-free', async ({ page }) => {
  const roles = [
    { roleKey: 'director', login: 'demo-director', name: 'Демо Директор', role: 'director', specialization: null, primary: true, order: 10, requiredFeature: null },
    { roleKey: 'manager', login: 'demo-manager', name: 'Дилноза Рахимова', role: 'manager', specialization: null, primary: true, order: 20, requiredFeature: 'requests' },
    { roleKey: 'resident', login: 'demo-resident', name: 'Тимур Юсупов', role: 'resident', specialization: null, primary: true, order: 30, requiredFeature: 'requests' },
    { roleKey: 'executor', login: 'demo-executor', name: 'Рустам Ибрагимов', role: 'executor', specialization: 'plumber', primary: true, order: 40, requiredFeature: 'requests' },
    { roleKey: 'security', login: 'demo-security', name: 'Отабек Норматов', role: 'security', specialization: 'security', primary: true, order: 50, requiredFeature: 'qr' },
    { roleKey: 'marketplace_manager', login: 'demo-shop', name: 'Гулнора Тошева', role: 'marketplace_manager', specialization: null, primary: true, order: 60, requiredFeature: 'marketplace' },
    { roleKey: 'admin', login: 'demo-admin', name: 'Администратор', role: 'admin', specialization: null, primary: false, order: 70, requiredFeature: null },
  ];
  let loginBody: unknown;

  await page.addInitScript(() => sessionStorage.setItem('kamizo_demo_gate', '1'));
  await page.route('https://api.kamizo.uz/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/api/tenant/config') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tenant: { id: 'demo-1', name: 'Kamizo Demo', slug: 'demo', color: '#f97316', color_secondary: '#ea580c', plan: 'pro', logo: null, is_demo: true },
          features: ['requests', 'qr', 'marketplace'],
          context: 'tenant',
        }),
      });
      return;
    }
    if (pathname === '/api/auth/demo-roles') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ roles }) });
      return;
    }
    if (pathname === '/api/auth/demo-login') {
      loginBody = request.postDataJSON();
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Smoke stop' }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.setViewportSize({ width: 320, height: 667 });
  await page.goto('/login');
  const primary = page.getByRole('group', { name: 'Основные роли' });
  await expect(primary.getByRole('button')).toHaveCount(6);
  await expect(page.getByText('Другие роли')).toBeVisible();

  const metrics = await primary.getByRole('button').evaluateAll((buttons) => buttons.map((button) => {
    const rect = button.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }));
  expect(metrics.every(({ height }) => height >= 44)).toBe(true);
  expect(metrics.every(({ width }) => width > 200)).toBe(true);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await primary.getByRole('button', { name: /Директор/ }).click();
  await expect.poll(() => loginBody).toEqual({ roleKey: 'director' });
  expect(JSON.stringify(loginBody)).not.toContain('password');

  await page.getByText('Войти вручную').click();
  await expect(page.getByLabel('Логин')).toBeVisible();
  await expect(page.locator('#password-field')).toBeVisible();
});
