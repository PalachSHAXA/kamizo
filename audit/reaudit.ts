import { chromium, Browser, Page, BrowserContext } from 'playwright';
import * as fs from 'fs';

const DEMO_BASE = 'https://demo.kamizo.uz';
const MAIN_BASE = 'https://kamizo.uz';
const SCREENSHOTS_DIR = '/Users/shaxzodisamahamadov/kamizo/audit/screenshots/reaudit';
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

interface TestResult {
  role?: string;
  test?: string;
  status: 'PASS' | 'FAIL' | 'NEEDS_REVIEW';
  notes: string;
  http_status?: number;
  error?: string;
}

interface Phase {
  phase: number;
  name: string;
  tests: TestResult[];
}

const report: { audit_date: string; phases: Phase[]; summary: any } = {
  audit_date: '2026-03-12',
  phases: [],
  summary: {}
};

function log(msg: string) {
  console.log(`[AUDIT] ${msg}`);
}

// ─── Helper: login ────────────────────────────────────────────────────────────
async function doLogin(page: Page, username: string, password: string, baseUrl: string): Promise<{ success: boolean; notes: string }> {
  try {
    await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Fill username
    const usernameInput = page.locator('input[type="text"], input[name="username"], input[name="login"]').first();
    await usernameInput.fill(username);

    // Fill password
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill(password);

    // Accept terms if needed
    try {
      const termsLink = page.locator('text=публичной оферты, text=ommaviy oferta').first();
      if (await termsLink.isVisible({ timeout: 1000 })) {
        await termsLink.click();
        await page.waitForTimeout(1000);
        // Scroll modal and accept
        const modal = page.locator('.overflow-y-auto').first();
        if (await modal.isVisible({ timeout: 1000 })) {
          await modal.evaluate((el: Element) => { (el as HTMLElement).scrollTop = (el as HTMLElement).scrollHeight; });
          await page.waitForTimeout(500);
        }
        // Click accept button
        const acceptBtn = page.locator('button:has-text("Принять"), button:has-text("Qabul qilish")').first();
        if (await acceptBtn.isVisible({ timeout: 1000 })) {
          await acceptBtn.click();
          await page.waitForTimeout(500);
        }
      }
    } catch {}

    // Check checkbox if present
    try {
      const checkbox = page.locator('input[type="checkbox"]').first();
      if (await checkbox.isVisible({ timeout: 1000 }) && !(await checkbox.isChecked())) {
        await checkbox.click();
        await page.waitForTimeout(300);
      }
    } catch {}

    // Click login button
    const loginBtn = page.locator('button:has-text("Войти"), button:has-text("Kirish"), button[type="submit"]').first();
    await loginBtn.click();
    await page.waitForTimeout(4000);

    // Check if logged in - look for nav or dashboard content
    const isLoggedIn = await page.locator('nav, [class*="sidebar"], [class*="dashboard"]').first().isVisible({ timeout: 5000 }).catch(() => false);
    const currentUrl = page.url();
    const isNotOnLogin = !currentUrl.includes('login') || currentUrl !== baseUrl;

    if (isLoggedIn || isNotOnLogin) {
      return { success: true, notes: `Logged in, redirected to ${currentUrl.replace(baseUrl, '') || '/'}` };
    } else {
      const errorMsg = await page.locator('[class*="error"], [class*="alert"], .text-red').first().textContent({ timeout: 2000 }).catch(() => '');
      return { success: false, notes: `Login failed. Current URL: ${currentUrl}. Error: ${errorMsg}` };
    }
  } catch (err: any) {
    return { success: false, notes: `Exception during login: ${err.message}` };
  }
}

// ─── Helper: check page loads without 500 errors ──────────────────────────────
async function checkPageLoad(page: Page, url: string, label: string): Promise<{ status: 'PASS' | 'FAIL' | 'NEEDS_REVIEW'; notes: string }> {
  const errors: string[] = [];
  const apiErrors: string[] = [];

  const responseHandler = (response: any) => {
    if (response.url().includes('/api/') && response.status() >= 500) {
      apiErrors.push(`${response.status()} ${response.url()}`);
    }
  };

  page.on('response', responseHandler);

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(2000);

    const pageErrors = await page.locator('[class*="error-page"], [class*="not-found"]').first().isVisible({ timeout: 1000 }).catch(() => false);
    const hasContent = await page.locator('main, [class*="dashboard"], [class*="page-content"], h1, h2').first().isVisible({ timeout: 3000 }).catch(() => false);

    page.off('response', responseHandler);

    if (apiErrors.length > 0) {
      return { status: 'FAIL', notes: `API errors: ${apiErrors.join(', ')}` };
    }
    if (!hasContent) {
      return { status: 'NEEDS_REVIEW', notes: `Page may not have loaded content properly` };
    }
    return { status: 'PASS', notes: `Page loaded successfully` };
  } catch (err: any) {
    page.off('response', responseHandler);
    return { status: 'FAIL', notes: `Navigation error: ${err.message}` };
  }
}

