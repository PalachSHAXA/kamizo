import { chromium } from 'playwright';
import fs from 'fs';

const DEMO_BASE = 'https://demo.kamizo.uz';
const MAIN_BASE = 'https://kamizo.uz';
const SCREENSHOTS_DIR = '/Users/shaxzodisamahamadov/kamizo/audit/screenshots/reaudit';
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const report = {
  audit_date: '2026-03-12',
  phases: [],
  summary: {}
};

function log(msg) {
  console.log(`[AUDIT] ${msg}`);
}

// ─── Helper: login ────────────────────────────────────────────────────────────
async function doLogin(page, username, password, baseUrl) {
  try {
    await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Fill username
    const usernameInput = page.locator('input[type="text"], input[name="username"], input[name="login"]').first();
    await usernameInput.fill(username);

    // Fill password
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill(password);

    // Accept terms if needed (offer checkbox or link)
    try {
      const termsLinks = await page.locator('a, span').filter({ hasText: /оферт|oferta/i }).all();
      if (termsLinks.length > 0) {
        await termsLinks[0].click();
        await page.waitForTimeout(1500);
        // Scroll modal and accept
        try {
          const modal = page.locator('.overflow-y-auto, [class*="modal-body"], [class*="overflow-y"]').first();
          if (await modal.isVisible({ timeout: 1000 })) {
            await modal.evaluate(el => { el.scrollTop = el.scrollHeight; });
            await page.waitForTimeout(500);
          }
        } catch {}
        // Click accept button
        try {
          for (const btn of await page.locator('button').all()) {
            const t = (await btn.textContent() || '').trim();
            if ((t === 'Принять' || t === 'Qabul qilish') && await btn.isEnabled()) {
              await btn.click();
              await page.waitForTimeout(500);
              break;
            }
          }
        } catch {}
      }
    } catch {}

    // Check checkbox if present and unchecked
    try {
      const checkbox = page.locator('input[type="checkbox"]').first();
      if (await checkbox.isVisible({ timeout: 1000 })) {
        const checked = await checkbox.isChecked();
        if (!checked) {
          await checkbox.click();
          await page.waitForTimeout(300);
        }
      }
    } catch {}

    // Click login button
    let loginClicked = false;
    for (const btn of await page.locator('button').all()) {
      const t = (await btn.textContent() || '').trim();
      if (t === 'Войти' || t === 'Kirish' || t === 'Login') {
        await btn.click();
        loginClicked = true;
        break;
      }
    }
    if (!loginClicked) {
      const submitBtn = page.locator('button[type="submit"]').first();
      if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await submitBtn.click();
      }
    }

    await page.waitForTimeout(4000);

    // Check if logged in
    const currentUrl = page.url();
    const isLoggedIn = await page.locator('nav, [class*="sidebar"], [class*="layout"]').first().isVisible({ timeout: 3000 }).catch(() => false);
    const notOnLoginPage = !currentUrl.endsWith(baseUrl + '/') && currentUrl !== baseUrl;

    if (isLoggedIn || notOnLoginPage) {
      return { success: true, notes: `Logged in as ${username}, redirected to ${currentUrl.replace(baseUrl, '') || '/'}` };
    } else {
      const errorEl = await page.locator('[class*="error"], [class*="alert"], .text-red-500, [class*="text-red"]').first().textContent({ timeout: 2000 }).catch(() => '');
      return { success: false, notes: `Login failed. URL: ${currentUrl}. Error: ${errorEl.trim() || 'none'}` };
    }
  } catch (err) {
    return { success: false, notes: `Exception during login: ${err.message}` };
  }
}

// ─── Helper: check page for API errors ────────────────────────────────────────
async function checkPageForErrors(page) {
  const apiErrors = [];
  const handler = (response) => {
    if (response.url().includes('/api/') && response.status() >= 500) {
      apiErrors.push(`${response.status()} on ${response.url().split('/api/')[1]?.split('?')[0] || response.url()}`);
    }
  };
  page.on('response', handler);
  return { apiErrors, removeHandler: () => page.off('response', handler) };
}

