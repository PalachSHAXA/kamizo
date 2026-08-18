import { request as playwrightRequest, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { demoTest as test, expect } from './fixtures';
import { API, tokenFile } from './helpers/auth';
import { demoCommerceExpectedOrderStatuses } from '../../../cloudflare/src/lib/demo/order-statuses.mjs';

const DEMO_ORIGIN = 'https://demo.kamizo.uz';
const PRIMARY_ROLES = [
  { key: 'director', label: /^Директор$/, role: 'director', marker: /^Обзор компании$/ },
  { key: 'manager', label: /^Управляющий$/, role: 'manager', marker: /^Панель управления$/ },
  { key: 'resident', label: /^Житель$/, role: 'resident', marker: /^(Заявка|Ariza)$/ },
  { key: 'executor', label: /^Сантехник$/, role: 'executor', marker: /^Сантехник$/ },
  { key: 'security', label: /^Охранник$/, role: 'security', marker: /^(Сканер QR|QR skaner)$/ },
  { key: 'marketplace_manager', label: /^Менеджер магазина$/, role: 'marketplace_manager', marker: /^Управление товарами$/ },
] as const;
const SECONDARY_ROLES = [
  { key: 'admin', role: 'admin', specialization: null, marker: /^Панель управления$/ },
  { key: 'department_head', role: 'department_head', specialization: 'plumber', marker: /^Отдел: Сантехник$/ },
  { key: 'dispatcher', role: 'dispatcher', specialization: null, marker: /^Панель управления$/ },
  { key: 'electrician', role: 'executor', specialization: 'electrician', marker: /^Электрик$/ },
  { key: 'courier', role: 'executor', specialization: 'courier', marker: /^Мои доставки$/ },
  { key: 'tenant', role: 'tenant', specialization: null, marker: /^Мои квартиры$/ },
  { key: 'advertiser', role: 'advertiser', specialization: null, marker: /^Рекламный кабинет$/ },
] as const;
const FINANCE_READ_ONLY_BANNER = 'Демо-режим: финансовые данные доступны только для просмотра';
type FinanceReadOnlyPage = {
  key: string;
  path: string;
  roleKey: 'admin' | 'director' | 'manager';
  heading?: string;
  headingExact?: boolean;
  absentText?: string[];
  absentButtons?: Array<string | RegExp>;
  visibleButtons?: string[];
  coldLoad?: boolean;
};
const FINANCE_READ_ONLY_PAGES: FinanceReadOnlyPage[] = [
  {
    key: 'charges',
    path: '/finance/charges',
    roleKey: 'director',
    heading: 'Начисления',
    absentButtons: [/Открыть оплату квартиры/],
    coldLoad: true,
  },
  {
    key: 'estimates',
    path: '/finance/estimates',
    roleKey: 'manager',
    heading: 'Сметы',
    absentText: ['Создать смету', 'Редактировать', 'Удалить'],
    coldLoad: true,
  },
  {
    key: 'materials',
    path: '/finance/materials',
    roleKey: 'director',
    heading: 'Материалы',
    absentText: ['Добавить материал', 'Списать'],
  },
  {
    key: 'income',
    path: '/finance/income',
    roleKey: 'admin',
    heading: 'Доходы УК',
    absentText: ['Добавить доход', 'Категории'],
  },
  {
    key: 'expenses',
    path: '/finance/expenses',
    roleKey: 'director',
    heading: 'Расходы',
    headingExact: true,
    absentText: ['Добавить расход'],
  },
  {
    key: 'settings',
    path: '/finance/settings',
    roleKey: 'admin',
    heading: 'Настройки доступа',
    absentText: ['Дать доступ', 'Отозвать'],
    absentButtons: ['Сохранить'],
  },
  {
    key: 'debtors',
    path: '/finance/debtors',
    roleKey: 'director',
    heading: 'Должники',
    absentButtons: ['Претензия', 'Сверка'],
  },
  {
    key: 'new estimate',
    path: '/finance/estimates/v2/new',
    roleKey: 'manager',
    heading: 'Новая смета',
    absentButtons: ['Далее →'],
    coldLoad: true,
  },
  {
    key: 'fact report',
    path: '/finance/reports/fact',
    roleKey: 'director',
    visibleButtons: ['Построить'],
  },
];

type AuthResult = { token: string; user: Record<string, any>; demoSession?: true };
type StatusResult = { counts: Record<string, number>; ready: Record<string, boolean> };
type OverlaySeed = AuthResult & { shownPopupIds: string[] };

async function api(
  method: string,
  path: string,
  options: { token?: string; data?: unknown; ip?: string } = {},
): Promise<{ status: number; body: any }> {
  const ctx = await playwrightRequest.newContext();
  try {
    const response = await ctx.fetch(`${API}${path}`, {
      method,
      headers: {
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        'content-type': 'application/json',
        origin: DEMO_ORIGIN,
        'cf-connecting-ip': options.ip ?? '127.0.4.1',
      },
      data: options.data === undefined ? undefined : JSON.stringify(options.data),
      timeout: 30_000,
    });
    const text = await response.text();
    return {
      status: response.status(),
      body: text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null,
    };
  } finally {
    await ctx.dispose();
  }
}

async function ok(
  method: string,
  path: string,
  options: { token?: string; data?: unknown; ip?: string } = {},
): Promise<any> {
  const response = await api(method, path, options);
  expect(response.status, `${method} ${path}: ${JSON.stringify(response.body)}`).toBeGreaterThanOrEqual(200);
  expect(response.status, `${method} ${path}: ${JSON.stringify(response.body)}`).toBeLessThan(300);
  return response.body;
}

async function demoLogin(roleKey: string, ip: string): Promise<AuthResult> {
  return ok('POST', '/api/auth/demo-login', { data: { roleKey }, ip }) as Promise<AuthResult>;
}

async function overlaySeed(auth: AuthResult, ip: string): Promise<OverlaySeed> {
  if (auth.user.role !== 'resident') return { ...auth, shownPopupIds: [] };
  const response = await ok('GET', '/api/requests?limit=100', { token: auth.token, ip });
  return {
    ...auth,
    shownPopupIds: response.requests
      .filter((request: { status?: string }) => request.status === 'pending_approval')
      .map((request: { id: string }) => `request-completed-${request.id}`),
  };
}

async function installSession(page: Page, auth: AuthResult): Promise<void> {
  const seed = await overlaySeed(auth, '127.0.14.1');
  await page.addInitScript(({ token, user, shownPopupIds }) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem(`onboarding_seen_${user.role}_${user.id}`, '1');
    localStorage.setItem(`kamizo_ob_done_${user.id}`, '1');
    localStorage.setItem(`push_prompt_dismissed_${user.id}`, String(Date.now()));
    sessionStorage.setItem(`push_prompt_shown_${user.id}`, '1');
    sessionStorage.setItem('shown_popup_ids', JSON.stringify(shownPopupIds));
    localStorage.setItem('uk-auth-storage', JSON.stringify({
      state: { user: { ...user, demoSession: true }, token, additionalUsers: [] },
      version: 4,
    }));
  }, seed);
}