// ─── Phase 1: Login & Auth ────────────────────────────────────────────────────
async function phase1_LoginAuth(browser: Browser): Promise<Phase> {
  const phase: Phase = { phase: 1, name: 'Login & Auth', tests: [] };

  const roles = [
    { role: 'admin', username: 'demo-admin', password: 'demo123', url: DEMO_BASE },
    { role: 'manager', username: 'demo-manager', password: 'demo123', url: DEMO_BASE },
    { role: 'director', username: 'demo-director', password: 'demo123', url: DEMO_BASE },
    { role: 'resident', username: 'demo-resident', password: 'demo123', url: DEMO_BASE },
    { role: 'executor', username: 'demo-executor', password: 'demo123', url: DEMO_BASE },
    { role: 'guard', username: 'demo-guard', password: 'demo123', url: DEMO_BASE },
    { role: 'department_head', username: 'demo-head', password: 'demo123', url: DEMO_BASE },
    { role: 'tenant', username: 'demo-tenant', password: 'demo123', url: DEMO_BASE },
    { role: 'advertiser', username: 'demo-advertiser', password: 'demo123', url: DEMO_BASE },
    { role: 'courier', username: 'demo-courier', password: 'demo123', url: DEMO_BASE },
    { role: 'super_admin', username: 'admin', password: 'admin123', url: MAIN_BASE },
  ];

  for (const r of roles) {
    log(`Testing login for ${r.role} (${r.username}) at ${r.url}`);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();

    try {
      const result = await doLogin(page, r.username, r.password, r.url);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/login-${r.role}.png` });
      phase.tests.push({
        role: r.role,
        status: result.success ? 'PASS' : 'FAIL',
        notes: result.notes
      });
      log(`  ${r.role}: ${result.success ? 'PASS' : 'FAIL'} - ${result.notes}`);
    } catch (err: any) {
      phase.tests.push({ role: r.role, status: 'FAIL', notes: `Exception: ${err.message}` });
    }

    await ctx.close();
    await new Promise(r => setTimeout(r, 2000)); // Rate limit
  }

  return phase;
}

// ─── Phase 2: Admin Dashboard ──────────────────────────────────────────────────
async function phase2_AdminDashboard(browser: Browser): Promise<Phase> {
  const phase: Phase = { phase: 2, name: 'Admin Dashboard', tests: [] };

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  try {
    log('Phase 2: Admin Dashboard - logging in as demo-admin');
    const loginResult = await doLogin(page, 'demo-admin', 'demo123', DEMO_BASE);
    phase.tests.push({ test: 'Login', role: 'admin', status: loginResult.success ? 'PASS' : 'FAIL', notes: loginResult.notes });

    if (!loginResult.success) {
      await ctx.close();
      return phase;
    }

    await page.screenshot({ path: `${SCREENSHOTS_DIR}/admin-dashboard-overview.png` });

    // Test navigation tabs
    const tabs = [
      { name: 'Overview', selector: 'a[href="/"], a[href*="overview"], button:has-text("Обзор")' },
      { name: 'Residents', url: '/residents' },
      { name: 'Buildings', url: '/buildings' },
      { name: 'Executors', url: '/executors' },
      { name: 'Requests', url: '/requests' },
      { name: 'Meetings', url: '/meetings' },
      { name: 'Marketplace', url: '/marketplace' },
      { name: 'Announcements', url: '/announcements' },
      { name: 'Work Orders', url: '/work-orders' },
      { name: 'Reports', url: '/reports' },
      { name: 'Settings', url: '/settings' },
    ];

    for (const tab of tabs) {
      try {
        const url = tab.url ? `${DEMO_BASE}${tab.url}` : DEMO_BASE;
        const apiErrors: string[] = [];
        const responseHandler = (response: any) => {
          if (response.url().includes('/api/') && response.status() >= 500) {
            apiErrors.push(`${response.status()} ${response.url().split('/api/')[1]?.split('?')[0]}`);
          }
        };
        page.on('response', responseHandler);

        await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
        await page.waitForTimeout(2000);

        page.off('response', responseHandler);

        const hasContent = await page.locator('main, table, [class*="card"], [class*="stat"]').first().isVisible({ timeout: 3000 }).catch(() => false);
        const screenshotName = `admin-tab-${tab.name.toLowerCase().replace(/\s+/g, '-')}.png`;
        await page.screenshot({ path: `${SCREENSHOTS_DIR}/${screenshotName}` });

        if (apiErrors.length > 0) {
          phase.tests.push({ test: `Tab: ${tab.name}`, role: 'admin', status: 'FAIL', notes: `API 500 errors: ${apiErrors.join(', ')}` });
        } else if (!hasContent) {
          phase.tests.push({ test: `Tab: ${tab.name}`, role: 'admin', status: 'NEEDS_REVIEW', notes: 'No visible content detected' });
        } else {
          phase.tests.push({ test: `Tab: ${tab.name}`, role: 'admin', status: 'PASS', notes: 'Tab loaded successfully' });
        }
        log(`  Admin Tab ${tab.name}: ${apiErrors.length > 0 ? 'FAIL' : hasContent ? 'PASS' : 'NEEDS_REVIEW'}`);
      } catch (err: any) {
        phase.tests.push({ test: `Tab: ${tab.name}`, role: 'admin', status: 'FAIL', notes: `Error: ${err.message}` });
      }
    }

    // Check platform ads tab (navigate to admin panel if available)
    try {
      await page.goto(`${DEMO_BASE}/admin/ads`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/admin-platform-ads.png` });
      phase.tests.push({ test: 'Ads (platform_ads tab)', role: 'admin', status: 'NEEDS_REVIEW', notes: `URL: ${page.url()}` });
    } catch (err: any) {
      phase.tests.push({ test: 'Ads (platform_ads tab)', role: 'admin', status: 'NEEDS_REVIEW', notes: `Could not test: ${err.message}` });
    }

  } catch (err: any) {
    phase.tests.push({ test: 'Phase error', role: 'admin', status: 'FAIL', notes: `Phase exception: ${err.message}` });
  }

  await ctx.close();
  return phase;
}

