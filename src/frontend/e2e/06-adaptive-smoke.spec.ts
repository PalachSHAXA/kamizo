import { test, expect } from './fixtures';
import { loginAs } from './helpers/auth';

const adminUxViewports = [
  { width: 320, height: 720 },
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1366, height: 850 },
] as const;

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page, route: string) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    overflowers: Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .map(element => {
        const rect = element.getBoundingClientRect();
        return { tag: element.tagName, className: element.className, left: rect.left, right: rect.right, width: rect.width };
      })
      .filter(rect => rect.left < -1 || rect.right > document.documentElement.clientWidth + 1)
      .slice(0, 8),
  }));
  expect(dimensions.scrollWidth, `horizontal overflow on ${route}: ${JSON.stringify(dimensions.overflowers)}`).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

async function expectMinimumControlSize(locator: import('@playwright/test').Locator, label: string) {
  const box = await locator.boundingBox();
  expect(box, `${label} has no bounding box`).not.toBeNull();
  expect(box!.height, `${label} touch target is shorter than 44px`).toBeGreaterThanOrEqual(43.5);
}

async function expectVisibleFormControlsAtLeast16px(page: import('@playwright/test').Page, route: string) {
  const sizes = await page.locator('input:not([type="checkbox"]):visible, select:visible, textarea:visible').evaluateAll((controls) =>
    controls.map((control) => ({
      tag: control.tagName,
      name: control.getAttribute('aria-label') || control.getAttribute('name') || control.getAttribute('id'),
      className: control.className,
      fontSize: Number.parseFloat(window.getComputedStyle(control).fontSize),
    })),
  );
  expect(sizes.length, `no visible form controls found on ${route}`).toBeGreaterThan(0);
  for (const control of sizes) {
    expect(control.fontSize, `${control.tag} ${control.name || ''} ${control.className} on ${route} triggers iOS zoom`).toBeGreaterThanOrEqual(16);
  }
}

async function expectStaffShellContract(page: import('@playwright/test').Page, route: string) {
  const shell = page.locator('.staff-shell').first();
  await expect(shell, `${route} has no staff-shell contract root`).toBeVisible();

  const fields = shell.locator('input:not([type="checkbox"]):not([type="radio"]):visible, select:visible, textarea:visible');
  const fieldMetrics = await fields.evaluateAll(controls => controls.map(control => {
    const style = window.getComputedStyle(control);
    const rect = control.getBoundingClientRect();
    return {
      label: control.getAttribute('aria-label') || control.getAttribute('name') || control.tagName,
      fontSize: Number.parseFloat(style.fontSize),
      height: rect.height,
    };
  }));
  const viewportWidth = page.viewportSize()?.width ?? 1366;
  for (const field of fieldMetrics) {
    if (viewportWidth <= 1024) {
      expect(field.fontSize, `${field.label} on ${route} triggers iOS zoom`).toBeGreaterThanOrEqual(16);
    }
    expect(field.height, `${field.label} on ${route} is shorter than 44px`).toBeGreaterThanOrEqual(43.5);
  }

  const primaryMetrics = await shell.locator('.staff-primary-control:visible').evaluateAll(controls => controls.map(control => {
    const rect = control.getBoundingClientRect();
    return { label: control.getAttribute('aria-label') || control.textContent?.trim(), width: rect.width, height: rect.height };
  }));
  expect(primaryMetrics.length, `${route} has no explicit primary controls`).toBeGreaterThan(0);
  for (const control of primaryMetrics) {
    expect(control.width, `${control.label} on ${route} is narrower than 44px`).toBeGreaterThanOrEqual(43.5);
    expect(control.height, `${control.label} on ${route} is shorter than 44px`).toBeGreaterThanOrEqual(43.5);
  }
}

/**
 * Sprint 6: viewport smoke tests.
 *
 * The Playwright config defines five projects (desktop, tablet, mobile,
 * mobile-small, mobile-landscape). This spec runs in all of them, so each
 * assertion is implicitly checked across every viewport band.
 *
 * Goal: catch the kind of layout regression where a row overflows the
 * viewport, a sticky element disappears, or an input is too small on iOS.
 *
 * Failure means a real responsive break — investigate before merging.
 */