function deterministicDemoId(namespace: string, key: string): string {
  const bytes = Buffer.from(createHash('sha256').update(`${namespace}\0${key}`).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function captureApiServerErrors(page: Page): string[] {
  const failures: string[] = [];
  page.on('response', response => {
    if (response.url().includes('/api/') && response.status() >= 500) {
      failures.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });
  return failures;
}

async function expectMobilePageBasics(page: Page, path: string, controls: Array<{ locator: ReturnType<Page['locator']>; label: string }>): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth, `${path} overflows at 320px`).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  for (const control of controls) {
    const box = await control.locator.boundingBox();
    expect(box, `${control.label} has no box`).not.toBeNull();
    expect(box!.width, `${control.label} is narrower than 44px`).toBeGreaterThanOrEqual(43.5);
    expect(box!.height, `${control.label} is shorter than 44px`).toBeGreaterThanOrEqual(43.5);
  }
}

async function stabilizeQuickLogin(page: Page, auth: AuthResult, ip: string): Promise<void> {
  const seed = await overlaySeed(auth, ip);
  await page.evaluate(({ user, shownPopupIds }) => {
    localStorage.setItem(`onboarding_seen_${user.role}_${user.id}`, '1');
    localStorage.setItem(`kamizo_ob_done_${user.id}`, '1');
    sessionStorage.setItem('shown_popup_ids', JSON.stringify(shownPopupIds));
  }, seed);
  await page.reload();
}

async function openRolePicker(page: Page, ip: string): Promise<void> {
  await page.setExtraHTTPHeaders({ 'cf-connecting-ip': ip });
  await page.addInitScript(() => sessionStorage.setItem('kamizo_demo_gate', '1'));
  await page.goto('/login');
  await expect(page.getByRole('group', { name: 'Основные роли' }).getByRole('button')).toHaveCount(6);
}

test.describe('Demo presentation', () => {
  test('visual gate rejects a wrong password, accepts the presentation password, and returns a credential-free DTO', async ({ page }) => {
    const rolesResponse = page.waitForResponse((response) => response.url().endsWith('/api/auth/demo-roles'));
    await page.goto('/login');
    const gateInput = page.getByLabel('Пароль доступа');
    await expect(gateInput).toBeVisible();
    await gateInput.fill('wrong-password');
    await page.getByRole('button', { name: 'Войти в демо' }).click();
    await expect(page.getByText('Неверный пароль')).toBeVisible();
    await gateInput.fill('Axelion27');
    await page.getByRole('button', { name: 'Войти в демо' }).click();

    const payload = await (await rolesResponse).json() as { roles: Record<string, unknown>[] };
    expect(payload.roles).toHaveLength(13);
    expect(payload.roles.every((role) => !('login' in role) && !('name' in role))).toBe(true);
    await expect(page.getByRole('group', { name: 'Основные роли' })).toBeVisible();
  });

  test('manual login disclosure submits the real tenant-pinned path with 16px inputs', async ({ page }) => {
    await openRolePicker(page, '127.0.4.4');
    await page.getByText('Войти вручную', { exact: true }).click();
    const login = page.locator('#login-field');
    const password = page.locator('#password-field');
    expect(await login.evaluate((element) => getComputedStyle(element).fontSize)).toBe('16px');
    expect(await password.evaluate((element) => getComputedStyle(element).fontSize)).toBe('16px');
    await login.fill('resident');
    await password.fill('kamizo-e2e');
    await page.getByRole('button', { name: /^Войти$/ }).click();
    await expect(page.getByText('Неверный логин или пароль').first()).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('role picker exposes primary and secondary roles without credentials or overflow', async ({ page }) => {
    await openRolePicker(page, '127.0.4.3');

    const primary = page.getByRole('group', { name: 'Основные роли' });
    await expect(primary.getByRole('button')).toHaveCount(6);
    await page.getByText('Другие роли', { exact: true }).click();
    const secondary = page.getByRole('group', { name: 'Другие роли' });
    await expect(secondary.getByRole('button')).toHaveCount(7);

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/demo-(director|manager|executor|security|shop|courier)/);
    expect(bodyText).not.toMatch(/eyJ[A-Za-z0-9_-]+\./);
    await expect(page.locator('#login-field')).toHaveValue('');
    await expect(page.locator('#password-field')).toHaveValue('');
    await expect(page).not.toHaveURL(/(?:password|token|login)=/i);

    for (const width of [320, 375]) {
      await page.setViewportSize({ width, height: 740 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const boxes = await page.getByRole('button').evaluateAll((buttons) => buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }));
      expect(boxes.every((box) => box.width >= 44 && box.height >= 44)).toBe(true);
    }
  });

  for (const [index, role] of PRIMARY_ROLES.entries()) {
    test(`quick login lands on the ${role.key} surface`, async ({ page }) => {
      if (role.key === 'resident') test.setTimeout(90_000);
      const ip = `127.0.5.${index + 1}`;
      await openRolePicker(page, ip);
      const loginResponse = page.waitForResponse((response) =>
        response.url().endsWith('/api/auth/demo-login') && response.request().method() === 'POST');
      await page.getByRole('button', { name: role.label }).click();
      const auth = await (await loginResponse).json() as AuthResult;
      await stabilizeQuickLogin(page, auth, ip);
      await expect(page).not.toHaveURL(/\/login/);
      if (role.key === 'security') await expect(page).toHaveURL(/\/qr-scanner$/);
      const marker = role.key === 'resident'
        ? page.getByRole('button', { name: role.marker })
        : role.key === 'director' || role.key === 'manager' || role.key === 'marketplace_manager'
          ? page.getByRole('heading', { name: role.marker })
          : page.getByText(role.marker);
      await expect(marker.first()).toBeVisible({ timeout: role.key === 'resident' ? 60_000 : 25_000 });
      const stored = await page.evaluate(() => {
        const raw = localStorage.getItem('uk-auth-storage');
        const state = raw ? JSON.parse(raw).state : null;
        return { user: state?.user };
      });
      expect(stored.user?.role).toBe(role.role);
    });
  }

  for (const [index, expected] of SECONDARY_ROLES.entries()) {
    test(`secondary ${expected.key} quick login reaches its UI landing`, async ({ page }) => {
      const auth = await demoLogin(expected.key, `127.0.6.${index + 1}`);
      expect(auth.token).toMatch(/^eyJ/);
      expect(auth.user.role).toBe(expected.role);
      expect(auth.user.specialization ?? null).toBe(expected.specialization);
      await installSession(page, auth);
      await page.goto('/');
      await expect(page.getByText(expected.marker).first()).toBeVisible({ timeout: 25_000 });
    });
  }

  test('demo capability denies sensitive mutation and renders Team and Settings read-only', async ({ context }) => {
    const admin = await demoLogin('admin', '127.0.6.20');
    const denied = await api('POST', '/api/users/me/password', {
      token: admin.token,
      ip: '127.0.6.21',
      data: { currentPassword: 'irrelevant', newPassword: 'irrelevant' },
    });
    expect(denied.status).toBe(403);
    expect(denied.body).toMatchObject({ error_ru: expect.stringContaining('Демо-сессия') });

    for (const [method, path] of [
      ['POST', '/api/meetings'],
      ['POST', '/api/finance/expenses'],
      ['POST', '/api/marketplace/admin/upload-image'],
      ['DELETE', '/api/marketplace/admin/products/product-1'],
      ['POST', '/api/admin/requests/reset'],
    ] as const) {
      const response = await api(method, path, {
        token: admin.token,
        ip: '127.0.6.22',
        data: {},
      });
      expect(response.status, `${method} ${path}`).toBe(403);
    }

    const page = await context.newPage();
    await installSession(page, admin);
    await page.goto('/team');
    await expect(page.getByText('Демо-режим: персонал доступен только для просмотра')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Добавить сотрудника' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Удалить сотрудника' })).toHaveCount(0);
    await expect(page.getByText('Мониторинг', { exact: true })).toHaveCount(0);
    await page.goto('/settings');
    await expect(page.getByText('Демо-режим: чувствительные настройки доступны только для просмотра')).toBeVisible();
    await expect(page.getByLabel('Текущий пароль')).toHaveCount(0);
    await expect(page.getByText('Опасная зона')).toHaveCount(0);
    await page.getByRole('tab', { name: 'Уведомления', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Отправить тест' })).toHaveCount(0);

    await page.goto('/executors');
    await expect(page.getByText('Демо-режим: изменения недоступны')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Добавить исполнителя' })).toHaveCount(0);
    await page.close();
  });

  for (const [index, financePage] of FINANCE_READ_ONLY_PAGES.entries()) {
    test(`demo ${financePage.roleKey} sees ${financePage.key} read-only`, async ({ page }) => {
      if (financePage.coldLoad) {
        // Direct isolated runs cold-compile the app shell or Excel-backed lazy chunks for these routes.
        test.setTimeout(90_000);
      }
      const auth = await demoLogin(financePage.roleKey, `127.0.13.${index + 1}`);
      await installSession(page, auth);
      await page.goto(financePage.path);

      await expect(page.getByText(FINANCE_READ_ONLY_BANNER)).toBeVisible({
        timeout: financePage.coldLoad ? 30_000 : undefined,
      });
      if (financePage.heading) {
        await expect(page.getByRole('heading', {
          name: financePage.heading,
          exact: financePage.headingExact,
        })).toBeVisible();
      }
      for (const text of financePage.absentText ?? []) {
        await expect(page.getByText(text, { exact: true })).toHaveCount(0);
      }
      for (const name of financePage.absentButtons ?? []) {
        await expect(page.getByRole('button', { name })).toHaveCount(0);
      }
      for (const name of financePage.visibleButtons ?? []) {
        await expect(page.getByRole('button', { name })).toBeVisible();
      }
    });
  }

  test('demo resident sees charges read-only', async ({ page }) => {
    const resident = await demoLogin('resident', '127.0.13.20');
    await installSession(page, resident);
    await page.goto('/finance/charges');
    await expect(page.getByText(FINANCE_READ_ONLY_BANNER)).toBeVisible();
    await expect(page.getByRole('button', { name: /Акт сверки/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Оплатить/ })).toHaveCount(0);
  });

  test('engagement presentation: manager sees seeded Trainings read-only at 320px', async ({ page }) => {
    const auth = await demoLogin('manager', '127.0.15.1');
    await installSession(page, auth);
    await page.setViewportSize({ width: 320, height: 740 });
    const apiServerErrors = captureApiServerErrors(page);
    await page.goto('/trainings');

    await expect(page.getByRole('heading', { name: 'Тренинги' })).toBeVisible();
    await expect(page.getByText('Коммуникация с жильцами без конфликтов', { exact: true })).toBeVisible();
    await expect(page.getByText('Безопасная работа с электрооборудованием', { exact: true })).toBeVisible();
    await expect(page.getByText('Плановое обслуживание инженерных систем', { exact: true })).toBeVisible();
    await expect(page.getByText('Kamizo Service Academy', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Нет предложений')).toHaveCount(0);
    await expect(page.getByRole('status')).toContainText('Демо-режим: изменения недоступны');
    await expect(page.getByRole('button', { name: 'Предложить тренинг' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Голосовать' })).toHaveCount(0);
    const details = page.getByRole('button', { name: 'Подробнее' }).first();
    await expect(details).toBeVisible();
    await expectMobilePageBasics(page, '/trainings', [
      { locator: details, label: 'training details' },
      { locator: page.getByRole('button', { name: /^Все \(/ }), label: 'training all filter' },
    ]);
    expect(apiServerErrors).toEqual([]);
  });

  test('engagement presentation: manager sees the persisted Colleagues leaderboard read-only at 320px', async ({ page }) => {
    const auth = await demoLogin('manager', '127.0.15.2');
    await installSession(page, auth);
    await page.setViewportSize({ width: 320, height: 740 });
    const apiServerErrors = captureApiServerErrors(page);
    await page.goto('/colleagues');

    await expect(page.getByRole('heading', { name: 'Мои коллеги' })).toBeVisible();
    await expect(page.getByText('Рустам Ибрагимов', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Азиз Мирзаев', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('4.7', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('4.5', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Нет данных о коллегах')).toHaveCount(0);
    await expect(page.getByRole('status')).toContainText('Демо-режим: изменения недоступны');
    await expect(page.getByRole('button', { name: 'Оценить' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Сказать спасибо' })).toHaveCount(0);
    const profile = page.getByRole('button', { name: 'Рустам Ибрагимов' }).first();
    await expectMobilePageBasics(page, '/colleagues', [{ locator: profile, label: 'colleague profile' }]);
    expect(apiServerErrors).toEqual([]);
  });

  for (const [index, noteRole] of (['manager', 'director', 'executor'] as const).entries()) {
    test(`engagement presentation: ${noteRole} sees only owned seeded Notepad notes read-only at 320px`, async ({ page }) => {
      const auth = await demoLogin(noteRole, `127.0.15.${index + 3}`);
      const notesResponse = await ok('GET', '/api/notes', { token: auth.token, ip: `127.0.16.${index + 1}` });
      const tenantId = String(auth.user.tenant_id);
      const expectedIds = [1, 2, 3].map(number => deterministicDemoId(tenantId, `note:${noteRole}:${number}`)).sort();
      expect(notesResponse.notes.map((note: { id: string }) => note.id).sort()).toEqual(expectedIds);

      await installSession(page, auth);
      await page.setViewportSize({ width: 320, height: 740 });
      const apiServerErrors = captureApiServerErrors(page);
      await page.goto('/notepad');

      await expect(page.getByRole('heading', { name: 'Заметки', exact: true })).toBeVisible();
      await expect(page.getByText('Приоритеты недели', { exact: true })).toBeVisible();
      await expect(page.getByText('Встречи', { exact: true })).toBeVisible();
      await expect(page.getByText('Напоминание', { exact: true })).toBeVisible();
      await expect(page.getByText('(3)', { exact: true })).toBeVisible();
      await expect(page.getByText('Нет заметок')).toHaveCount(0);
      await expect(page.getByRole('status')).toContainText('Демо-режим: изменения недоступны');
      await expect(page.getByRole('button', { name: 'Добавить' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Редактировать заметку/ })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Удалить заметку/ })).toHaveCount(0);
      const refresh = page.getByTitle('Обновить');
      await expectMobilePageBasics(page, '/notepad', [{ locator: refresh, label: 'notes refresh' }]);
      expect(apiServerErrors).toEqual([]);
    });
  }

  test.describe.serial('request journey persistence', () => {
    let baselineCounts: Record<string, number>;
    let superadminToken: string;
    let journeyTitle: string;

    test.beforeAll(async () => {
      const tokens = JSON.parse(fs.readFileSync(tokenFile(), 'utf8')) as Record<string, AuthResult>;
      superadminToken = tokens.superadmin.token;
      const status = await ok('GET', '/api/super-admin/demo/status', {
        token: superadminToken,
        ip: '127.0.4.2',
      }) as StatusResult;
      expect(status.ready).toEqual({ core: true, engagement: true, commerce: true, finance: true });
      baselineCounts = status.counts;
    });

    test('resident to manager to executor to resident request journey completes with history', async ({ context }) => {
      const resident = await demoLogin('resident', '127.0.7.1');
      const manager = await demoLogin('manager', '127.0.7.2');
      const executor = await demoLogin('executor', '127.0.7.3');
      const categories = await ok('GET', '/api/categories', { token: resident.token, ip: '127.0.7.4' }) as any[];
      const category = categories.find((item) => item.specialization === 'plumber');
      expect(category).toBeTruthy();

      journeyTitle = `Demo presentation ${process.env.KAMIZO_E2E_RUN_ID}`;
      const created = await ok('POST', '/api/requests', {
        token: resident.token,
        ip: '127.0.7.5',
        data: {
          category_id: category.id,
          title: journeyTitle,
          description: 'Cross-role isolated presentation journey',
          priority: 'medium',
        },
      });
      const requestId = created.request.id as string;
      expect(created.request.status).toBe('new');

      const managerPage = await context.newPage();
      await installSession(managerPage, manager);
      await managerPage.goto('/requests');
      await expect(managerPage.getByText(journeyTitle, { exact: true }).first()).toBeVisible({ timeout: 25_000 });
      await managerPage.close();

      const executors = await ok('GET', '/api/executors?all=true', { token: manager.token, ip: '127.0.7.6' });
      const demoExecutor = executors.executors.find((item: any) => item.login === 'demo-executor');
      expect(demoExecutor?.id).toBe(executor.user.id);
      await ok('POST', `/api/requests/${requestId}/assign`, {
        token: manager.token,
        ip: '127.0.7.7',
        data: { executor_id: demoExecutor.id },
      });

      const executorPage = await context.newPage();
      await installSession(executorPage, executor);
      await executorPage.goto('/');
      await executorPage.getByRole('button', { name: /^Назначенные/ }).click();
      await expect(executorPage.getByText(journeyTitle, { exact: true }).first()).toBeVisible({ timeout: 25_000 });
      await executorPage.close();

      await ok('POST', `/api/requests/${requestId}/accept`, { token: executor.token, ip: '127.0.7.8', data: {} });
      await ok('POST', `/api/requests/${requestId}/start`, { token: executor.token, ip: '127.0.7.9', data: {} });
      await ok('POST', `/api/requests/${requestId}/complete`, { token: executor.token, ip: '127.0.7.10', data: {} });
      await ok('POST', `/api/requests/${requestId}/approve`, {
        token: resident.token,
        ip: '127.0.7.11',
        data: { rating: 5, feedback: 'Presentation journey verified' },
      });

      const residentRequests = await ok('GET', '/api/requests?limit=100', { token: resident.token, ip: '127.0.7.12' });
      const finished = residentRequests.requests.find((item: any) => item.id === requestId);
      expect(finished).toMatchObject({ status: 'completed', rating: 5, feedback: 'Presentation journey verified' });

      await expect.poll(async () => {
        const response = await ok('GET', '/api/notifications?limit=100', { token: resident.token, ip: '127.0.7.13' });
        return new Set(response.notifications
          .filter((item: any) => item.data?.request_id === requestId)
          .map((item: any) => item.type));
      }, { timeout: 15_000 }).toEqual(new Set([
        'request_assigned', 'request_accepted', 'request_started', 'request_completed',
      ]));
    });

    test('provision rerun preserves journey data and deterministic manifest counts', async () => {
      const before = await ok('GET', '/api/super-admin/demo/status', {
        token: superadminToken,
        ip: '127.0.11.1',
      }) as StatusResult;
      expect(before.counts.requests).toBe(baselineCounts.requests + 1);
      expect(before.counts.marketplace_orders).toBe(baselineCounts.marketplace_orders);

      const rerun = await ok('POST', '/api/super-admin/demo/provision', {
        token: superadminToken,
        ip: '127.0.11.2',
        data: { phases: ['core', 'commerce', 'finance'] },
      });
      expect(rerun.results.map((result: any) => result.phase)).toEqual(['core', 'commerce', 'finance']);

      const after = await ok('GET', '/api/super-admin/demo/status', {
        token: superadminToken,
        ip: '127.0.11.3',
      }) as StatusResult;
      expect(after.ready).toEqual({ core: true, engagement: true, commerce: true, finance: true });
      expect(after.counts).toEqual(before.counts);

      const resident = await demoLogin('resident', '127.0.11.4');
      const requests = await ok('GET', '/api/requests?limit=100', { token: resident.token, ip: '127.0.11.5' });
      expect(requests.requests.filter((item: any) => item.title === journeyTitle)).toHaveLength(1);
    });
  });

  test('security validates and scans an active GAPASS and finds a seeded vehicle', async () => {
    const resident = await demoLogin('resident', '127.0.8.1');
    const security = await demoLogin('security', '127.0.8.2');
    const codes = await ok('GET', '/api/guest-codes', { token: resident.token, ip: '127.0.8.3' });
    const active = codes.codes.find((code: any) => code.status === 'active' && code.max_uses > 1);
    expect(active?.qr_token).toMatch(/^GAPASS:/);

    const validation = await ok('POST', '/api/guest-codes/validate', {
      token: security.token,
      ip: '127.0.8.4',
      data: { qr_token: active.qr_token },
    });
    expect(validation.valid).toBe(true);
    await ok('POST', `/api/guest-codes/${active.id}/use`, {
      token: security.token,
      ip: '127.0.8.5',
      data: {},
    });

    const vehicleSearch = await ok('GET', '/api/vehicles/search?q=01A', {
      token: security.token,
      ip: '127.0.8.6',
    });
    expect(vehicleSearch.vehicles).toEqual(expect.arrayContaining([
      expect.objectContaining({ plate_number: '01A123BC', brand: 'Chevrolet', model: 'Tracker' }),
    ]));
  });

  test('marketplace manager sees seeded order statuses and resident sees the catalog', async ({ context }) => {
    const resident = await demoLogin('resident', '127.0.9.1');
    const marketplaceManager = await demoLogin('marketplace_manager', '127.0.9.2');
    const products = await ok('GET', '/api/marketplace/products?limit=100', { token: resident.token, ip: '127.0.9.3' });
    expect(products.products.length).toBeGreaterThanOrEqual(8);
    const cart = await ok('GET', '/api/marketplace/cart', { token: resident.token, ip: '127.0.9.5' });
    expect(cart.cart).toEqual([]);

    const orders = await ok('GET', '/api/marketplace/admin/orders?limit=100', {
      token: marketplaceManager.token,
      ip: '127.0.9.4',
    });
    expect(orders.orders.length).toBeGreaterThanOrEqual(6);
    const stockOrders = orders.orders.filter((order: any) => order.order_type === 'stock');
    const onDemandOrders = orders.orders.filter((order: any) => order.order_type === 'on_demand');
    expect(new Set(orders.orders.map((order: any) => order.status))).toEqual(
      new Set(demoCommerceExpectedOrderStatuses),
    );
    expect(new Set(stockOrders.map((order: any) => order.status))).toEqual(new Set([
      'new', 'preparing', 'ready', 'delivering', 'delivered',
    ]));
    expect(onDemandOrders).toEqual([
      expect.objectContaining({ status: 'price_offered', price_offered_at: expect.any(String) }),
    ]);

    const managerPage = await context.newPage();
    await installSession(managerPage, marketplaceManager);
    await managerPage.goto('/marketplace-orders');
    await expect(managerPage.getByRole('heading', { name: /^Заказы/ })).toBeVisible({ timeout: 25_000 });
    await managerPage.close();

    const residentPage = await context.newPage();
    await installSession(residentPage, resident);
    await residentPage.goto('/marketplace');
    await expect(residentPage.getByText('Вода 19 л', { exact: true }).first()).toBeVisible({ timeout: 25_000 });
    await residentPage.close();
  });

  test('director and resident receive non-empty meetings, finance, and rentals', async () => {
    const director = await demoLogin('director', '127.0.10.1');
    const resident = await demoLogin('resident', '127.0.10.2');

    const directorMeetings = await ok('GET', '/api/meetings', { token: director.token, ip: '127.0.10.3' });
    const directorFinance = await ok('GET', '/api/finance/estimates', { token: director.token, ip: '127.0.10.4' });
    const directorRentals = await ok('GET', '/api/rentals/records', { token: director.token, ip: '127.0.10.5' });
    expect(directorMeetings.meetings.length).toBeGreaterThan(0);
    expect(directorFinance.estimates.length).toBeGreaterThan(0);
    expect(directorRentals.records.length).toBeGreaterThan(0);

    const residentMeetings = await ok('GET', '/api/meetings', { token: resident.token, ip: '127.0.10.6' });
    const residentFinance = await ok('GET', '/api/finance/my-charges', { token: resident.token, ip: '127.0.10.7' });
    const residentRentals = await ok('GET', '/api/rentals/listings?limit=100', { token: resident.token, ip: '127.0.10.8' });
    expect(residentMeetings.meetings.length).toBeGreaterThan(0);
    expect(residentFinance.charges.length).toBeGreaterThan(0);
    expect(residentRentals.listings.length).toBeGreaterThan(0);
  });

  test('invalid demo role returns 404', async () => {
    const invalid = await api('POST', '/api/auth/demo-login', {
      data: { roleKey: 'not-a-role' }, ip: '127.0.12.1',
    });
    expect(invalid.status).toBe(404);
  });

  test('one isolated IP is capped at five demo logins', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await api('POST', '/api/auth/demo-login', {
        data: { roleKey: 'advertiser' }, ip: '127.0.12.2',
      })).status).toBe(200);
    }
    const limited = await api('POST', '/api/auth/demo-login', {
      data: { roleKey: 'advertiser' }, ip: '127.0.12.2',
    });
    expect(limited.status).toBe(429);
  });
});