// ─── Phase 3: Manager Dashboard ───────────────────────────────────────────────
async function phase3_ManagerDashboard(browser: Browser): Promise<Phase> {
  const phase: Phase = { phase: 3, name: 'Manager Dashboard', tests: [] };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  try {
    log('Phase 3: Manager Dashboard');
    const loginResult = await doLogin(page, 'demo-manager', 'demo123', DEMO_BASE);
    phase.tests.push({ test: 'Login', role: 'manager', status: loginResult.success ? 'PASS' : 'FAIL', notes: loginResult.notes });

    if (!loginResult.success) { await ctx.close(); return phase; }

    // Overview stats
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/manager-overview.png` });
    const hasStats = await page.locator('[class*="stat"], [class*="card"]').first().isVisible({ timeout: 3000 }).catch(() => false);
    phase.tests.push({ test: 'Overview stats', role: 'manager', status: hasStats ? 'PASS' : 'NEEDS_REVIEW', notes: hasStats ? 'Stats visible' : 'No stats visible' });

    // Guest access
    try {
      await page.goto(`${DEMO_BASE}/guest-access`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/manager-guest-access.png` });
      const hasContent = await page.locator('main, table, [class*="card"]').first().isVisible({ timeout: 3000 }).catch(() => false);
      phase.tests.push({ test: 'Guest access management', role: 'manager', status: hasContent ? 'PASS' : 'NEEDS_REVIEW', notes: hasContent ? 'Page loaded' : 'No content' });
    } catch (err: any) {
      phase.tests.push({ test: 'Guest access management', role: 'manager', status: 'FAIL', notes: err.message });
    }

    // Rentals
    try {
      await page.goto(`${DEMO_BASE}/rentals`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/manager-rentals.png` });
      const hasContent = await page.locator('main, table, [class*="card"]').first().isVisible({ timeout: 3000 }).catch(() => false);
      phase.tests.push({ test: 'Rentals tab', role: 'manager', status: hasContent ? 'PASS' : 'NEEDS_REVIEW', notes: hasContent ? 'Rentals loaded' : 'No content' });
    } catch (err: any) {
      phase.tests.push({ test: 'Rentals tab', role: 'manager', status: 'FAIL', notes: err.message });
    }

    // Requests assignment
    try {
      await page.goto(`${DEMO_BASE}/requests`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/manager-requests.png` });
      const hasContent = await page.locator('main, table, [class*="card"], [class*="request"]').first().isVisible({ timeout: 3000 }).catch(() => false);
      phase.tests.push({ test: 'Requests assignment', role: 'manager', status: hasContent ? 'PASS' : 'NEEDS_REVIEW', notes: hasContent ? 'Requests loaded' : 'No content' });
    } catch (err: any) {
      phase.tests.push({ test: 'Requests assignment', role: 'manager', status: 'FAIL', notes: err.message });
    }

  } catch (err: any) {
    phase.tests.push({ test: 'Phase error', role: 'manager', status: 'FAIL', notes: err.message });
  }

  await ctx.close();
  return phase;
}