// ─── Phase 1: Login & Auth ─────────────────────────────────────────────────────
async function phase1_LoginAuth(browser) {
  const phase = { phase: 1, name: 'Login & Auth', tests: [] };

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
    log(`  Testing login: ${r.role} (${r.username}) @ ${r.url}`);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    page.on('pageerror', () => {});

    try {
      const result = await doLogin(page, r.username, r.password, r.url);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/p1-login-${r.role}.png` }).catch(() => {});
      phase.tests.push({
        role: r.role,
        status: result.success ? 'PASS' : 'FAIL',
        notes: result.notes
      });
      log(`    ${r.role}: ${result.success ? 'PASS' : 'FAIL'} - ${result.notes}`);
    } catch (err) {
      phase.tests.push({ role: r.role, status: 'FAIL', notes: `Exception: ${err.message}` });
      log(`    ${r.role}: FAIL - ${err.message}`);
    }

    await ctx.close();
    await new Promise(r => setTimeout(r, 1500));
  }

  return phase;
}

// ─── Phase 2: Admin Dashboard ──────────────────────────────────────────────────
async function phase2_AdminDashboard(browser) {
  const phase = { phase: 2, name: 'Admin Dashboard', tests: [] };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', () => {});

  try {
    log('Phase 2: Admin Dashboard - logging in');
    const loginResult = await doLogin(page, 'demo-admin', 'demo123', DEMO_BASE);
    phase.tests.push({ test: 'Login', role: 'admin', status: loginResult.success ? 'PASS' : 'FAIL', notes: loginResult.notes });

    if (!loginResult.success) {
      await ctx.close();
      return phase;
    }

    await page.screenshot({ path: `${SCREENSHOTS_DIR}/p2-admin-overview.png` }).catch(() => {});

    const tabs = [
      { name: 'Overview', url: '/' },
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
        const apiErrors = [];
        const handler = (response) => {
          if (response.url().includes('/api/') && response.status() >= 500) {
            apiErrors.push(`${response.status()} ${response.url().split('/api/')[1]?.split('?')[0]}`);
          }
        };
        page.on('response', handler);

        await page.goto(`${DEMO_BASE}${tab.url}`, { waitUntil: 'networkidle', timeout: 20000 });
        await page.waitForTimeout(2000);
        page.off('response', handler);

        await page.screenshot({ path: `${SCREENSHOTS_DIR}/p2-admin-${tab.name.toLowerCase().replace(/\s+/g, '-')}.png` }).catch(() => {});

        const hasContent = await page.locator('main, table, [class*="card"], [class*="stat"], h1, h2').first().isVisible({ timeout: 3000 }).catch(() => false);

        if (apiErrors.length > 0) {
          phase.tests.push({ test: `Tab: ${tab.name}`, role: 'admin', status: 'FAIL', notes: `API 500 errors: ${apiErrors.join(', ')}` });
          log(`  Admin Tab ${tab.name}: FAIL - ${apiErrors.join(', ')}`);
        } else if (!hasContent) {
          phase.tests.push({ test: `Tab: ${tab.name}`, role: 'admin', status: 'NEEDS_REVIEW', notes: 'No visible content detected after load' });
          log(`  Admin Tab ${tab.name}: NEEDS_REVIEW - no content`);
        } else {
          phase.tests.push({ test: `Tab: ${tab.name}`, role: 'admin', status: 'PASS', notes: 'Tab loaded with visible content' });
          log(`  Admin Tab ${tab.name}: PASS`);
        }
      } catch (err) {
        phase.tests.push({ test: `Tab: ${tab.name}`, role: 'admin', status: 'FAIL', notes: `Error: ${err.message}` });
        log(`  Admin Tab ${tab.name}: FAIL - ${err.message}`);
      }
    }

    // Ads management tab (platform_ads)
    try {
      // Look for ads in sidebar
      await page.goto(`${DEMO_BASE}/`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(1000);

      // Check if there's a platform ads link/tab
      const adsLinks = await page.locator('a, button').filter({ hasText: /реклам|объявл|ads/i }).all();
      log(`  Found ${adsLinks.length} ads-related links`);

      if (adsLinks.length > 0) {
        await adsLinks[0].click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: `${SCREENSHOTS_DIR}/p2-admin-platform-ads.png` }).catch(() => {});
        const hasContent = await page.locator('main, [class*="ad"], [class*="card"]').first().isVisible({ timeout: 3000 }).catch(() => false);
        phase.tests.push({ test: 'Ads (platform_ads tab)', role: 'admin', status: hasContent ? 'PASS' : 'NEEDS_REVIEW', notes: `Current URL: ${page.url()}` });
      } else {
        phase.tests.push({ test: 'Ads (platform_ads tab)', role: 'admin', status: 'NEEDS_REVIEW', notes: 'No ads tab found in admin navigation; may be in a nested section' });
      }
    } catch (err) {
      phase.tests.push({ test: 'Ads (platform_ads tab)', role: 'admin', status: 'NEEDS_REVIEW', notes: `Could not test: ${err.message}` });
    }

  } catch (err) {
    phase.tests.push({ test: 'Phase error', status: 'FAIL', notes: `Phase exception: ${err.message}` });
  }

  await ctx.close();
  return phase;
}

// ─── Phase 3: Manager Dashboard ───────────────────────────────────────────────
async function phase3_ManagerDashboard(browser) {
  const phase = { phase: 3, name: 'Manager Dashboard', tests: [] };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', () => {});

  try {
    log('Phase 3: Manager Dashboard');
    const loginResult = await doLogin(page, 'demo-manager', 'demo123', DEMO_BASE);
    phase.tests.push({ test: 'Login', role: 'manager', status: loginResult.success ? 'PASS' : 'FAIL', notes: loginResult.notes });

    if (!loginResult.success) { await ctx.close(); return phase; }

    // Overview stats
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/p3-manager-overview.png` }).catch(() => {});
    const hasStats = await page.locator('[class*="stat"], [class*="card"], [class*="kpi"]').first().isVisible({ timeout: 5000 }).catch(() => false);
    phase.tests.push({ test: 'Overview stats load', role: 'manager', status: hasStats ? 'PASS' : 'NEEDS_REVIEW', notes: hasStats ? 'Stats/KPI cards visible' : 'No stat cards found' });
    log(`  Manager Overview: ${hasStats ? 'PASS' : 'NEEDS_REVIEW'}`);

    // Guest access
    try {
      const apiErrors = [];
      page.on('response', r => { if (r.url().includes('/api/') && r.status() >= 500) apiErrors.push(r.status()); });
      await page.goto(`${DEMO_BASE}/guest-access`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/p3-manager-guest-access.png` }).catch(() => {});
      const hasContent = await page.locator('main, table, [class*="card"], h1, h2').first().isVisible({ timeout: 3000 }).catch(() => false);
      phase.tests.push({ test: 'Guest access management', role: 'manager', status: (hasContent && apiErrors.length === 0) ? 'PASS' : (apiErrors.length > 0 ? 'FAIL' : 'NEEDS_REVIEW'), notes: hasContent ? `Page loaded (${apiErrors.length} API errors)` : 'No content found' });
      log(`  Manager Guest Access: ${hasContent ? 'content found' : 'no content'}`);
    } catch (err) {
      phase.tests.push({ test: 'Guest access management', role: 'manager', status: 'FAIL', notes: err.message });
    }

    // Rentals tab
    try {
      await page.goto(`${DEMO_BASE}/rentals`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/p3-manager-rentals.png` }).catch(() => {});
      const hasContent = await page.locator('main, table, [class*="card"], h1, h2').first().isVisible({ timeout: 3000 }).catch(() => false);
      phase.tests.push({ test: 'Rentals tab', role: 'manager', status: hasContent ? 'PASS' : 'NEEDS_REVIEW', notes: hasContent ? 'Rentals page loaded' : `No content found, URL: ${page.url()}` });
      log(`  Manager Rentals: ${hasContent ? 'PASS' : 'NEEDS_REVIEW'}`);
    } catch (err) {
      phase.tests.push({ test: 'Rentals tab', role: 'manager', status: 'FAIL', notes: err.message });
    }

    // Requests assignment
    try {
      await page.goto(`${DEMO_BASE}/requests`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/p3-manager-requests.png` }).catch(() => {});
      const hasContent = await page.locator('main, table, [class*="card"], [class*="request"]').first().isVisible({ timeout: 3000 }).catch(() => false);
      phase.tests.push({ test: 'Requests assignment', role: 'manager', status: hasContent ? 'PASS' : 'NEEDS_REVIEW', notes: hasContent ? 'Requests page loaded' : 'No content found' });
      log(`  Manager Requests: ${hasContent ? 'PASS' : 'NEEDS_REVIEW'}`);
    } catch (err) {
      phase.tests.push({ test: 'Requests assignment', role: 'manager', status: 'FAIL', notes: err.message });
    }

  } catch (err) {
    phase.tests.push({ test: 'Phase error', status: 'FAIL', notes: err.message });
  }

  await ctx.close();
  return phase;
}

// ─── Phase 4: Resident Dashboard ──────────────────────────────────────────────
async function phase4_ResidentDashboard(browser) {
  const phase = { phase: 4, name: 'Resident Dashboard', tests: [] };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', () => {});

  try {
    log('Phase 4: Resident Dashboard');
    const loginResult = await doLogin(page, 'demo-resident', 'demo123', DEMO_BASE);
    phase.tests.push({ test: 'Login', role: 'resident', status: loginResult.success ? 'PASS' : 'FAIL', notes: loginResult.notes });

    if (!loginResult.success) { await ctx.close(); return phase; }

    // Dashboard
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/p4-resident-dashboard.png` }).catch(() => {});
    const hasData = await page.locator('[class*="stat"], [class*="card"], h1, h2, [class*="dashboard"]').first().isVisible({ timeout: 5000 }).catch(() => false);
    phase.tests.push({ test: 'Dashboard loads with data', role: 'resident', status: hasData ? 'PASS' : 'NEEDS_REVIEW', notes: hasData ? 'Dashboard content visible' : 'No dashboard content' });
    log(`  Resident Dashboard: ${hasData ? 'PASS' : 'NEEDS_REVIEW'}`);

    // Submit service request
    try {
      await page.goto(`${DEMO_BASE}/requests`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/p4-resident-requests-page.png` }).catch(() => {});

      // Find create button
      let createClicked = false;
      for (const btn of await page.locator('button:visible').all()) {
        const text = (await btn.textContent() || '').trim();
        if (/создат|новая|заявк|подать|create|new|yangi/i.test(text)) {
          await btn.click();
          await page.waitForTimeout(2000);
          createClicked = true;
          log(`  Found create button: "${text}"`);
          break;
        }
      }
      if (!createClicked) {
        // Try plus icon buttons
        for (const btn of await page.locator('button').all()) {
          const html = await btn.innerHTML().catch(() => '');
          if (/plus|add/i.test(html) || html.includes('M12 5v14') || html.includes('M5 12h14')) {
            const visible = await btn.isVisible().catch(() => false);
            if (visible) {
              await btn.click();
              await page.waitForTimeout(2000);
              createClicked = true;
              break;
            }
          }
        }
      }

      await page.screenshot({ path: `${SCREENSHOTS_DIR}/p4-resident-create-form.png` }).catch(() => {});

      if (createClicked) {
        const formVisible = await page.locator('form, [role="dialog"], [class*="modal"], [class*="dialog"]').first().isVisible({ timeout: 3000 }).catch(() => false);
        log(`  Create request form visible: ${formVisible}`);

        if (formVisible) {
          // Try to select type
          try {
            const selects = await page.locator('select').all();
            for (const s of selects) {
              if (await s.isVisible().catch(() => false)) {
                // Try to find plumbing/санте option
                const options = await s.locator('option').all();
                for (const opt of options) {
                  const val = (await opt.textContent() || '').toLowerCase();
                  if (/сантех|plumb|water|водо/i.test(val)) {
                    await s.selectOption({ label: await opt.textContent() });
                    break;
                  }
                }
                // If not found, just select index 1
                await s.selectOption({ index: 1 }).catch(() => {});
                break;
              }
            }
          } catch {}

          // Fill description
          try {
            const textarea = page.locator('textarea').first();
            if (await textarea.isVisible({ timeout: 2000 }).catch(() => false)) {
              await textarea.fill('Test audit request');
            } else {
              // Try input
              const inputs = await page.locator('input[type="text"]:visible').all();
              for (const inp of inputs) {
                const ph = await inp.getAttribute('placeholder') || '';
                if (/описан|comment|дескрипц|detail/i.test(ph) || inputs.indexOf(inp) > 0) {
                  await inp.fill('Test audit request');
                  break;
                }
              }
            }
          } catch {}

          // Submit
          let apiStatus = null;
          try {
            const responsePromise = Promise.race([
              page.waitForResponse(r => r.url().includes('/api/') && ['POST', 'PUT'].includes(r.request().method()), { timeout: 8000 }),
              new Promise(r => setTimeout(() => r(null), 8000))
            ]);

            const submitBtn = page.locator('button[type="submit"], button:has-text("Отправить"), button:has-text("Создать"), button:has-text("Сохранить"), button:has-text("Yuborish")').first();
            if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
              await submitBtn.click();
              const resp = await responsePromise;
              if (resp && resp.status) apiStatus = resp.status();
            }
          } catch {}

          await page.waitForTimeout(2000);
          await page.screenshot({ path: `${SCREENSHOTS_DIR}/p4-resident-request-submitted.png` }).catch(() => {});

          phase.tests.push({
            test: 'Submit service request (plumbing, "Test audit request")',
            role: 'resident',
            status: apiStatus !== null ? (apiStatus < 400 ? 'PASS' : 'FAIL') : 'NEEDS_REVIEW',
            notes: apiStatus !== null ? `API responded with ${apiStatus}` : 'Form filled and submitted, but could not confirm API response'
          });
          log(`  Submit request: ${apiStatus !== null ? apiStatus : 'no api captured'}`);
        } else {
          phase.tests.push({ test: 'Submit service request', role: 'resident', status: 'FAIL', notes: 'Create button clicked but no form appeared' });
        }
      } else {
        phase.tests.push({ test: 'Submit service request', role: 'resident', status: 'FAIL', notes: 'Could not find create request button' });
      }

      // Verify request in list
      await page.goto(`${DEMO_BASE}/requests`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      const requestCount = await page.locator('[class*="card"], [class*="request-item"], tr').count();
      phase.tests.push({ test: 'Request appears in list', role: 'resident', status: requestCount > 0 ? 'PASS' : 'NEEDS_REVIEW', notes: `${requestCount} request list items visible` });
      log(`  Request list count: ${requestCount}`);
    } catch (err) {
      phase.tests.push({ test: 'Submit service request', role: 'resident', status: 'FAIL', notes: err.message });
      log(`  Submit request error: ${err.message}`);
    }

    // Announcements
    try {
      await page.goto(`${DEMO_BASE}/announcements`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/p4-resident-announcements.png` }).catch(() => {});
      const count = await page.locator('[class*="card"], [class*="announcement"], article, li').count();
      phase.tests.push({ test: 'Announcements - at least 1 visible', role: 'resident', status: count > 0 ? 'PASS' : 'FAIL', notes: `${count} announcement-like elements visible` });
      log(`  Resident Announcements: ${count} items`);
    } catch (err) {
      phase.tests.push({ test: 'Announcements', role: 'resident', status: 'FAIL', notes: err.message });
    }

    // Vehicles tab
    try {
      await page.goto(`${DEMO_BASE}/vehicles`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/p4-resident-vehicles.png` }).catch(() => {});
      const hasContent = await page.locator('main, [class*="card"], h1, h2').first().isVisible({ timeout: 3000 }).catch(() => false);
      phase.tests.push({ test: 'Vehicles tab', role: 'resident', status: hasContent ? 'PASS' : 'NEEDS_REVIEW', notes: hasContent ? 'Vehicles page loaded' : `No content, URL: ${page.url()}` });
      log(`  Resident Vehicles: ${hasContent ? 'PASS' : 'NEEDS_REVIEW'}`);
    } catch (err) {
      phase.tests.push({ test: 'Vehicles tab', role: 'resident', status: 'FAIL', notes: err.message });
    }

    // Guest access - create guest pass
    try {
      await page.goto(`${DEMO_BASE}/guest-access`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/p4-resident-guest-access.png` }).catch(() => {});

      let createFound = false;
      for (const btn of await page.locator('button:visible').all()) {
        const text = (await btn.textContent() || '').trim();
        if (/создат|пригласи|invite|новый|create|qo'sh/i.test(text)) {
          await btn.click();
          await page.waitForTimeout(2000);
          createFound = true;
          break;
        }
      }

      const formVisible = await page.locator('form, [role="dialog"], [class*="modal"]').first().isVisible({ timeout: 2000 }).catch(() => false);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/p4-resident-guest-create-form.png` }).catch(() => {});
      phase.tests.push({
        test: 'Guest access - create guest pass',
        role: 'resident',
        status: createFound && formVisible ? 'PASS' : createFound ? 'NEEDS_REVIEW' : 'FAIL',
        notes: createFound ? (formVisible ? 'Create form opened successfully' : 'Button clicked but form not detected') : 'Create button not found on guest access page'
      });
      if (formVisible) await page.keyboard.press('Escape').catch(() => {});
      log(`  Guest access create: found=${createFound}, form=${formVisible}`);
    } catch (err) {
      phase.tests.push({ test: 'Guest access - create guest pass', role: 'resident', status: 'FAIL', notes: err.message });
    }

    // Marketplace
    try {
      await page.goto(`${DEMO_BASE}/marketplace`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/p4-resident-marketplace.png` }).catch(() => {});
      const productCards = await page.locator('[class*="product"], [class*="item"], [class*="card"]').count();
      phase.tests.push({ test: 'Marketplace - browse products', role: 'resident', status: productCards > 0 ? 'PASS' : 'NEEDS_REVIEW', notes: `${productCards} product/card elements visible` });
      log(`  Marketplace products: ${productCards}`);

      // Add to cart
      const addBtns = await page.locator('button').filter({ hasText: /корзин|добав|Savatga|cart|add/i }).all();
      if (addBtns.length > 0) {
        await addBtns[0].click();
        await page.waitForTimeout(1500);
        await page.screenshot({ path: `${SCREENSHOTS_DIR}/p4-resident-marketplace-addcart.png` }).catch(() => {});
        phase.tests.push({ test: 'Marketplace - add to cart', role: 'resident', status: 'PASS', notes: 'Add to cart button clicked' });
        log('  Add to cart: PASS');
      } else {
        phase.tests.push({ test: 'Marketplace - add to cart', role: 'resident', status: 'NEEDS_REVIEW', notes: 'No add-to-cart button found (products may have no items or different layout)' });
        log('  Add to cart: no button found');
      }

      // Place order
      const checkoutBtns = await page.locator('button').filter({ hasText: /оформ|checkout|заказ|buyurtma/i }).all();
      const cartLinks = await page.locator('[class*="cart"], [href*="cart"]').all();
      if (checkoutBtns.length > 0) {
        await checkoutBtns[0].click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: `${SCREENSHOTS_DIR}/p4-resident-marketplace-order.png` }).catch(() => {});
        phase.tests.push({ test: 'Marketplace - place order', role: 'resident', status: 'PASS', notes: 'Checkout/order button clicked' });
      } else if (cartLinks.length > 0) {
        phase.tests.push({ test: 'Marketplace - place order', role: 'resident', status: 'NEEDS_REVIEW', notes: 'Cart link found but no checkout button; cart may be empty' });
      } else {
        phase.tests.push({ test: 'Marketplace - place order', role: 'resident', status: 'NEEDS_REVIEW', notes: 'No checkout button found' });
      }
    } catch (err) {
      phase.tests.push({ test: 'Marketplace', role: 'resident', status: 'FAIL', notes: err.message });
    }

    // Meetings tab
    try {
      await page.goto(`${DEMO_BASE}/meetings`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/p4-resident-meetings.png` }).catch(() => {});
      const hasContent = await page.locator('main, [class*="card"], h1, h2').first().isVisible({ timeout: 3000 }).catch(() => false);
      phase.tests.push({ test: 'Meetings tab', role: 'resident', status: hasContent ? 'PASS' : 'NEEDS_REVIEW', notes: hasContent ? 'Meetings page loaded' : 'No content' });
      log(`  Meetings: ${hasContent ? 'PASS' : 'NEEDS_REVIEW'}`);
    } catch (err) {
      phase.tests.push({ test: 'Meetings tab', role: 'resident', status: 'FAIL', notes: err.message });
    }

  } catch (err) {
    phase.tests.push({ test: 'Phase error', status: 'FAIL', notes: err.message });
  }

  await ctx.close();
  return phase;
}

// ─── Phase 5: Executor Dashboard ──────────────────────────────────────────────
async function phase5_ExecutorDashboard(browser) {
  const phase = { phase: 5, name: 'Executor Dashboard', tests: [] };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', () => {});

  try {
    log('Phase 5: Executor Dashboard');
    const loginResult = await doLogin(page, 'demo-executor', 'demo123', DEMO_BASE);
    phase.tests.push({ test: 'Login', role: 'executor', status: loginResult.success ? 'PASS' : 'FAIL', notes: loginResult.notes });

    if (!loginResult.success) { await ctx.close(); return phase; }

    // Check pending requests
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/p5-executor-dashboard.png` }).catch(() => {});
    const requestItems = await page.locator('[class*="request"], [class*="card"], [class*="task"]').count();
    phase.tests.push({ test: 'Pending requests visible', role: 'executor', status: requestItems > 0 ? 'PASS' : 'NEEDS_REVIEW', notes: `${requestItems} request/card/task elements visible` });
    log(`  Executor requests visible: ${requestItems}`);

    // Accept a request
    try {
      const acceptBtns = await page.locator('button').filter({ hasText: /принят|accept|в работу|qabul|начат/i }).all();
      log(`  Found ${acceptBtns.length} accept-like buttons`);
      if (acceptBtns.length > 0) {
        const responseCapture = [];
        const handler = r => {
          if (r.url().includes('/api/') && ['PUT', 'PATCH', 'POST'].includes(r.request().method())) {
            responseCapture.push({ status: r.status(), url: r.url() });
          }
        };
        page.on('response', handler);
        await acceptBtns[0].click();
        await page.waitForTimeout(3000);
        page.off('response', handler);
        await page.screenshot({ path: `${SCREENSHOTS_DIR}/p5-executor-accepted.png` }).catch(() => {});
        const apiResp = responseCapture[0];
        phase.tests.push({ test: 'Accept request (in_progress)', role: 'executor', status: apiResp ? (apiResp.status < 400 ? 'PASS' : 'FAIL') : 'NEEDS_REVIEW', notes: apiResp ? `API ${apiResp.status} on ${apiResp.url.split('/api/')[1]?.split('?')[0]}` : 'Accept button clicked, no API response captured' });
        log(`  Accept request: ${apiResp ? apiResp.status : 'no api'}`);
      } else {
        // Try clicking a request card first
        const cards = await page.locator('[class*="cursor-pointer"], [class*="card"]').all();
        for (const card of cards) {
          const box = await card.boundingBox().catch(() => null);
          if (!box || box.width < 200) continue;
          await card.click().catch(() => {});
          await page.waitForTimeout(1500);
          const modal = await page.locator('[role="dialog"], [class*="modal"]').first().isVisible({ timeout: 1000 }).catch(() => false);
          if (modal) {
            const acceptInModal = page.locator('button').filter({ hasText: /принят|accept|в работу|qabul/i }).first();
            if (await acceptInModal.isVisible({ timeout: 1000 }).catch(() => false)) {
              await acceptInModal.click();
              await page.waitForTimeout(2000);
              phase.tests.push({ test: 'Accept request (in_progress)', role: 'executor', status: 'PASS', notes: 'Accept clicked in request detail modal' });
              break;
            }
            await page.keyboard.press('Escape').catch(() => {});
            break;
          }
        }
        if (!phase.tests.find(t => t.test === 'Accept request (in_progress)')) {
          phase.tests.push({ test: 'Accept request (in_progress)', role: 'executor', status: 'NEEDS_REVIEW', notes: 'No accept button found; may need pending requests to be present' });
        }
      }
    } catch (err) {
      phase.tests.push({ test: 'Accept request (in_progress)', role: 'executor', status: 'FAIL', notes: err.message });
    }

    // Complete a request
    try {
      await page.goto(`${DEMO_BASE}/`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      const completeBtns = await page.locator('button').filter({ hasText: /заверш|выполн|complete|done|tugall/i }).all();
      if (completeBtns.length > 0) {
        await completeBtns[0].click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: `${SCREENSHOTS_DIR}/p5-executor-completed.png` }).catch(() => {});
        phase.tests.push({ test: 'Complete request', role: 'executor', status: 'PASS', notes: 'Complete button found and clicked' });
      } else {
        phase.tests.push({ test: 'Complete request', role: 'executor', status: 'NEEDS_REVIEW', notes: 'No complete button found; requires an in_progress request' });
      }
    } catch (err) {
      phase.tests.push({ test: 'Complete request', role: 'executor', status: 'FAIL', notes: err.message });
    }

    // Schedule page
    try {
      await page.goto(`${DEMO_BASE}/schedule`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/p5-executor-schedule.png` }).catch(() => {});
      const hasContent = await page.locator('main, [class*="schedule"], [class*="calendar"], h1, h2').first().isVisible({ timeout: 3000 }).catch(() => false);
      phase.tests.push({ test: 'Schedule page', role: 'executor', status: hasContent ? 'PASS' : 'NEEDS_REVIEW', notes: hasContent ? 'Schedule page loaded' : `No content, URL: ${page.url()}` });
      log(`  Executor Schedule: ${hasContent ? 'PASS' : 'NEEDS_REVIEW'}`);
    } catch (err) {
      phase.tests.push({ test: 'Schedule page', role: 'executor', status: 'FAIL', notes: err.message });
    }

    // Announcements
    try {
      await page.goto(`${DEMO_BASE}/announcements`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/p5-executor-announcements.png` }).catch(() => {});
      const hasContent = await page.locator('main, [class*="card"], h1, h2').first().isVisible({ timeout: 3000 }).catch(() => false);
      phase.tests.push({ test: 'Announcements', role: 'executor', status: hasContent ? 'PASS' : 'NEEDS_REVIEW', notes: hasContent ? 'Announcements loaded' : 'No content' });
      log(`  Executor Announcements: ${hasContent ? 'PASS' : 'NEEDS_REVIEW'}`);
    } catch (err) {
      phase.tests.push({ test: 'Announcements', role: 'executor', status: 'FAIL', notes: err.message });
    }

  } catch (err) {
    phase.tests.push({ test: 'Phase error', status: 'FAIL', notes: err.message });
  }

  await ctx.close();
  return phase;
}

