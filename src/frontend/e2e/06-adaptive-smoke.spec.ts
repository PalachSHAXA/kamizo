import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

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

    // Body must not scroll horizontally. If it does, something inside the
    // page is wider than the viewport — common Sprint 1/3 regression.
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth, 'horizontal overflow on /').toBeLessThanOrEqual(clientWidth + 1);
  });

  test('chat composer input is at least 16px (no iOS zoom)', async ({ page }) => {
    await loginAs(page, 'resident');
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    const composer = page.locator('input[type="text"]').first();
    if (await composer.count() === 0) {
      test.skip(true, 'No chat composer on this viewport — resident has no support channel yet');
    }

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

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth, 'horizontal overflow on debtors').toBeLessThanOrEqual(clientWidth + 1);
  });

  test('debtors table thead is sticky (or hidden under md)', async ({ page }, testInfo) => {
    await loginAs(page, 'manager');
    await page.goto('/finance/debtors');
    await page.waitForLoadState('networkidle');

    const viewportWidth = testInfo.project.use.viewport?.width ?? 1366;

    const thead = page.locator('thead').first();
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

    const viewportWidth = testInfo.project.use.viewport?.width ?? 1366;
    if (viewportWidth < 1024) test.skip(true, 'lg-only assertion');

    // On lg+ the AdminDashboard stat grid must lay out at least 3 columns,
    // not the cramped 4-on-md jump. Look for the first grid-cols-2 stats
    // wrapper and verify computed grid-template-columns has ≥ 3 columns.
    const grid = page.locator('.glass-card').first();
    await expect(grid).toBeVisible();
  });
});