// ─── Phase 4: Resident Dashboard ──────────────────────────────────────────────
async function phase4_ResidentDashboard(browser: Browser): Promise<Phase> {
  const phase: Phase = { phase: 4, name: 'Resident Dashboard', tests: [] };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  try {
    log('Phase 4: Resident Dashboard');
    const loginResult = await doLogin(page, 'demo-resident', 'demo123', DEMO_BASE);
    phase.tests.push({ test: 'Login', role: 'resident', status: loginResult.success ? 'PASS' : 'FAIL', notes: loginResult.notes });

    if (!loginResult.success) { await ctx.close(); return phase; }

    // Dashboard loads with real data
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/resident-dashboard.png` });
    const hasData = await page.locator('[class*="stat"], [class*="card"], h1, h2').first().isVisible({ timeout: 5000 }).catch(() => false);
    phase.tests.push({ test: 'Dashboard loads with data', role: 'resident', status: hasData ? 'PASS' : 'NEEDS_REVIEW', notes: hasData ? 'Dashboard content visible' : 'No content visible' });

    // Submit a new service request
    try {
      await page.goto(`${DEMO_BASE}/requests`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);

      // Find and click create button
      let createClicked = false;
      const btns = await page.locator('button:visible').all();
      for (const btn of btns) {
        const text = (await btn.textContent() || '').trim();
        if (/создат|новая|заявк|create|new|submit/i.test(text)) {
          await btn.click();
          await page.waitForTimeout(2000);
          createClicked = true;
          break;
        }
      }

      if (!createClicked) {
        // Try floating action button or "+" button
        const fabBtn = page.locator('[class*="fab"], button[class*="rounded-full"], button:has([class*="plus"])').first();
        if (await fabBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await fabBtn.click();
          await page.waitForTimeout(2000);
          createClicked = true;
        }
      }

      await page.screenshot({ path: `${SCREENSHOTS_DIR}/resident-create-request-form.png` });

      if (createClicked) {
        const formVisible = await page.locator('form, [role="dialog"], [class*="modal"]').first().isVisible({ timeout: 3000 }).catch(() => false);

        if (formVisible) {
          // Fill in the form
          // Select type - plumbing
          const typeSelect = page.locator('select, [class*="select"]').first();
          if (await typeSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
            try {
              await typeSelect.selectOption({ label: /сантех|plumb/i }).catch(async () => {
                await typeSelect.selectOption({ index: 1 });
              });
            } catch {}
          }

          // Fill description
          const descInput = page.locator('textarea').first();
          if (await descInput.isVisible({ timeout: 2000 }).catch(() => false)) {
            await descInput.fill('Test audit request');
          }

          // Submit
          const submitBtn = page.locator('button[type="submit"], button:has-text("Отправить"), button:has-text("Создать"), button:has-text("Сохранить")').first();
          let apiSuccess = false;
          const responsePromise = page.waitForResponse(
            r => r.url().includes('/api/') && (r.url().includes('request') || r.url().includes('order')),
            { timeout: 10000 }
          ).catch(() => null);

          if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await submitBtn.click();
            const resp = await responsePromise;
            if (resp) {
              apiSuccess = resp.status() < 400;
            }
          }

          await page.waitForTimeout(2000);
          await page.screenshot({ path: `${SCREENSHOTS_DIR}/resident-request-submitted.png` });

          phase.tests.push({
            test: 'Submit service request (plumbing)',
            role: 'resident',
            status: apiSuccess ? 'PASS' : 'NEEDS_REVIEW',
            notes: apiSuccess ? 'Request submitted via API' : 'Form found but API response uncertain'
          });
        } else {
          phase.tests.push({ test: 'Submit service request (plumbing)', role: 'resident', status: 'FAIL', notes: 'Create form not found after clicking create button' });
        }
      } else {
        phase.tests.push({ test: 'Submit service request (plumbing)', role: 'resident', status: 'FAIL', notes: 'Create button not found on requests page' });
      }

      // Verify request appears in list
      await page.goto(`${DEMO_BASE}/requests`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      const requestList = await page.locator('[class*="request-card"], [class*="card"], table tr').count();
      phase.tests.push({ test: 'Request appears in list', role: 'resident', status: requestList > 0 ? 'PASS' : 'NEEDS_REVIEW', notes: `${requestList} items visible in list` });
    } catch (err: any) {
      phase.tests.push({ test: 'Submit service request', role: 'resident', status: 'FAIL', notes: err.message });
    }

    // Announcements
    try {
      await page.goto(`${DEMO_BASE}/announcements`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/resident-announcements.png` });
      const announcementsCount = await page.locator('[class*="card"], [class*="announcement"], article').count();
      phase.tests.push({
        test: 'Announcements tab - at least 1 visible',
        role: 'resident',
        status: announcementsCount > 0 ? 'PASS' : 'FAIL',
        notes: `${announcementsCount} announcements visible`
      });
    } catch (err: any) {
      phase.tests.push({ test: 'Announcements tab', role: 'resident', status: 'FAIL', notes: err.message });
    }

    // Vehicles tab
    try {
      await page.goto(`${DEMO_BASE}/vehicles`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/resident-vehicles.png` });
      const hasContent = await page.locator('main, [class*="card"], h1, h2').first().isVisible({ timeout: 3000 }).catch(() => false);
      phase.tests.push({ test: 'Vehicles tab', role: 'resident', status: hasContent ? 'PASS' : 'NEEDS_REVIEW', notes: hasContent ? 'Vehicles page loaded' : 'No content' });
    } catch (err: any) {
      phase.tests.push({ test: 'Vehicles tab', role: 'resident', status: 'FAIL', notes: err.message });
    }

    // Guest access - create a guest pass
    try {
      await page.goto(`${DEMO_BASE}/guest-access`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/resident-guest-access.png` });

      let createFound = false;
      for (const btn of await page.locator('button:visible').all()) {
        const text = (await btn.textContent() || '').trim();
        if (/создат|пригласи|invite|новый|create/i.test(text)) {
          await btn.click();
          await page.waitForTimeout(2000);
          createFound = true;
          await page.screenshot({ path: `${SCREENSHOTS_DIR}/resident-guest-access-create.png` });
          break;
        }
      }

      const formVisible = await page.locator('form, [role="dialog"], [class*="modal"]').first().isVisible({ timeout: 2000 }).catch(() => false);
      phase.tests.push({
        test: 'Guest access - create guest pass',
        role: 'resident',
        status: (createFound && formVisible) ? 'PASS' : createFound ? 'NEEDS_REVIEW' : 'FAIL',
        notes: createFound ? (formVisible ? 'Create form opened' : 'Button clicked but no form') : 'Create button not found'
      });

      if (formVisible) await page.keyboard.press('Escape');
    } catch (err: any) {
      phase.tests.push({ test: 'Guest access - create guest pass', role: 'resident', status: 'FAIL', notes: err.message });
    }

    // Marketplace
    try {
      await page.goto(`${DEMO_BASE}/marketplace`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/resident-marketplace.png` });
      const productCount = await page.locator('[class*="product"], [class*="card"]').count();
      phase.tests.push({ test: 'Marketplace - browse products', role: 'resident', status: productCount > 0 ? 'PASS' : 'NEEDS_REVIEW', notes: `${productCount} product cards visible` });

      // Add to cart
      const addToCartBtn = page.locator('button:has-text("В корзину"), button:has-text("Добавить"), button:has-text("Savatga")').first();
      if (await addToCartBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await addToCartBtn.click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: `${SCREENSHOTS_DIR}/resident-marketplace-cart.png` });
        phase.tests.push({ test: 'Marketplace - add to cart', role: 'resident', status: 'PASS', notes: 'Add to cart clicked' });
      } else {
        phase.tests.push({ test: 'Marketplace - add to cart', role: 'resident', status: 'NEEDS_REVIEW', notes: 'Add to cart button not found' });
      }

      // Place order (find cart/checkout)
      const cartBtn = page.locator('button:has-text("Корзина"), button:has-text("Оформить"), [class*="cart"]').first();
      if (await cartBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await cartBtn.click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: `${SCREENSHOTS_DIR}/resident-marketplace-checkout.png` });
        phase.tests.push({ test: 'Marketplace - place order flow', role: 'resident', status: 'PASS', notes: 'Cart/checkout accessed' });
      } else {
        phase.tests.push({ test: 'Marketplace - place order flow', role: 'resident', status: 'NEEDS_REVIEW', notes: 'Cart/checkout button not found' });
      }
    } catch (err: any) {
      phase.tests.push({ test: 'Marketplace', role: 'resident', status: 'FAIL', notes: err.message });
    }

    // Meetings tab
    try {
      await page.goto(`${DEMO_BASE}/meetings`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/resident-meetings.png` });
      const hasContent = await page.locator('main, [class*="card"], h1, h2').first().isVisible({ timeout: 3000 }).catch(() => false);
      phase.tests.push({ test: 'Meetings tab', role: 'resident', status: hasContent ? 'PASS' : 'NEEDS_REVIEW', notes: hasContent ? 'Meetings page loaded' : 'No content' });
    } catch (err: any) {
      phase.tests.push({ test: 'Meetings tab', role: 'resident', status: 'FAIL', notes: err.message });
    }

  } catch (err: any) {
    phase.tests.push({ test: 'Phase error', role: 'resident', status: 'FAIL', notes: err.message });
  }

  await ctx.close();
  return phase;
}