test.describe('Adaptive smoke: resident', () => {
  test('home renders without horizontal overflow', async ({ page }) => {
    await loginAs(page, 'resident');
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /^(Заявка|Ariza)$/i }).first()).toBeVisible();

    // Body must not scroll horizontally. If it does, something inside the
    // page is wider than the viewport — common Sprint 1/3 regression.
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth, 'horizontal overflow on /').toBeLessThanOrEqual(clientWidth + 1);
  });

  test('chat composer input is at least 16px (no iOS zoom)', async ({ page }, testInfo) => {
    if (!testInfo.project.use.isMobile) test.skip(true, 'iOS zoom does not apply to desktop browsers');
    await loginAs(page, 'resident');
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    const composer = page.locator([
      'input[aria-label="Написать сообщение"]',
      'input[aria-label="Xabar yozing"]',
      'input[placeholder^="Сообщение для УК"]',
      'input[placeholder^="УКga xabar"]',
    ].join(', ')).first();
    await expect(composer).toBeVisible();

    const fontSize = await composer.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return parseFloat(cs.fontSize);
    });

    // Below 16px iOS Safari auto-zooms on focus, which Sprint 1 fixed.
    expect(fontSize, 'chat composer font-size triggers iOS zoom').toBeGreaterThanOrEqual(16);
  });
});

test.describe('Adaptive smoke: manager', () => {
  test('debtors page has no horizontal overflow', async ({ page }) => {
    await loginAs(page, 'manager');
    await page.goto('/finance/debtors');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/finance\/debtors$/);
    await expect(page.getByRole('heading', { name: /^(Должники|Qarzdorlar)$/ })).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth, 'horizontal overflow on debtors').toBeLessThanOrEqual(clientWidth + 1);
  });

  test('debtors table thead is sticky (or hidden under md)', async ({ page }, testInfo) => {
    await loginAs(page, 'manager');
    await page.goto('/finance/debtors');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/finance\/debtors$/);
    await expect(page.getByRole('heading', { name: /^(Должники|Qarzdorlar)$/ })).toBeVisible();

    const viewportWidth = testInfo.project.use.viewport?.width ?? 1366;

    const thead = page.locator('thead').first();
    await expect(thead).toHaveCount(1);
    if (viewportWidth < 768) {
      // Sprint 3: under md the table is hidden and the card list shows.
      await expect(thead).toBeHidden();
    } else {
      // Sprint 1: sticky thead so column names stay visible while scrolling.
      await expect(thead).toBeVisible();
      const position = await thead.evaluate((el) => window.getComputedStyle(el).position);
      expect(position).toBe('sticky');
    }
  });

  test('admin dashboard KPI grid uses lg breakpoint cleanly', async ({ page }, testInfo) => {
    await loginAs(page, 'admin');
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /^(Панель управления|Boshqaruv paneli)$/ })).toBeVisible();

    const viewportWidth = testInfo.project.use.viewport?.width ?? 1366;
    if (viewportWidth < 1024) test.skip(true, 'lg-only assertion');

    // On lg+ the AdminDashboard stat grid must lay out at least 3 columns,
    // not the cramped 4-on-md jump. Look for the first grid-cols-2 stats
    // wrapper and verify computed grid-template-columns has ≥ 3 columns.
    const grid = page.locator('.grid.grid-cols-2.md\\:grid-cols-3.lg\\:grid-cols-4').first();
    await expect(grid).toBeVisible();
    const columns = await grid.evaluate(element => {
      const template = window.getComputedStyle(element).gridTemplateColumns;
      return template.split(' ').filter(Boolean).length;
    });
    expect(columns).toBeGreaterThanOrEqual(3);
  });
});