// ─── Phase 6: Director Dashboard ──────────────────────────────────────────────
async function phase6_DirectorDashboard(browser) {
  const phase = { phase: 6, name: 'Director Dashboard', tests: [] };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', () => {});

  try {
    log('Phase 6: Director Dashboard');
    const loginResult = await doLogin(page, 'demo-director', 'demo123', DEMO_BASE);
    phase.tests.push({ test: 'Login', role: 'director', status: loginResult.success ? 'PASS' : 'FAIL', notes: loginResult.notes });

    if (!loginResult.success) { await ctx.close(); return phase; }

    // Stats and charts
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/p6-director-dashboard.png` }).catch(() => {});
    const hasStats = await page.locator('[class*="stat"], [class*="card"], canvas, [class*="chart"]').first().isVisible({ timeout: 5000 }).catch(() => false);
    phase.tests.push({ test: 'Stats and charts', role: 'director', status: hasStats ? 'PASS' : 'NEEDS_REVIEW', notes: hasStats ? 'Stats/charts visible on dashboard' : 'No stats/charts found' });
    log(`  Director stats: ${hasStats ? 'PASS' : 'NEEDS_REVIEW'}`);

    // Team management
    try {
      await page.goto(`${DEMO_BASE}/team`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/p6-director-team.png` }).catch(() => {});
      const hasContent = await page.locator('main, table, [class*="card"], h1, h2').first().isVisible({ timeout: 3000 }).catch(() => false);
      phase.tests.push({ test: 'Team management tab', role: 'director', status: hasContent ? 'PASS' : 'NEEDS_REVIEW', notes: hasContent ? 'Team page loaded' : `No content, URL: ${page.url()}` });
      log(`  Director Team: ${hasContent ? 'PASS' : 'NEEDS_REVIEW'}`);
    } catch (err) {
      phase.tests.push({ test: 'Team management tab', role: 'director', status: 'FAIL', notes: err.message });
    }

    // Executors tab
    try {
      await page.goto(`${DEMO_BASE}/executors`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/p6-director-executors.png` }).catch(() => {});
      const hasContent = await page.locator('main, table, [class*="card"], h1, h2').first().isVisible({ timeout: 3000 }).catch(() => false);
      phase.tests.push({ test: 'Executors tab', role: 'director', status: hasContent ? 'PASS' : 'NEEDS_REVIEW', notes: hasContent ? 'Executors page loaded' : `No content, URL: ${page.url()}` });
      log(`  Director Executors: ${hasContent ? 'PASS' : 'NEEDS_REVIEW'}`);
    } catch (err) {
      phase.tests.push({ test: 'Executors tab', role: 'director', status: 'FAIL', notes: err.message });
    }

  } catch (err) {
    phase.tests.push({ test: 'Phase error', status: 'FAIL', notes: err.message });
  }

  await ctx.close();
  return phase;
}

// ─── Phase 7: Department Head ──────────────────────────────────────────────────
async function phase7_DepartmentHead(browser) {
  const phase = { phase: 7, name: 'Department Head', tests: [] };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', () => {});

  try {
    log('Phase 7: Department Head');
    const loginResult = await doLogin(page, 'demo-head', 'demo123', DEMO_BASE);
    phase.tests.push({ test: 'Login', role: 'department_head', status: loginResult.success ? 'PASS' : 'FAIL', notes: loginResult.notes });

    if (!loginResult.success) { await ctx.close(); return phase; }

    await page.screenshot({ path: `${SCREENSHOTS_DIR}/p7-dept-head-dashboard.png` }).catch(() => {});
    const hasDashboard = await page.locator('[class*="dashboard"], [class*="card"], main, h1').first().isVisible({ timeout: 5000 }).catch(() => false);
    phase.tests.push({ test: 'Dashboard loads', role: 'department_head', status: hasDashboard ? 'PASS' : 'NEEDS_REVIEW', notes: hasDashboard ? `Dashboard at ${page.url()}` : 'No content' });
    log(`  Dept Head Dashboard: ${hasDashboard ? 'PASS' : 'NEEDS_REVIEW'}`);

    // Requests visible
    try {
      await page.goto(`${DEMO_BASE}/requests`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/p7-dept-head-requests.png` }).catch(() => {});
      const hasRequests = await page.locator('main, [class*="card"], table, [class*="request"]').first().isVisible({ timeout: 3000 }).catch(() => false);
      phase.tests.push({ test: 'Requests visible', role: 'department_head', status: hasRequests ? 'PASS' : 'NEEDS_REVIEW', notes: hasRequests ? 'Requests page loaded' : `No content, URL: ${page.url()}` });
      log(`  Dept Head Requests: ${hasRequests ? 'PASS' : 'NEEDS_REVIEW'}`);
    } catch (err) {
      phase.tests.push({ test: 'Requests visible', role: 'department_head', status: 'FAIL', notes: err.message });
    }

  } catch (err) {
    phase.tests.push({ test: 'Phase error', status: 'FAIL', notes: err.message });
  }

  await ctx.close();
  return phase;
}