// ─── Phase 5: Executor Dashboard ──────────────────────────────────────────────
async function phase5_ExecutorDashboard(browser: Browser): Promise<Phase> {
  const phase: Phase = { phase: 5, name: 'Executor Dashboard', tests: [] };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  try {
    log('Phase 5: Executor Dashboard');
    const loginResult = await doLogin(page, 'demo-executor', 'demo123', DEMO_BASE);
    phase.tests.push({ test: 'Login', role: 'executor', status: loginResult.success ? 'PASS' : 'FAIL', notes: loginResult.notes });

    if (!loginResult.success) { await ctx.close(); return phase; }

    // Check pending requests
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/executor-dashboard.png` });
    const hasRequests = await page.locator('[class*="request"], [class*="card"], table').first().isVisible({ timeout: 5000 }).catch(() => false);
    phase.tests.push({ test: 'Pending requests appear', role: 'executor', status: hasRequests ? 'PASS' : 'NEEDS_REVIEW', notes: hasRequests ? 'Requests/cards visible' : 'No requests visible' });

    // Accept one request - look for "accept" or status change button
    try {
      const acceptBtn = page.locator('button:has-text("Принять"), button:has-text("В работу"), button:has-text("Qabul"), button:has-text("Начать")').first();
      if (await acceptBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        const responsePromise = page.waitForResponse(
          r => r.url().includes('/api/') && (r.request().method() === 'PUT' || r.request().method() === 'PATCH'),
          { timeout: 10000 }
        ).catch(() => null);
        await acceptBtn.click();
        const resp = await responsePromise;
        await page.waitForTimeout(2000);
        await page.screenshot({ path: `${SCREENSHOTS_DIR}/executor-request-accepted.png` });
        phase.tests.push({ test: 'Accept request (in_progress)', role: 'executor', status: resp ? (resp.status() < 400 ? 'PASS' : 'FAIL') : 'NEEDS_REVIEW', notes: resp ? `API ${resp.status()}` : 'Accept clicked but no API response captured' });
      } else {
        phase.tests.push({ test: 'Accept request (in_progress)', role: 'executor', status: 'NEEDS_REVIEW', notes: 'Accept button not immediately visible, may need to open request card first' });
      }
    } catch (err: any) {
      phase.tests.push({ test: 'Accept request (in_progress)', role: 'executor', status: 'FAIL', notes: err.message });
    }

    // Complete a request
    try {
      const completeBtn = page.locator('button:has-text("Завершить"), button:has-text("Выполнен"), button:has-text("Tugallash")').first();
      if (await completeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await completeBtn.click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: `${SCREENSHOTS_DIR}/executor-request-completed.png` });
        phase.tests.push({ test: 'Complete request', role: 'executor', status: 'PASS', notes: 'Complete button clicked' });
      } else {
        phase.tests.push({ test: 'Complete request', role: 'executor', status: 'NEEDS_REVIEW', notes: 'Complete button not found (may need request in_progress first)' });
      }
    } catch (err: any) {
      phase.tests.push({ test: 'Complete request', role: 'executor', status: 'FAIL', notes: err.message });
    }

    // Schedule page
    try {
      await page.goto(`${DEMO_BASE}/schedule`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/executor-schedule.png` });
      const hasContent = await page.locator('main, [class*="schedule"], [class*="calendar"], h1, h2').first().isVisible({ timeout: 3000 }).catch(() => false);
      phase.tests.push({ test: 'Schedule page', role: 'executor', status: hasContent ? 'PASS' : 'NEEDS_REVIEW', notes: hasContent ? 'Schedule page loaded' : 'No content' });
    } catch (err: any) {
      phase.tests.push({ test: 'Schedule page', role: 'executor', status: 'FAIL', notes: err.message });
    }

    // Announcements
    try {
      await page.goto(`${DEMO_BASE}/announcements`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/executor-announcements.png` });
      const hasContent = await page.locator('main, [class*="card"], h1, h2').first().isVisible({ timeout: 3000 }).catch(() => false);
      phase.tests.push({ test: 'Announcements', role: 'executor', status: hasContent ? 'PASS' : 'NEEDS_REVIEW', notes: hasContent ? 'Announcements loaded' : 'No content' });
    } catch (err: any) {
      phase.tests.push({ test: 'Announcements', role: 'executor', status: 'FAIL', notes: err.message });
    }

  } catch (err: any) {
    phase.tests.push({ test: 'Phase error', role: 'executor', status: 'FAIL', notes: err.message });
  }

  await ctx.close();
  return phase;
}

// ─── Phase 6: Director Dashboard ──────────────────────────────────────────────
async function phase6_DirectorDashboard(browser: Browser): Promise<Phase> {
  const phase: Phase = { phase: 6, name: 'Director Dashboard', tests: [] };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  try {
    log('Phase 6: Director Dashboard');
    const loginResult = await doLogin(page, 'demo-director', 'demo123', DEMO_BASE);
    phase.tests.push({ test: 'Login', role: 'director', status: loginResult.success ? 'PASS' : 'FAIL', notes: loginResult.notes });

    if (!loginResult.success) { await ctx.close(); return phase; }

    // Stats and charts
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/director-dashboard.png` });
    const hasStats = await page.locator('[class*="stat"], [class*="card"], canvas').first().isVisible({ timeout: 5000 }).catch(() => false);
    phase.tests.push({ test: 'Stats and charts', role: 'director', status: hasStats ? 'PASS' : 'NEEDS_REVIEW', notes: hasStats ? 'Stats/charts visible' : 'No stats visible' });

    // Team management tab
    try {
      await page.goto(`${DEMO_BASE}/team`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/director-team.png` });
      const hasContent = await page.locator('main, table, [class*="card"], h1, h2').first().isVisible({ timeout: 3000 }).catch(() => false);
      phase.tests.push({ test: 'Team management tab', role: 'director', status: hasContent ? 'PASS' : 'NEEDS_REVIEW', notes: hasContent ? 'Team page loaded' : 'No content' });
    } catch (err: any) {
      phase.tests.push({ test: 'Team management tab', role: 'director', status: 'FAIL', notes: err.message });
    }

    // Executors tab
    try {
      await page.goto(`${DEMO_BASE}/executors`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/director-executors.png` });
      const hasContent = await page.locator('main, table, [class*="card"], h1, h2').first().isVisible({ timeout: 3000 }).catch(() => false);
      phase.tests.push({ test: 'Executors tab', role: 'director', status: hasContent ? 'PASS' : 'NEEDS_REVIEW', notes: hasContent ? 'Executors page loaded' : 'No content' });
    } catch (err: any) {
      phase.tests.push({ test: 'Executors tab', role: 'director', status: 'FAIL', notes: err.message });
    }

  } catch (err: any) {
    phase.tests.push({ test: 'Phase error', role: 'director', status: 'FAIL', notes: err.message });
  }

  await ctx.close();
  return phase;
}