test.describe('@self-viewport Admin mobile drawer lifecycle', () => {
  test('uses the shared overlay stack at 320/767 and remains desktop navigation at 768', async ({ page }) => {
    await loginAs(page, 'admin');

    for (const width of [320, 767, 768]) {
      await page.setViewportSize({ width, height: 820 });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const shell = page.locator('.layout-root.staff-shell[data-shell="staff"]');
      const drawer = page.getByRole('navigation', { name: /^(Главное меню|Asosiy menyu)$/ });
      await expect(shell).toBeVisible();

      if (width === 768) {
        await expect(drawer).toBeVisible();
        await expect(drawer).not.toHaveAttribute('inert');
        await expect(page.getByRole('button', { name: /^(Открыть меню|Menyuni ochish)$/ })).toBeHidden();
        expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
        continue;
      }

      const menu = page.locator('button[aria-controls="app-sidebar"]');
      await expect(menu).toHaveAttribute('aria-expanded', 'false');
      await menu.click();
      await expect(menu).toHaveAttribute('aria-expanded', 'true');
      await expect(drawer).toBeVisible();
      await expect(page.locator('#root')).toHaveAttribute('inert', '');
      await expect(page.getByRole('navigation', { name: /^(Нижняя навигация|Pastki navigatsiya)$/ })).toHaveCount(0);
      expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');

      await drawer.getByRole('button', { name: /^(Выйти из аккаунта|Akkauntdan chiqish)$/ }).click();
      const confirmation = page.getByRole('dialog', { name: /^(Выйти из аккаунта\?|Akkauntdan chiqasizmi\?)$/ });
      await expect(confirmation).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(confirmation).toHaveCount(0);
      await expect(drawer).toBeVisible();
      await expect(menu).toHaveAttribute('aria-expanded', 'true');

      await page.keyboard.press('Escape');
      await expect(menu).toHaveAttribute('aria-expanded', 'false');
      await expect(menu).toBeFocused();
      await expect(page.locator('#root')).not.toHaveAttribute('inert');
      expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
    }
  });
});

test.describe('@self-viewport Commercial owner resident parity', () => {
  test('gets resident meetings, guest access, contract, and drawer navigation at 320/767/768', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'commercial_owner');

    for (const width of [320, 767, 768]) {
      await page.setViewportSize({ width, height: 820 });

      await page.goto('/meetings');
      await expect(page.getByText('Собрания собственников', { exact: true })).toBeVisible();
      await expect(page.getByText('Голосование', { exact: true })).toBeVisible();

      await page.goto('/guest-access');
      await expect(page.getByText('QR-доступ', { exact: true })).toBeVisible();

      await page.goto('/contract');
      await expect(page.getByText('Договор управления', { exact: true })).toBeVisible();

      await page.goto('/');
      const drawer = page.getByRole('navigation', { name: /^(Главное меню|Asosiy menyu)$/ });
      if (width < 768) {
        await page.getByRole('button', { name: /^(Открыть меню|Menyuni ochish)$/ }).click();
      }
      await expect(drawer).toBeVisible();
      await expect(drawer.getByRole('button', { name: /^Собрания/ })).toBeVisible();
      await expect(drawer.getByRole('button', { name: /^Пропуска/ })).toBeVisible();
      await expect(drawer.getByRole('button', { name: /^Договор/ })).toBeVisible();
      if (width < 768) await page.keyboard.press('Escape');
    }
  });
});