// ─── Phase 8: Guard QR Scanner ────────────────────────────────────────────────
async function phase8_Guard(browser) {
  const phase = { phase: 8, name: 'Guard QR Scanner', tests: [] };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', () => {});

  try {
    log('Phase 8: Guard');
    const loginResult = await doLogin(page, 'demo-guard', 'demo123', DEMO_BASE);
    phase.tests.push({ test: 'Login', role: 'guard', status: loginResult.success ? 'PASS' : 'FAIL', notes: loginResult.notes });

    if (!loginResult.success) { await ctx.close(); return phase; }

    await page.screenshot({ path: `${SCREENSHOTS_DIR}/p8-guard-dashboard.png` }).catch(() => {});

    // QR Scanner page - try different possible routes
    for (const url of ['/qr-scanner', '/scanner', '/guard', '/guest-access']) {
      try {
        await page.goto(`${DEMO_BASE}${url}`, { waitUntil: 'networkidle', timeout: 12000 });
        await page.waitForTimeout(2000);
        const currentUrl = page.url();
        const hasContent = await page.locator('main, [class*="scanner"], [class*="qr"], [class*="camera"], h1, h2').first().isVisible({ timeout: 3000 }).catch(() => false);
        if (hasContent) {
          await page.screenshot({ path: `${SCREENSHOTS_DIR}/p8-guard-qr-scanner.png` }).catch(() => {});
          phase.tests.push({ test: 'QR scanner page loads', role: 'guard', status: 'PASS', notes: `QR scanner found at ${url}, URL: ${currentUrl}` });
          log(`  Guard QR scanner at ${url}: PASS`);
          break;
        }
        if (url === '/guest-access') {
          await page.screenshot({ path: `${SCREENSHOTS_DIR}/p8-guard-qr-scanner.png` }).catch(() => {});
          phase.tests.push({ test: 'QR scanner page loads', role: 'guard', status: 'NEEDS_REVIEW', notes: `Tried /qr-scanner, /scanner, /guard, /guest-access — landed at ${currentUrl}` });
        }
      } catch {}
    }
    if (!phase.tests.find(t => t.test === 'QR scanner page loads')) {
      phase.tests.push({ test: 'QR scanner page loads', role: 'guard', status: 'NEEDS_REVIEW', notes: 'Could not determine QR scanner URL' });
    }

    // Vehicle search
    try {
      await page.goto(`${DEMO_BASE}/vehicle-search`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/p8-guard-vehicle-search.png` }).catch(() => {});
      const hasContent = await page.locator('main, input, h1, h2').first().isVisible({ timeout: 3000 }).catch(() => false);
      phase.tests.push({ test: 'Vehicle search loads', role: 'guard', status: hasContent ? 'PASS' : 'NEEDS_REVIEW', notes: hasContent ? 'Vehicle search page loaded' : `No content, URL: ${page.url()}` });
      log(`  Guard Vehicle Search: ${hasContent ? 'PASS' : 'NEEDS_REVIEW'}`);
    } catch (err) {
      phase.tests.push({ test: 'Vehicle search loads', role: 'guard', status: 'FAIL', notes: err.message });
    }

  } catch (err) {
    phase.tests.push({ test: 'Phase error', status: 'FAIL', notes: err.message });
  }

  await ctx.close();
  return phase;
}

// ─── Phase 9: Advertiser ──────────────────────────────────────────────────────
async function phase9_Advertiser(browser) {
  const phase = { phase: 9, name: 'Advertiser', tests: [] };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', () => {});

  try {
    log('Phase 9: Advertiser');
    const loginResult = await doLogin(page, 'demo-advertiser', 'demo123', DEMO_BASE);
    phase.tests.push({ test: 'Login', role: 'advertiser', status: loginResult.success ? 'PASS' : 'FAIL', notes: loginResult.notes });

    if (!loginResult.success) { await ctx.close(); return phase; }

    await page.screenshot({ path: `${SCREENSHOTS_DIR}/p9-advertiser-dashboard.png` }).catch(() => {});
    const hasDashboard = await page.locator('[class*="dashboard"], [class*="ad"], main, h1, h2').first().isVisible({ timeout: 5000 }).catch(() => false);
    phase.tests.push({ test: 'Advertiser dashboard loads', role: 'advertiser', status: hasDashboard ? 'PASS' : 'NEEDS_REVIEW', notes: hasDashboard ? `Dashboard at ${page.url()}` : 'No content' });
    log(`  Advertiser Dashboard: ${hasDashboard ? 'PASS' : 'NEEDS_REVIEW'}`);

    // Create new ad
    try {
      let createClicked = false;
      // Look for create button
      for (const btn of await page.locator('button:visible').all()) {
        const text = (await btn.textContent() || '').trim();
        if (/создат|новое|объяв|create|new|add|добав/i.test(text)) {
          await btn.click();
          await page.waitForTimeout(2000);
          createClicked = true;
          log(`  Advertiser create button found: "${text}"`);
          break;
        }
      }
      if (!createClicked) {
        // Look for + icon buttons
        for (const btn of await page.locator('button').all()) {
          const html = await btn.innerHTML().catch(() => '');
          const isVisible = await btn.isVisible().catch(() => false);
          if (isVisible && (html.includes('M12 5v14') || html.includes('M5 12h14') || html.includes('plus') || html.includes('Plus'))) {
            await btn.click();
            await page.waitForTimeout(2000);
            createClicked = true;
            break;
          }
        }
      }

      await page.screenshot({ path: `${SCREENSHOTS_DIR}/p9-advertiser-create-form.png` }).catch(() => {});
      const formVisible = await page.locator('form, [role="dialog"], [class*="modal"]').first().isVisible({ timeout: 3000 }).catch(() => false);
      log(`  Advertiser create clicked: ${createClicked}, form: ${formVisible}`);

      if (createClicked && formVisible) {
        // Fill title
        const titleInputs = await page.locator('input[type="text"]:visible').all();
        if (titleInputs.length > 0) {
          await titleInputs[0].fill('Test Ad');
        }

        // Fill content
        const textarea = page.locator('textarea').first();
        if (await textarea.isVisible({ timeout: 1000 }).catch(() => false)) {
          await textarea.fill('Audit test');
        } else if (titleInputs.length > 1) {
          await titleInputs[1].fill('Audit test');
        }

        // Submit
        let apiStatus = null;
        const submitBtn = page.locator('button[type="submit"], button:has-text("Сохранить"), button:has-text("Создать"), button:has-text("Отправить"), button:has-text("Опубликовать")').first();
        if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          const responseCapture = [];
          const handler = r => { if (r.url().includes('/api/')) responseCapture.push(r.status()); };
          page.on('response', handler);
          await submitBtn.click();
          await page.waitForTimeout(3000);
          page.off('response', handler);
          if (responseCapture.length > 0) apiStatus = responseCapture[responseCapture.length - 1];
        }

        await page.screenshot({ path: `${SCREENSHOTS_DIR}/p9-advertiser-ad-saved.png` }).catch(() => {});
        phase.tests.push({
          test: 'Create new ad (title: "Test Ad", content: "Audit test")',
          role: 'advertiser',
          status: apiStatus !== null ? (apiStatus < 400 ? 'PASS' : 'FAIL') : 'NEEDS_REVIEW',
          notes: apiStatus !== null ? `Ad creation API responded with ${apiStatus}` : 'Form submitted but no API response captured'
        });
      } else if (createClicked) {
        phase.tests.push({ test: 'Create new ad', role: 'advertiser', status: 'FAIL', notes: 'Create button clicked but no form appeared' });
      } else {
        phase.tests.push({ test: 'Create new ad', role: 'advertiser', status: 'FAIL', notes: 'No create button found on advertiser dashboard' });
      }
    } catch (err) {
      phase.tests.push({ test: 'Create new ad', role: 'advertiser', status: 'FAIL', notes: err.message });
    }

  } catch (err) {
    phase.tests.push({ test: 'Phase error', status: 'FAIL', notes: err.message });
  }

  await ctx.close();
  return phase;
}

// ─── Phase 10: Tenant ─────────────────────────────────────────────────────────
async function phase10_Tenant(browser) {
  const phase = { phase: 10, name: 'Marketplace Manager / Tenant', tests: [] };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', () => {});

  try {
    log('Phase 10: Tenant Dashboard');
    const loginResult = await doLogin(page, 'demo-tenant', 'demo123', DEMO_BASE);
    phase.tests.push({ test: 'Login', role: 'tenant', status: loginResult.success ? 'PASS' : 'FAIL', notes: loginResult.notes });

    if (!loginResult.success) { await ctx.close(); return phase; }

    await page.screenshot({ path: `${SCREENSHOTS_DIR}/p10-tenant-dashboard.png` }).catch(() => {});
    const hasDashboard = await page.locator('[class*="dashboard"], main, h1, h2').first().isVisible({ timeout: 5000 }).catch(() => false);
    const currentUrl = page.url();
    phase.tests.push({ test: 'Tenant dashboard loads', role: 'tenant', status: hasDashboard ? 'PASS' : 'NEEDS_REVIEW', notes: hasDashboard ? `Dashboard loaded at ${currentUrl.replace(DEMO_BASE, '')}` : `No content, URL: ${currentUrl}` });
    log(`  Tenant Dashboard: ${hasDashboard ? 'PASS' : 'NEEDS_REVIEW'} at ${currentUrl}`);

  } catch (err) {
    phase.tests.push({ test: 'Phase error', status: 'FAIL', notes: err.message });
  }

  await ctx.close();
  return phase;
}

// ─── Phase 11: Super Admin ────────────────────────────────────────────────────
async function phase11_SuperAdmin(browser) {
  const phase = { phase: 11, name: 'Super Admin', tests: [] };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', () => {});

  try {
    log('Phase 11: Super Admin at kamizo.uz');
    const loginResult = await doLogin(page, 'admin', 'admin123', MAIN_BASE);
    phase.tests.push({ test: 'Login at kamizo.uz', role: 'super_admin', status: loginResult.success ? 'PASS' : 'FAIL', notes: loginResult.notes });

    if (!loginResult.success) {
      // Take screenshot of failure state
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/p11-super-admin-login-fail.png` }).catch(() => {});
      await ctx.close();
      return phase;
    }

    // Super admin dashboard
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/p11-super-admin-dashboard.png` }).catch(() => {});
    const hasDashboard = await page.locator('[class*="super"], [class*="admin"], [class*="dashboard"], main, h1').first().isVisible({ timeout: 5000 }).catch(() => false);
    phase.tests.push({ test: 'Super admin dashboard loads', role: 'super_admin', status: hasDashboard ? 'PASS' : 'NEEDS_REVIEW', notes: hasDashboard ? `Dashboard at ${page.url().replace(MAIN_BASE, '')}` : 'No dashboard content visible' });
    log(`  Super Admin Dashboard: ${hasDashboard ? 'PASS' : 'NEEDS_REVIEW'}`);

    // Tenant list
    try {
      // Navigate to tenants section
      let tenantNavFound = false;
      for (const link of await page.locator('a, button').all()) {
        const text = (await link.textContent() || '').trim();
        if (/tenant|клиент|арендатор|компани/i.test(text) && await link.isVisible().catch(() => false)) {
          await link.click();
          await page.waitForTimeout(2000);
          tenantNavFound = true;
          break;
        }
      }

      await page.screenshot({ path: `${SCREENSHOTS_DIR}/p11-super-admin-tenants.png` }).catch(() => {});
      const tenantItems = await page.locator('[class*="tenant"], [class*="company"], table tr, [class*="card"]').count();
      phase.tests.push({
        test: 'Tenant list shows at least 1 tenant',
        role: 'super_admin',
        status: tenantItems > 0 ? 'PASS' : 'NEEDS_REVIEW',
        notes: `${tenantItems} tenant/card/row elements visible${tenantNavFound ? ' (navigated to tenant section)' : ' (on dashboard)'}`
      });
      log(`  Super Admin Tenants: ${tenantItems} items`);
    } catch (err) {
      phase.tests.push({ test: 'Tenant list', role: 'super_admin', status: 'FAIL', notes: err.message });
    }

    // Ads management tab
    try {
      let adsNavFound = false;
      for (const link of await page.locator('a, button').all()) {
        const text = (await link.textContent() || '').trim();
        if (/реклам|объявл|ads/i.test(text) && await link.isVisible().catch(() => false)) {
          await link.click();
          await page.waitForTimeout(2000);
          adsNavFound = true;
          break;
        }
      }

      if (!adsNavFound) {
        await page.goto(`${MAIN_BASE}/ads`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(2000);
      }

      await page.screenshot({ path: `${SCREENSHOTS_DIR}/p11-super-admin-ads.png` }).catch(() => {});
      const hasAdsContent = await page.locator('[class*="ad"], main, table, [class*="card"]').first().isVisible({ timeout: 3000 }).catch(() => false);
      phase.tests.push({ test: 'Ads management tab', role: 'super_admin', status: hasAdsContent ? 'PASS' : 'NEEDS_REVIEW', notes: hasAdsContent ? `Ads management loaded at ${page.url().replace(MAIN_BASE, '')}` : 'No ads content found' });
      log(`  Super Admin Ads: ${hasAdsContent ? 'PASS' : 'NEEDS_REVIEW'}`);
    } catch (err) {
      phase.tests.push({ test: 'Ads management tab', role: 'super_admin', status: 'FAIL', notes: err.message });
    }

  } catch (err) {
    phase.tests.push({ test: 'Phase error', status: 'FAIL', notes: err.message });
  }

  await ctx.close();
  return phase;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  log('╔════════════════════════════════════════╗');
  log('║  Kamizo Platform E2E Audit             ║');
  log('║  Date: 2026-03-12                      ║');
  log('╚════════════════════════════════════════╝');

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });

  try {
    const phases = [
      { fn: phase1_LoginAuth, num: 1, name: 'Login & Auth' },
      { fn: phase2_AdminDashboard, num: 2, name: 'Admin Dashboard' },
      { fn: phase3_ManagerDashboard, num: 3, name: 'Manager Dashboard' },
      { fn: phase4_ResidentDashboard, num: 4, name: 'Resident Dashboard' },
      { fn: phase5_ExecutorDashboard, num: 5, name: 'Executor Dashboard' },
      { fn: phase6_DirectorDashboard, num: 6, name: 'Director Dashboard' },
      { fn: phase7_DepartmentHead, num: 7, name: 'Department Head' },
      { fn: phase8_Guard, num: 8, name: 'Guard QR Scanner' },
      { fn: phase9_Advertiser, num: 9, name: 'Advertiser' },
      { fn: phase10_Tenant, num: 10, name: 'Marketplace Manager / Tenant' },
      { fn: phase11_SuperAdmin, num: 11, name: 'Super Admin' },
    ];

    for (const { fn, num, name } of phases) {
      log(`\n${'='.repeat(50)}`);
      log(`PHASE ${num}: ${name}`);
      log('='.repeat(50));
      try {
        const result = await fn(browser);
        report.phases.push(result);
      } catch (err) {
        log(`  PHASE ${num} FAILED: ${err.message}`);
        report.phases.push({ phase: num, name, tests: [{ test: 'Phase failed', status: 'FAIL', notes: err.message }] });
      }
      await new Promise(r => setTimeout(r, 2000)); // cooldown between phases
    }

  } finally {
    await browser.close();
  }

  // Summary
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

  const reportPath = '/Users/shaxzodisamahamadov/kamizo/audit/reaudit-report.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  log('\n╔════════════════════════════════════════╗');
  log(`║  AUDIT COMPLETE                        ║`);
  log(`║  Total:        ${String(total).padEnd(24)}║`);
  log(`║  Passed:       ${String(passed).padEnd(24)}║`);
  log(`║  Failed:       ${String(failed).padEnd(24)}║`);
  log(`║  Needs Review: ${String(needs_review).padEnd(24)}║`);
  log('╚════════════════════════════════════════╝');
  log(`Report: ${reportPath}`);

  // Print the full JSON report
  console.log('\n===== FULL JSON REPORT =====');
  console.log(JSON.stringify(report, null, 2));
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