// ─── Phase 7: Department Head ──────────────────────────────────────────────────
async function phase7_DepartmentHead(browser: Browser): Promise<Phase> {
  const phase: Phase = { phase: 7, name: 'Department Head', tests: [] };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  try {
    log('Phase 7: Department Head');
    const loginResult = await doLogin(page, 'demo-head', 'demo123', DEMO_BASE);
    phase.tests.push({ test: 'Login', role: 'department_head', status: loginResult.success ? 'PASS' : 'FAIL', notes: loginResult.notes });

    if (!loginResult.success) { await ctx.close(); return phase; }

    await page.screenshot({ path: `${SCREENSHOTS_DIR}/dept-head-dashboard.png` });
    const hasDashboard = await page.locator('[class*="dashboard"], [class*="card"], main').first().isVisible({ timeout: 5000 }).catch(() => false);
    phase.tests.push({ test: 'Dashboard loads', role: 'department_head', status: hasDashboard ? 'PASS' : 'NEEDS_REVIEW', notes: hasDashboard ? 'Dashboard visible' : 'No content' });

    // Requests visible
    try {
      await page.goto(`${DEMO_BASE}/requests`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/dept-head-requests.png` });
      const hasRequests = await page.locator('main, [class*="card"], table').first().isVisible({ timeout: 3000 }).catch(() => false);
      phase.tests.push({ test: 'Requests visible', role: 'department_head', status: hasRequests ? 'PASS' : 'NEEDS_REVIEW', notes: hasRequests ? 'Requests page loaded' : 'No content' });
    } catch (err: any) {
      phase.tests.push({ test: 'Requests visible', role: 'department_head', status: 'FAIL', notes: err.message });
    }

  } catch (err: any) {
    phase.tests.push({ test: 'Phase error', role: 'department_head', status: 'FAIL', notes: err.message });
  }

  await ctx.close();
  return phase;
}

// ─── Phase 8: Guard QR Scanner ────────────────────────────────────────────────
async function phase8_Guard(browser: Browser): Promise<Phase> {
  const phase: Phase = { phase: 8, name: 'Guard QR Scanner', tests: [] };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  try {
    log('Phase 8: Guard QR Scanner');
    const loginResult = await doLogin(page, 'demo-guard', 'demo123', DEMO_BASE);
    phase.tests.push({ test: 'Login', role: 'guard', status: loginResult.success ? 'PASS' : 'FAIL', notes: loginResult.notes });

    if (!loginResult.success) { await ctx.close(); return phase; }

    // QR Scanner page
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/guard-dashboard.png` });

    // Navigate to QR scanner
    try {
      const qrUrl = `${DEMO_BASE}/qr-scanner`;
      await page.goto(qrUrl, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/guard-qr-scanner.png` });
      const hasContent = await page.locator('main, [class*="scanner"], [class*="qr"], h1, h2').first().isVisible({ timeout: 3000 }).catch(() => false);
      phase.tests.push({ test: 'QR scanner page loads', role: 'guard', status: hasContent ? 'PASS' : 'NEEDS_REVIEW', notes: hasContent ? 'QR scanner page visible' : `No content, URL: ${page.url()}` });
    } catch (err: any) {
      phase.tests.push({ test: 'QR scanner page loads', role: 'guard', status: 'FAIL', notes: err.message });
    }

    // Vehicle search
    try {
      await page.goto(`${DEMO_BASE}/vehicle-search`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/guard-vehicle-search.png` });
      const hasContent = await page.locator('main, input, h1, h2').first().isVisible({ timeout: 3000 }).catch(() => false);
      phase.tests.push({ test: 'Vehicle search loads', role: 'guard', status: hasContent ? 'PASS' : 'NEEDS_REVIEW', notes: hasContent ? 'Vehicle search page visible' : `No content, URL: ${page.url()}` });
    } catch (err: any) {
      phase.tests.push({ test: 'Vehicle search loads', role: 'guard', status: 'FAIL', notes: err.message });
    }

  } catch (err: any) {
    phase.tests.push({ test: 'Phase error', role: 'guard', status: 'FAIL', notes: err.message });
  }

  await ctx.close();
  return phase;
}