test.describe('@self-viewport Adaptive smoke: Team modal', () => {
  test('admin add-staff footer stays reachable and BottomBar stays hidden at 320/375', async ({ page }) => {
    await loginAs(page, 'admin');

    for (const width of [320, 375]) {
      await page.setViewportSize({ width, height: 667 });
      await page.goto('/team');
      await page.waitForLoadState('networkidle');

      const trigger = page.getByRole('button', { name: /^(Добавить сотрудника|Xodim qo'shish)$/ });
      await expect(trigger).toBeVisible();
      await trigger.click();

      const dialog = page.getByRole('dialog', { name: /^(Добавить сотрудника|Xodim qo'shish)$/ });
      const submit = dialog.getByRole('button', { name: /^(Добавить|Qo'shish)$/ });
      await expect(dialog).toBeVisible();
      await expect(submit).toBeVisible();
      await expect(page.getByRole('navigation', { name: /^(Нижняя навигация|Pastki navigatsiya)$/ })).toHaveCount(0);

      await expect.poll(async () => {
        const footerBox = await submit.boundingBox();
        return footerBox ? footerBox.y + footerBox.height : Number.POSITIVE_INFINITY;
      }, { message: `${width}px footer is clipped below viewport` }).toBeLessThanOrEqual(667);

      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
    }
  });
});

test.describe('@self-viewport Adaptive smoke: common modals', () => {
  test('finance and settings dialogs remain usable at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await loginAs(page, 'admin');

    for (const modalCase of [
      {
        route: '/finance/settings',
        trigger: /^(Дать доступ|Ruxsat berish)$/,
        dialog: /^(Дать доступ|Ruxsat berish)$/,
      },
      {
        route: '/settings',
        tab: /^(Общие|Umumiy)$/,
        trigger: /^(Сбросить|O'chirish)$/,
        dialog: /^(Подтвердите действие|Amalni tasdiqlang)$/,
      },
    ]) {
      await page.goto(modalCase.route);
      await page.waitForLoadState('networkidle');
      if (modalCase.tab) await page.getByRole('tab', { name: modalCase.tab }).click();

      const trigger = page.getByRole('button', { name: modalCase.trigger });
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: modalCase.dialog });
      await expect(dialog).toBeVisible();
      await expect(page.getByRole('navigation', { name: /^(Нижняя навигация|Pastki navigatsiya)$/ })).toHaveCount(0);

      const bounds = await dialog.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(-1);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(321);
      await expect.poll(async () => {
        const settledBounds = await dialog.boundingBox();
        return settledBounds ? settledBounds.y + settledBounds.height : Number.POSITIVE_INFINITY;
      }, { message: `${modalCase.route} dialog is clipped below the 320px viewport` }).toBeLessThanOrEqual(721);
      await expectNoHorizontalOverflow(page, modalCase.route);

      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
    }
  });
});

test.describe('@self-viewport Admin UX slice 3 responsive matrix', () => {
  for (const viewport of adminUxViewports) {
    test(`${viewport.width}px keeps settings and finance controls usable`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await loginAs(page, 'admin');

      await page.goto('/settings');
      await expect(page.getByRole('heading', { name: /^(Настройки|Sozlamalar)$/ })).toBeVisible();
      await expectNoHorizontalOverflow(page, '/settings');
      const settingsRoot = page.locator('.settings-scroll').locator('..');
      const settingsBox = await settingsRoot.boundingBox();
      expect(settingsBox).not.toBeNull();
      expect(settingsBox!.x).toBeGreaterThanOrEqual(-1);
      expect(settingsBox!.x + settingsBox!.width).toBeLessThanOrEqual(viewport.width + 1);
      if (viewport.width <= 768) await expectVisibleFormControlsAtLeast16px(page, '/settings');

      await page.goto('/finance/charges');
      await expect(page.getByRole('heading', { name: /^(Начисления|Hisob-kitob)$/ })).toBeVisible();
      await expectNoHorizontalOverflow(page, '/finance/charges');
      const chargeControls = page.locator('select, input[type="month"]');
      await expectMinimumControlSize(chargeControls.nth(0), 'charges building filter');
      await expectMinimumControlSize(chargeControls.nth(1), 'charges period filter');
      await expectMinimumControlSize(chargeControls.nth(2), 'charges status filter');
      await expectMinimumControlSize(page.getByRole('button', { name: /^(Применить|Qo'llash)$/ }), 'charges apply filter');
      if (viewport.width <= 768) await expectVisibleFormControlsAtLeast16px(page, '/finance/charges');

      const kpiGrid = page.locator('.charges-kpi-grid');
      await expect(kpiGrid).toBeVisible();
      const kpiLayout = await kpiGrid.evaluate((grid) => {
        const cards = Array.from(grid.children) as HTMLElement[];
        const columns = window.getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length;
        const labelsFit = cards.every((card) => {
          const label = card.querySelector('p');
          return label instanceof HTMLElement && label.scrollWidth <= label.clientWidth + 1;
        });
        return { columns, labelsFit };
      });
      expect(kpiLayout.columns).toBe(viewport.width < 375 ? 1 : viewport.width < 1024 ? 2 : 4);
      expect(kpiLayout.labelsFit, 'charges KPI labels are clipped').toBe(true);

      await page.goto('/finance/estimates');
      await expect(page.getByRole('heading', { name: /^(Сметы|Smetalar)$/ })).toBeVisible();
      await expectNoHorizontalOverflow(page, '/finance/estimates');
      const estimateFilters = page.locator('select').first().locator('..').locator('select');
      await expectMinimumControlSize(estimateFilters.nth(0), 'estimates building filter');
      await expectMinimumControlSize(estimateFilters.nth(1), 'estimates status filter');
      const createEstimate = page.getByRole('link', { name: /^(Создать смету|Smeta yaratish)$/ });
      await expectMinimumControlSize(createEstimate, 'create estimate');
      if (viewport.width <= 768) await expectVisibleFormControlsAtLeast16px(page, '/finance/estimates');

      if (viewport.width < 360) {
        const titleBox = await page.getByRole('heading', { name: /^(Сметы|Smetalar)$/ }).boundingBox();
        const actionBox = await createEstimate.boundingBox();
        expect(titleBox).not.toBeNull();
        expect(actionBox).not.toBeNull();
        expect(actionBox!.y).toBeGreaterThanOrEqual(titleBox!.y + titleBox!.height);
      }
    });
  }
});

test.describe('@self-viewport Adaptive shell: dispatcher', () => {
  test('keeps operational navigation and executor actions usable at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await loginAs(page, 'dispatcher');
    await page.goto('/executors');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/executors$/);
    await expect(page.getByRole('heading', { name: /^(Исполнители|Ijrochilar)$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^(Обновить список исполнителей|Ijrochilar ro'yxatini yangilash)$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^(Добавить исполнителя|Ijrochi qo'shish)$/ })).toHaveCount(0);

    const bottom = page.getByRole('navigation', { name: /^(Нижняя навигация|Pastki navigatsiya)$/ });
    await expect(bottom).toBeVisible();
    await expect(bottom.getByRole('button')).toHaveCount(4);

    const buttonMetrics = await bottom.getByRole('button').evaluateAll(buttons => buttons.map(button => {
      const rect = button.getBoundingClientRect();
      return { width: rect.width, height: rect.height, label: button.getAttribute('aria-label') };
    }));
    expect(buttonMetrics.every(item => item.width >= 44 && item.height >= 44 && item.label)).toBe(true);

    const viewport = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth + 1);

    await page.getByRole('button', { name: /^(Ещё|Yana)$/ }).click();
    const drawer = page.getByRole('navigation', { name: /^(Главное меню|Asosiy menyu)$/ });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText(/^(Жильцы|Aholi|Дома|Uylar|Финансы|Moliya|Отчёты|Hisobotlar|Настройки|Sozlamalar)$/)).toHaveCount(0);
  });
});

test.describe('@self-viewport Adaptive shell: Executor overlays', () => {
  test('keeps add and details footers reachable at 320px and restores focus', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await loginAs(page, 'manager');
    await page.goto('/executors');
    await page.waitForLoadState('networkidle');

    const addTrigger = page.getByRole('button', { name: /^(Добавить исполнителя|Ijrochi qo'shish)$/ });
    await addTrigger.click();
    const addDialog = page.getByRole('dialog', { name: /^(Добавить сотрудника|Xodim qo'shish)$/ });
    const cancel = addDialog.getByRole('button', { name: /^(Отмена|Bekor qilish)$/ });
    await expect(addDialog).toBeVisible();
    await expect(cancel).toBeVisible();
    await expect(page.getByRole('navigation', { name: /^(Нижняя навигация|Pastki navigatsiya)$/ })).toHaveCount(0);
    await expect.poll(async () => {
      const box = await cancel.boundingBox();
      return box ? box.y + box.height : Number.POSITIVE_INFINITY;
    }, { message: 'Executor add footer is clipped below the 320px viewport' }).toBeLessThanOrEqual(700);
    await expectNoHorizontalOverflow(page, '/executors add');

    await page.keyboard.press('Escape');
    await expect(addDialog).toHaveCount(0);
    await expect(addTrigger).toBeFocused();

    const detailsTrigger = page.getByRole('button', { name: /^(Подробнее|Batafsil)$/ }).first();
    await expect(detailsTrigger).toBeVisible();
    await detailsTrigger.click();
    const detailsDialog = page.getByRole('dialog');
    const edit = detailsDialog.getByRole('button', { name: /^(Редактировать|Tahrirlash)$/ });
    await expect(edit).toBeVisible();
    await expect.poll(async () => {
      const box = await edit.boundingBox();
      return box ? box.y + box.height : Number.POSITIVE_INFINITY;
    }, { message: 'Executor details footer is clipped below the 320px viewport' }).toBeLessThanOrEqual(700);
    await expectNoHorizontalOverflow(page, '/executors details');

    await page.keyboard.press('Escape');
    await expect(detailsDialog).toHaveCount(0);
    await expect(detailsTrigger).toBeFocused();
  });
});

test.describe('@self-viewport Admin UX slice 4', () => {
  for (const role of ['admin', 'director', 'manager', 'department_head', 'dispatcher'] as const) {
    test(`${role} BottomBar fits three primary actions and More at 320px`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 720 });
      const { user } = await loginAs(page, role);
      await page.addInitScript((userId: string) => {
        localStorage.setItem(`kamizo_ob_done_${userId}`, '1');
      }, user.id);
      await page.goto('/requests');
      await page.waitForLoadState('networkidle');

      const bottom = page.getByRole('navigation', { name: /^(Нижняя навигация|Pastki navigatsiya)$/ });
      await expect(bottom).toBeVisible();
      const buttons = bottom.getByRole('button');
      await expect(buttons).toHaveCount(4);

      const geometry = await buttons.evaluateAll((items) => items.map((item) => {
        const rect = item.getBoundingClientRect();
        const visibleLabel = item.querySelector('[data-bottom-label]');
        return {
          left: rect.left,
          right: rect.right,
          width: rect.width,
          height: rect.height,
          ariaLabel: item.getAttribute('aria-label'),
          visibleLabel: visibleLabel ? window.getComputedStyle(visibleLabel).display !== 'none' : false,
        };
      }));

      expect(geometry.every(item => item.left >= 0 && item.right <= 320)).toBe(true);
      expect(geometry.every(item => item.width >= 44 && item.height >= 44 && item.ariaLabel)).toBe(true);
      expect(geometry.every((item, index) => index === 0 || item.left >= geometry[index - 1].right - 0.5)).toBe(true);
      expect(geometry.some(item => item.visibleLabel)).toBe(false);
    });
  }

  test('estimate card opens from Enter and Space with a touch-safe semantic target', async ({ page }) => {
    const estimate = {
      id: 'e2e-estimate',
      title: 'Клавиатурная смета',
      status: 'active',
      building_id: 'e2e-building',
      effective_date: '2026-08-01',
      umumiy_year: 12000000,
      tariff_resident: 1875,
      deficit_year: 0,
      items: [],
    };
    await page.route(/\/api\/finance\/estimates(?:\?.*)?$/, route => route.fulfill({ json: { estimates: [estimate] } }));
    await page.route('**/api/finance/estimates/e2e-estimate', route => route.fulfill({ json: { estimate } }));
    await page.route('**/api/finance/estimates/v2/e2e-estimate/compute', route => route.fulfill({ json: { estimate } }));
    await loginAs(page, 'admin');
    await page.goto('/finance/estimates');

    const card = page.getByRole('button', { name: /Клавиатурная смета/ });
    await expect(card).toBeVisible();
    await expectMinimumControlSize(card, 'estimate card');
    await card.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await card.focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('draft estimate actions stack at 320px and stay inline on desktop', async ({ page }) => {
    const estimate = {
      id: 'e2e-draft-estimate',
      title: 'Черновик адаптивности',
      status: 'draft',
      building_id: 'e2e-building',
      effective_date: '2026-08-01',
      umumiy_year: 12000000,
      tariff_resident: 1875,
      deficit_year: 0,
      items: [],
    };
    await page.route(/\/api\/finance\/estimates(?:\?.*)?$/, route => route.fulfill({ json: { estimates: [estimate] } }));
    await loginAs(page, 'admin');

    for (const width of [320, 1366]) {
      await page.setViewportSize({ width, height: 720 });
      await page.goto('/finance/estimates');
      const edit = page.getByRole('button', { name: /^(Редактировать|Tahrirlash)$/ });
      const remove = page.getByRole('button', { name: /^(Удалить|O'chirish)$/ });
      await expect(edit).toBeVisible();
      await expectMinimumControlSize(edit, 'edit draft estimate');
      await expectMinimumControlSize(remove, 'delete draft estimate');

      const geometry = await edit.locator('..').evaluate((actions) => {
        const style = window.getComputedStyle(actions);
        const buttons = Array.from(actions.querySelectorAll('button')).map(button => button.getBoundingClientRect());
        return { direction: style.flexDirection, wraps: style.flexWrap, buttons: buttons.map(box => ({ left: box.left, right: box.right })) };
      });
      expect(geometry.wraps).not.toBe('nowrap');
      expect(geometry.direction).toBe(width === 320 ? 'column' : 'row');
      expect(geometry.buttons.every(button => button.left >= 0 && button.right <= width)).toBe(true);
      await expectNoHorizontalOverflow(page, '/finance/estimates');
    }
  });

  for (const viewport of [
    { width: 320, height: 720 },
    { width: 768, height: 1024 },
    { width: 1366, height: 850 },
  ] as const) {
    test(`Settings uses its parent scroller and touch-safe controls at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await loginAs(page, 'admin');
      await page.goto('/settings');
      await expect(page.getByRole('heading', { name: /^(Настройки|Sozlamalar)$/ })).toBeVisible();

      const layout = await page.locator('.settings-scroll').evaluate((scroller) => {
        const root = scroller.parentElement as HTMLElement;
        const rootStyle = window.getComputedStyle(root);
        const scrollerStyle = window.getComputedStyle(scroller);
        return {
          rootHeight: rootStyle.height,
          rootMinHeight: rootStyle.minHeight,
          rootOverflowY: rootStyle.overflowY,
          scrollerOverflowY: scrollerStyle.overflowY,
          scrollerPaddingBottom: Number.parseFloat(scrollerStyle.paddingBottom),
        };
      });
      expect(layout.rootHeight).not.toBe(`${viewport.height}px`);
      expect(layout.rootMinHeight).toBe('0px');
      expect(layout.rootOverflowY).not.toBe('hidden');
      expect(layout.scrollerOverflowY).toBe('visible');
      expect(layout.scrollerPaddingBottom).toBeLessThan(64);

      await expectMinimumControlSize(page.getByRole('button', { name: /^(Назад к дашборду|Dashboardga qaytish)$/ }), 'settings back');
      await expectMinimumControlSize(page.getByRole('button', { name: /^(Показать текущий пароль|Joriy parolni ko'rsatish)$/ }), 'current password visibility');
      await expectMinimumControlSize(page.getByRole('button', { name: /^(Показать новый пароль|Yangi parolni ko'rsatish)$/ }), 'new password visibility');
      await expectNoHorizontalOverflow(page, '/settings');
    });
  }
});

test.describe('@self-viewport Autonomous admin UX final matrix', () => {
  for (const role of ['admin', 'director'] as const) {
    test(`${role} Team contains toolbar and staff content at exactly 768px`, async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await loginAs(page, role);
      await page.goto('/team');
      await expect(page.getByRole('heading', { name: /^(Персонал|Xodimlar)$/ })).toBeVisible();
      await expectStaffShellContract(page, '/team');
      await expectNoHorizontalOverflow(page, '/team');

      const escaped = await page.locator('.staff-shell').evaluate((shell) => {
        const viewportWidth = document.documentElement.clientWidth;
        return Array.from(shell.querySelectorAll<HTMLElement>('*'))
          .map(element => ({ element, rect: element.getBoundingClientRect() }))
          .filter(({ element, rect }) => {
            const style = window.getComputedStyle(element);
            return style.display !== 'none' && style.position !== 'fixed' && (rect.left < -1 || rect.right > viewportWidth + 1 || rect.width > viewportWidth + 1);
          })
          .map(({ element, rect }) => ({ tag: element.tagName, className: element.className, left: rect.left, right: rect.right, width: rect.width }))
          .slice(0, 10);
      });
      expect(escaped, `Team descendants escape 768px: ${JSON.stringify(escaped)}`).toEqual([]);
    });
  }

  for (const role of ['admin', 'manager'] as const) {
    test(`${role} Estimates contains draft cards and actions at 1366px`, async ({ page }) => {
      const estimate = {
        id: `matrix-${role}-draft`, title: 'Matrix draft estimate', status: 'draft', building_id: 'matrix-building',
        effective_date: '2026-08-01', umumiy_year: 12000000, tariff_resident: 1875, deficit_year: 0, items: [],
      };
      await page.route(/\/api\/finance\/estimates(?:\?.*)?$/, route => route.fulfill({ json: { estimates: [estimate] } }));
      await page.setViewportSize({ width: 1366, height: 850 });
      await loginAs(page, role);
      await page.goto('/finance/estimates');
      await expect(page.getByRole('heading', { name: /^(Сметы|Smetalar)$/ })).toBeVisible();
      await expectStaffShellContract(page, '/finance/estimates');
      await expectNoHorizontalOverflow(page, '/finance/estimates');

      const actions = page.getByRole('button', { name: /^(Редактировать|Tahrirlash)$/ }).locator('..');
      const geometry = await actions.evaluate(element => {
        const parent = element.getBoundingClientRect();
        const buttons = Array.from(element.querySelectorAll('button')).map(button => button.getBoundingClientRect());
        return {
          parent: { left: parent.left, right: parent.right, width: parent.width },
          buttons: buttons.map(button => ({ left: button.left, right: button.right, width: button.width, height: button.height })),
        };
      });
      expect(geometry.parent.left).toBeGreaterThanOrEqual(-1);
      expect(geometry.parent.right).toBeLessThanOrEqual(1367);
      expect(geometry.buttons.every(button => button.left >= geometry.parent.left - 1 && button.right <= geometry.parent.right + 1)).toBe(true);
      expect(geometry.buttons.every(button => button.width >= 44 && button.height >= 44)).toBe(true);
    });
  }

  for (const route of ['/settings', '/finance/settings'] as const) {
    for (const width of [320, 768, 1024] as const) {
      test(`${route} keeps staff controls touch-safe at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: width === 320 ? 720 : 1024 });
        await loginAs(page, 'admin');
        await page.goto(route);
        await expect(page.getByRole('heading', {
          name: route === '/settings' ? /^(Настройки|Sozlamalar)$/ : /^(Настройки доступа|Ruxsat sozlamalari)$/,
        })).toBeVisible({ timeout: 25_000 });
        await expectStaffShellContract(page, route);
        await expectNoHorizontalOverflow(page, route);
      });
    }
  }

  test('Executor credential copy controls stay 44px at every matrix width', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await loginAs(page, 'manager');
    await page.goto('/executors');
    await expect(page.getByRole('heading', { name: /^(Исполнители|Ijrochilar)$/ })).toBeVisible();
    await page.getByRole('button', { name: /^(Добавить исполнителя|Ijrochi qo'shish)$/ }).click();
    const dialog = page.getByRole('dialog', { name: /^(Добавить сотрудника|Xodim qo'shish)$/ });
    await expect(dialog).toBeVisible();
    const fields = dialog.locator('input');
    await fields.nth(0).fill('Matrix Executor');
    await fields.nth(1).fill('+998901234567');
    await fields.nth(2).fill(`matrix.executor.${Date.now()}`);
    await fields.nth(3).fill('Matrix123!');
    await dialog.getByRole('button', { name: /^(Добавить|Qo'shish)$/ }).click();

    const credentials = page.getByRole('dialog', { name: /^(Исполнитель создан!|Ijrochi yaratildi!)$/ });
    await expect(credentials).toBeVisible();
    for (const width of [320, 768, 1366]) {
      await page.setViewportSize({ width, height: width === 320 ? 720 : 850 });
      for (const name of [/^(Копировать логин|Loginni nusxalash)$/, /^(Копировать пароль|Parolni nusxalash)$/]) {
        const copy = credentials.getByRole('button', { name });
        await expect.poll(async () => {
          const box = await copy.boundingBox();
          return box ? Math.min(box.width, box.height) : 0;
        }, { message: `${name} does not settle at 44px for ${width}px` }).toBeGreaterThanOrEqual(43.5);
        const minimums = await copy.evaluate(control => {
          const style = window.getComputedStyle(control);
          return { minWidth: Number.parseFloat(style.minWidth), minHeight: Number.parseFloat(style.minHeight) };
        });
        expect(minimums.minWidth).toBeGreaterThanOrEqual(44);
        expect(minimums.minHeight).toBeGreaterThanOrEqual(44);
      }
      await expectNoHorizontalOverflow(page, `/executors credentials ${width}`);
    }
  });

  test('staff-shell opt-out leaves decorative controls compact through 1024px', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await loginAs(page, 'admin');
    await page.goto('/team');
    const dimensions = await page.locator('.staff-shell').evaluate((shell) => {
      const control = document.createElement('button');
      control.className = 'staff-primary-control staff-control-opt-out';
      control.style.width = '12px';
      control.style.height = '12px';
      control.style.padding = '0';
      control.setAttribute('aria-label', 'decorative chart control');
      shell.append(control);
      const rect = control.getBoundingClientRect();
      const style = window.getComputedStyle(control);
      return { width: rect.width, height: rect.height, minWidth: style.minWidth, minHeight: style.minHeight };
    });
    expect(dimensions.width).toBe(12);
    expect(dimensions.height).toBe(12);
    expect(dimensions.minWidth).not.toBe('44px');
    expect(dimensions.minHeight).not.toBe('44px');
  });
});