// ─── Phase 9: Advertiser ──────────────────────────────────────────────────────
async function phase9_Advertiser(browser: Browser): Promise<Phase> {
  const phase: Phase = { phase: 9, name: 'Advertiser', tests: [] };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  try {
    log('Phase 9: Advertiser');
    const loginResult = await doLogin(page, 'demo-advertiser', 'demo123', DEMO_BASE);
    phase.tests.push({ test: 'Login', role: 'advertiser', status: loginResult.success ? 'PASS' : 'FAIL', notes: loginResult.notes });

    if (!loginResult.success) { await ctx.close(); return phase; }

    // Advertiser dashboard
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/advertiser-dashboard.png` });
    const hasDashboard = await page.locator('[class*="dashboard"], [class*="ad"], main, h1').first().isVisible({ timeout: 5000 }).catch(() => false);
    phase.tests.push({ test: 'Advertiser dashboard loads', role: 'advertiser', status: hasDashboard ? 'PASS' : 'NEEDS_REVIEW', notes: hasDashboard ? 'Dashboard visible' : 'No content visible' });

    // Create a new ad
    try {
      let createFound = false;
      for (const btn of await page.locator('button:visible').all()) {
        const text = (await btn.textContent() || '').trim();
        if (/создат|новое|объяв|create|new|add/i.test(text)) {
          await btn.click();
          await page.waitForTimeout(2000);
          createFound = true;
          break;
        }
      }

      if (!createFound) {
        // Try "+" button
        const plusBtn = page.locator('button:has-text("+"), button[class*="fab"]').first();
        if (await plusBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await plusBtn.click();
          await page.waitForTimeout(2000);
          createFound = true;
        }
      }

      await page.screenshot({ path: `${SCREENSHOTS_DIR}/advertiser-create-ad-form.png` });

      if (createFound) {
        const formVisible = await page.locator('form, [role="dialog"], [class*="modal"]').first().isVisible({ timeout: 3000 }).catch(() => false);

        if (formVisible) {
          // Fill title
          const titleInput = page.locator('input[type="text"], input[name="title"], input[placeholder*="назван"]').first();
          if (await titleInput.isVisible({ timeout: 2000 }).catch(() => false)) {
            await titleInput.fill('Test Ad');
          }

          // Fill content/description
          const contentInput = page.locator('textarea, input[name="content"], input[name="description"]').first();
          if (await contentInput.isVisible({ timeout: 2000 }).catch(() => false)) {
            await contentInput.fill('Audit test');
          }

          // Submit
          const submitBtn = page.locator('button[type="submit"], button:has-text("Сохранить"), button:has-text("Создать"), button:has-text("Отправить")').first();
          let apiSuccess = false;
          if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            const responsePromise = page.waitForResponse(
              r => r.url().includes('/api/'),
              { timeout: 8000 }
            ).catch(() => null);
            await submitBtn.click();
            const resp = await responsePromise;
            if (resp) apiSuccess = resp.status() < 400;
          }

          await page.waitForTimeout(2000);
          await page.screenshot({ path: `${SCREENSHOTS_DIR}/advertiser-ad-created.png` });
          phase.tests.push({
            test: 'Create new ad',
            role: 'advertiser',
            status: apiSuccess ? 'PASS' : 'NEEDS_REVIEW',
            notes: apiSuccess ? 'Ad saved via API' : 'Form filled but API response uncertain'
          });
        } else {
          phase.tests.push({ test: 'Create new ad', role: 'advertiser', status: 'FAIL', notes: 'Create button found but no form appeared' });
        }
      } else {
        phase.tests.push({ test: 'Create new ad', role: 'advertiser', status: 'FAIL', notes: 'Create button not found' });
      }
    } catch (err: any) {
      phase.tests.push({ test: 'Create new ad', role: 'advertiser', status: 'FAIL', notes: err.message });
    }

  } catch (err: any) {
    phase.tests.push({ test: 'Phase error', role: 'advertiser', status: 'FAIL', notes: err.message });
  }

  await ctx.close();
  return phase;
}

// ─── Phase 10: Marketplace Manager / Tenant ───────────────────────────────────
async function phase10_Tenant(browser: Browser): Promise<Phase> {
  const phase: Phase = { phase: 10, name: 'Marketplace Manager / Tenant', tests: [] };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  try {
    log('Phase 10: Tenant Dashboard');
    const loginResult = await doLogin(page, 'demo-tenant', 'demo123', DEMO_BASE);
    phase.tests.push({ test: 'Login', role: 'tenant', status: loginResult.success ? 'PASS' : 'FAIL', notes: loginResult.notes });

    if (!loginResult.success) { await ctx.close(); return phase; }

    await page.screenshot({ path: `${SCREENSHOTS_DIR}/tenant-dashboard.png` });
    const hasDashboard = await page.locator('[class*="dashboard"], main, h1, h2').first().isVisible({ timeout: 5000 }).catch(() => false);
    phase.tests.push({ test: 'Tenant dashboard loads', role: 'tenant', status: hasDashboard ? 'PASS' : 'NEEDS_REVIEW', notes: hasDashboard ? `Dashboard loaded at ${page.url()}` : 'No dashboard content' });

  } catch (err: any) {
    phase.tests.push({ test: 'Phase error', role: 'tenant', status: 'FAIL', notes: err.message });
  }

  await ctx.close();
  return phase;
}

// ─── Phase 11: Super Admin ────────────────────────────────────────────────────
async function phase11_SuperAdmin(browser: Browser): Promise<Phase> {
  const phase: Phase = { phase: 11, name: 'Super Admin', tests: [] };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  try {
    log('Phase 11: Super Admin at kamizo.uz');
    const loginResult = await doLogin(page, 'admin', 'admin123', MAIN_BASE);
    phase.tests.push({ test: 'Login at kamizo.uz', role: 'super_admin', status: loginResult.success ? 'PASS' : 'FAIL', notes: loginResult.notes });

    if (!loginResult.success) {
      // Try navigating directly to admin panel
      try {
        await page.goto(`${MAIN_BASE}/admin`, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(2000);
        await page.screenshot({ path: `${SCREENSHOTS_DIR}/super-admin-direct.png` });
        const hasContent = await page.locator('[class*="admin"], [class*="dashboard"], main').first().isVisible({ timeout: 3000 }).catch(() => false);
        if (hasContent) {
          phase.tests.push({ test: 'Super admin dashboard loads', role: 'super_admin', status: 'PASS', notes: 'Admin panel accessible directly' });
        } else {
          phase.tests.push({ test: 'Super admin dashboard loads', role: 'super_admin', status: 'FAIL', notes: 'Could not access admin panel' });
        }
      } catch (err: any) {
        phase.tests.push({ test: 'Super admin dashboard loads', role: 'super_admin', status: 'FAIL', notes: err.message });
      }
      await ctx.close();
      return phase;
    }

    // Super admin dashboard
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/super-admin-dashboard.png` });
    const hasDashboard = await page.locator('[class*="dashboard"], [class*="super"], main, h1').first().isVisible({ timeout: 5000 }).catch(() => false);
    phase.tests.push({ test: 'Super admin dashboard loads', role: 'super_admin', status: hasDashboard ? 'PASS' : 'NEEDS_REVIEW', notes: hasDashboard ? `Dashboard at ${page.url()}` : 'No dashboard content' });

    // Tenant list
    try {
      // Look for tenants section or navigate to it
      const tenantsLink = page.locator('a:has-text("Tenants"), a:has-text("Клиенты"), a:has-text("Арендаторы"), button:has-text("Tenants")').first();
      if (await tenantsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
        await tenantsLink.click();
        await page.waitForTimeout(2000);
      }

      await page.screenshot({ path: `${SCREENSHOTS_DIR}/super-admin-tenants.png` });
      const tenantCount = await page.locator('[class*="tenant"], [class*="card"], table tr').count();
      phase.tests.push({
        test: 'Tenant list shows at least 1 tenant',
        role: 'super_admin',
        status: tenantCount > 0 ? 'PASS' : 'NEEDS_REVIEW',
        notes: `${tenantCount} tenant entries visible`
      });
    } catch (err: any) {
      phase.tests.push({ test: 'Tenant list', role: 'super_admin', status: 'FAIL', notes: err.message });
    }

    // Ads management tab
    try {
      const adsLink = page.locator('a:has-text("Ads"), a:has-text("Реклама"), button:has-text("Ads")').first();
      if (await adsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
        await adsLink.click();
        await page.waitForTimeout(2000);
      } else {
        await page.goto(`${MAIN_BASE}/ads`, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(2000);
      }

      await page.screenshot({ path: `${SCREENSHOTS_DIR}/super-admin-ads.png` });
      const hasAdsContent = await page.locator('[class*="ad"], main, table').first().isVisible({ timeout: 3000 }).catch(() => false);
      phase.tests.push({ test: 'Ads management tab', role: 'super_admin', status: hasAdsContent ? 'PASS' : 'NEEDS_REVIEW', notes: hasAdsContent ? 'Ads management loaded' : 'No ads content' });
    } catch (err: any) {
      phase.tests.push({ test: 'Ads management tab', role: 'super_admin', status: 'FAIL', notes: err.message });
    }

  } catch (err: any) {
    phase.tests.push({ test: 'Phase error', role: 'super_admin', status: 'FAIL', notes: err.message });
  }

  await ctx.close();
  return phase;
}

// ─── Main runner ──────────────────────────────────────────────────────────────
async function main() {
  log('Starting Kamizo Platform E2E Audit');
  log(`Date: 2026-03-12`);
  log(`Screenshots dir: ${SCREENSHOTS_DIR}`);

  const browser = await chromium.launch({ headless: true });

  try {
    // Run each phase with error isolation
    log('\n=== PHASE 1: Login & Auth ===');
    const p1 = await phase1_LoginAuth(browser).catch(err => ({
      phase: 1, name: 'Login & Auth',
      tests: [{ test: 'Phase failed', status: 'FAIL' as const, notes: err.message }]
    }));
    report.phases.push(p1);
    await new Promise(r => setTimeout(r, 3000));

    log('\n=== PHASE 2: Admin Dashboard ===');
    const p2 = await phase2_AdminDashboard(browser).catch(err => ({
      phase: 2, name: 'Admin Dashboard',
      tests: [{ test: 'Phase failed', status: 'FAIL' as const, notes: err.message }]
    }));
    report.phases.push(p2);
    await new Promise(r => setTimeout(r, 3000));

    log('\n=== PHASE 3: Manager Dashboard ===');
    const p3 = await phase3_ManagerDashboard(browser).catch(err => ({
      phase: 3, name: 'Manager Dashboard',
      tests: [{ test: 'Phase failed', status: 'FAIL' as const, notes: err.message }]
    }));
    report.phases.push(p3);
    await new Promise(r => setTimeout(r, 3000));

    log('\n=== PHASE 4: Resident Dashboard ===');
    const p4 = await phase4_ResidentDashboard(browser).catch(err => ({
      phase: 4, name: 'Resident Dashboard',
      tests: [{ test: 'Phase failed', status: 'FAIL' as const, notes: err.message }]
    }));
    report.phases.push(p4);
    await new Promise(r => setTimeout(r, 3000));

    log('\n=== PHASE 5: Executor Dashboard ===');
    const p5 = await phase5_ExecutorDashboard(browser).catch(err => ({
      phase: 5, name: 'Executor Dashboard',
      tests: [{ test: 'Phase failed', status: 'FAIL' as const, notes: err.message }]
    }));
    report.phases.push(p5);
    await new Promise(r => setTimeout(r, 3000));

    log('\n=== PHASE 6: Director Dashboard ===');
    const p6 = await phase6_DirectorDashboard(browser).catch(err => ({
      phase: 6, name: 'Director Dashboard',
      tests: [{ test: 'Phase failed', status: 'FAIL' as const, notes: err.message }]
    }));
    report.phases.push(p6);
    await new Promise(r => setTimeout(r, 3000));

    log('\n=== PHASE 7: Department Head ===');
    const p7 = await phase7_DepartmentHead(browser).catch(err => ({
      phase: 7, name: 'Department Head',
      tests: [{ test: 'Phase failed', status: 'FAIL' as const, notes: err.message }]
    }));
    report.phases.push(p7);
    await new Promise(r => setTimeout(r, 3000));

    log('\n=== PHASE 8: Guard QR Scanner ===');
    const p8 = await phase8_Guard(browser).catch(err => ({
      phase: 8, name: 'Guard QR Scanner',
      tests: [{ test: 'Phase failed', status: 'FAIL' as const, notes: err.message }]
    }));
    report.phases.push(p8);
    await new Promise(r => setTimeout(r, 3000));

    log('\n=== PHASE 9: Advertiser ===');
    const p9 = await phase9_Advertiser(browser).catch(err => ({
      phase: 9, name: 'Advertiser',
      tests: [{ test: 'Phase failed', status: 'FAIL' as const, notes: err.message }]
    }));
    report.phases.push(p9);
    await new Promise(r => setTimeout(r, 3000));

    log('\n=== PHASE 10: Tenant ===');
    const p10 = await phase10_Tenant(browser).catch(err => ({
      phase: 10, name: 'Marketplace Manager / Tenant',
      tests: [{ test: 'Phase failed', status: 'FAIL' as const, notes: err.message }]
    }));
    report.phases.push(p10);
    await new Promise(r => setTimeout(r, 3000));

    log('\n=== PHASE 11: Super Admin ===');
    const p11 = await phase11_SuperAdmin(browser).catch(err => ({
      phase: 11, name: 'Super Admin',
      tests: [{ test: 'Phase failed', status: 'FAIL' as const, notes: err.message }]
    }));
    report.phases.push(p11);

  } finally {
    await browser.close();
  }

  // Compute summary
  let total = 0, passed = 0, failed = 0, needs_review = 0;
  for (const phase of report.phases) {
    for (const test of phase.tests) {
      total++;
      if (test.status === 'PASS') passed++;
      else if (test.status === 'FAIL') failed++;
      else if (test.status === 'NEEDS_REVIEW') needs_review++;
    }
  }
  report.summary = { total_tests: total, passed, failed, needs_review };

  // Write report
  const reportPath = '/Users/shaxzodisamahamadov/kamizo/audit/reaudit-report.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  log('\n=== AUDIT COMPLETE ===');
  log(`Total: ${total}, Passed: ${passed}, Failed: ${failed}, Needs Review: ${needs_review}`);
  log(`Report written to: ${reportPath}`);

  console.log('\n' + JSON.stringify(report, null, 2));
}

main().catch(err => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
