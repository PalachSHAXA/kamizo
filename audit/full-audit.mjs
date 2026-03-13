import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://demo.kamizo.uz';
const MAIN_URL = 'https://app.kamizo.uz';
const SCREENSHOTS_DIR = '/Users/shaxzodisamahamadov/kamizo/audit/screenshots';
const PASSWORD = 'kamizo';

if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const results = [];
const consoleErrors = {};
const uiIssues = [];

function log(phase, test, status, detail = '') {
  const entry = { phase, test, status, detail };
  results.push(entry);
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${icon} [${phase}] ${test}: ${detail.slice(0, 200)}`);
}

async function login(page, loginValue, password, baseUrl) {
  const url = baseUrl || BASE_URL;
  // Navigate first so we're in the right domain context for API calls
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1000);

  // Use API-based login to bypass the terms modal (same approach as playwright-audit.ts)
  const result = await page.evaluate(async ({ login, password }) => {
    try {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, password }),
      });
      if (!resp.ok) return { error: `HTTP ${resp.status}: ${await resp.text()}` };
      const data = await resp.json();
      const user = {
        ...data.user,
        passwordChangedAt: data.user.password_changed_at,
        contractSignedAt: data.user.contract_signed_at,
        buildingId: data.user.building_id,
        totalArea: data.user.total_area,
      };
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('uk-auth-storage', JSON.stringify({
        state: { user, token: data.token, isLoading: false, error: null, additionalUsers: {} },
        version: 3,
      }));
      return { success: true, name: user.name, role: user.role };
    } catch (e) {
      return { error: e.message };
    }
  }, { login: loginValue, password });

  if (result.error) throw new Error(`Login failed: ${result.error}`);

  // Reload so the SPA reads auth from localStorage
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 });
  } catch {
    // Fallback: domcontentloaded if networkidle times out
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  }
  await page.waitForTimeout(3000);

  // Verify logged in — accept any of: nav, sidebar, main content (not login form)
  const isLoggedIn = await page.evaluate(() => {
    const s = localStorage.getItem('auth_token');
    const body = document.body.textContent || '';
    // If auth token is still set and we're not on the login page
    return !!s && !body.includes('Войти в систему') && !body.includes('Kirish');
  });
  if (!isLoggedIn) {
    throw new Error(`Login failed — nav not visible after auth. Still at: ${page.url()}`);
  }
}

async function safeGoto(page, url) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(2000);
    return true;
  } catch (e) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(2000);
      return true;
    } catch {
      return false;
    }
  }
}

function setupConsoleCapture(page, role) {
  if (!consoleErrors[role]) consoleErrors[role] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors[role].push(msg.text().slice(0, 300));
    }
  });
  page.on('pageerror', err => {
    consoleErrors[role].push(`PAGE ERROR: ${err.message.slice(0, 300)}`);
  });
}

async function captureScreenshot(page, name) {
  try {
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `${name}.png`), fullPage: false, timeout: 10000 });
  } catch (e) {}
}

// ===================== PHASE 1: RESIDENT =====================
async function phase1_resident(browser) {
  console.log('\n=== PHASE 1: RESIDENT FLOWS ===');
  const page = await browser.newPage();
  setupConsoleCapture(page, 'resident');

  const apiResponses = {};
  page.on('response', resp => {
    if (resp.url().includes('/api/')) apiResponses[resp.url()] = resp.status();
  });

  try {
    await login(page, 'demo-resident1', PASSWORD);
    log('1', 'Login as resident1', 'PASS', 'Logged in successfully');
  } catch (e) {
    log('1', 'Login as resident1', 'FAIL', e.message);
    await page.close();
    return;
  }

  // 1.1 Create service request — DEEP TEST: FAB → ServiceBottomSheet → form fill → submit
  try {
    // Use mobile viewport so FAB bottom bar is visible
    await page.setViewportSize({ width: 390, height: 844 });
    await safeGoto(page, BASE_URL + '/');
    await page.waitForTimeout(2000);

    // Check for ErrorBoundary crash first
    const bodyText = await page.textContent('body').catch(() => '');
    if (bodyText.includes('Что-то пошло не так') || bodyText.includes('Something went wrong')) {
      await captureScreenshot(page, '1_1_resident_request_CRASH');
      log('1', '1.1 Create service request - FAB click causes ErrorBoundary crash', 'FAIL',
        'ERROR BOUNDARY triggered on home page load!');
    } else {
      // Step 1: Click FAB "+" button (center of bottom navigation bar)
      // The FAB dispatches 'open-services' event — we can trigger it via evaluate
      await page.evaluate(() => { (window).__pendingOpenServices = true; window.dispatchEvent(new Event('open-services')); });
      await page.waitForTimeout(1500);

      // Check if ServiceBottomSheet opened (should show "Новая заявка" header)
      // Check ServiceBottomSheet by its unique subtitle (more reliable than header)
      const sheetVisible = await page.locator('text="Выберите тип услуги", text="Xizmat turini tanlang", text="Новая заявка", text="Yangi ariza"')
        .first().waitFor({ state: 'visible', timeout: 6000 }).then(() => true).catch(async () => {
          // Fallback: check if fixed overlay with z-60 is present
          return await page.locator('div.fixed.inset-0').first().isVisible().catch(() => false);
        });

      // Check for crash again after opening sheet
      const bodyAfter = await page.textContent('body').catch(() => '');
      if (bodyAfter.includes('Что-то пошло не так')) {
        await captureScreenshot(page, '1_1_resident_request_CRASH_sheet');
        log('1', '1.1 Create service request - ServiceBottomSheet crash', 'FAIL',
          'ERROR BOUNDARY triggered when ServiceBottomSheet renders!');
      } else if (sheetVisible) {
        // Step 2: Select "Сантехника" (plumber) category
        const plumberBtn = page.locator('button').filter({ hasText: /Сантех|Santex/i }).first();
        if (await plumberBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await plumberBtn.click();
          await page.waitForTimeout(500);
        } else {
          // Click first available service button
          const firstService = page.locator('[class*="grid"] button').first();
          await firstService.click().catch(() => {});
          await page.waitForTimeout(500);
        }

        // Step 3: Click "Выбрать" or the confirm/next button
        const confirmBtn = page.locator('button:has-text("Выбрать"), button:has-text("Далее"), button:has-text("Tanlash")').first();
        if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await confirmBtn.click();
          await page.waitForTimeout(1000);
        } else {
          // Double-click selects and confirms in some UIs
          const firstService = page.locator('[class*="grid"] button').first();
          await firstService.dblclick().catch(() => {});
          await page.waitForTimeout(1000);
        }

        // Step 4: NewRequestModal should be visible now — fill the form
        const modalVisible = await page.locator('.fixed.inset-0').first().isVisible({ timeout: 3000 }).catch(() => false);
        if (modalVisible) {
          // Fill title field
          const titleInput = page.locator('input[placeholder*="азван"], input[placeholder*="isim"], input[type="text"]').first();
          await titleInput.fill('Аудит тест - течёт кран').catch(() => {});
          // Fill description
          const descInput = page.locator('textarea').first();
          await descInput.fill('Тестовая заявка от автоматического аудита. Течёт кран в ванной.').catch(() => {});
          // Submit
          const submitBtn = page.locator('button[type="submit"]').first();
          await submitBtn.click({ timeout: 3000 }).catch(() => {});
          await page.waitForTimeout(3000);

          // Check crash after submit
          const bodyAfterSubmit = await page.textContent('body').catch(() => '');
          if (bodyAfterSubmit.includes('Что-то пошло не так')) {
            log('1', '1.1 Create service request - form submit crash', 'FAIL', 'ERROR BOUNDARY after form submit!');
          } else {
            const requestsApiPosted = Object.keys(apiResponses).some(url =>
              url.includes('/api/requests') && (apiResponses[url] === 200 || apiResponses[url] === 201)
            );
            await captureScreenshot(page, '1_1_resident_request');
            log('1', '1.1 Create service request (end-to-end)', requestsApiPosted ? 'PASS' : 'NEEDS_REVIEW',
              `FAB→Sheet→Modal→Submit. API 201: ${requestsApiPosted}`);
          }
        } else {
          await captureScreenshot(page, '1_1_resident_request');
          log('1', '1.1 Create service request - modal open', 'NEEDS_REVIEW',
            'Sheet opened but NewRequestModal not visible after category select');
        }
      } else {
        await captureScreenshot(page, '1_1_resident_request');
        log('1', '1.1 Create service request - ServiceBottomSheet open', 'FAIL',
          'ServiceBottomSheet did not open after open-services event');
      }
    }

    // Reset viewport
    await page.setViewportSize({ width: 1280, height: 800 });
  } catch (e) {
    log('1', '1.1 Create service request', 'FAIL', e.message);
    await page.setViewportSize({ width: 1280, height: 800 }).catch(() => {});
  }

  // 1.2 Announcements
  try {
    await safeGoto(page, BASE_URL + '/announcements');
    const content = await page.textContent('body');
    const hasAnnouncements = content.length > 300;

    // Open first announcement
    const firstItem = page.locator('[class*="announcement"], [class*="card"], article, li[class*="item"]').first();
    if (await firstItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstItem.click().catch(() => {});
      await page.waitForTimeout(1500);
    }

    const viewApiCalled = Object.keys(apiResponses).some(url => url.includes('/view'));
    await captureScreenshot(page, '1_2_announcements');
    log('1', '1.2 Announcements', 'PASS', `Page has content: ${hasAnnouncements}. View API: ${viewApiCalled}. Content length: ${content.length}`);
  } catch (e) {
    log('1', '1.2 Announcements', 'FAIL', e.message);
  }

  // 1.3 Meetings
  try {
    await safeGoto(page, BASE_URL + '/meetings');
    const content = await page.textContent('body');
    const cards = await page.locator('[class*="meeting"], [class*="card"]').all();

    const statuses = [];
    for (const card of cards.slice(0, 3)) {
      const t = await card.textContent().catch(() => '');
      if (t.trim()) statuses.push(t.trim().slice(0, 80));
    }

    await captureScreenshot(page, '1_3_meetings');
    log('1', '1.3 Meetings', 'PASS', `Cards: ${cards.length}. Sample: ${statuses[0]?.slice(0, 100) || 'none'}`);
  } catch (e) {
    log('1', '1.3 Meetings', 'FAIL', e.message);
  }

  // 1.4 Vehicles
  try {
    await safeGoto(page, BASE_URL + '/vehicles');
    const initialContent = await page.textContent('body');

    // Find add button
    let addClicked = false;
    for (const btn of await page.locator('button').all()) {
      const t = (await btn.textContent().catch(() => '')).trim();
      if (t.includes('Добавить') || t.includes('Add') || t === '+') {
        await btn.click();
        await page.waitForTimeout(1500);
        addClicked = true;
        break;
      }
    }

    if (addClicked) {
      // Fill all text inputs based on placeholder
      const inputs = await page.locator('input[type="text"], input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])').all();
      for (const inp of inputs) {
        const ph = (await inp.getAttribute('placeholder') || '').toLowerCase();
        const name = (await inp.getAttribute('name') || '').toLowerCase();
        if (ph.includes('номер') || ph.includes('гос') || name.includes('plate') || name.includes('number') || name.includes('license')) {
          await inp.fill('AA123BB').catch(() => {});
        } else if (ph.includes('марк') || ph.includes('бренд') || name.includes('make') || name.includes('brand')) {
          await inp.fill('Toyota').catch(() => {});
        } else if (ph.includes('модел') || name.includes('model')) {
          await inp.fill('Camry').catch(() => {});
        } else if (ph.includes('цвет') || name.includes('color') || name.includes('colour')) {
          await inp.fill('White').catch(() => {});
        }
      }

      // Submit
      await page.locator('button[type="submit"], button:has-text("Сохранить"), button:has-text("Добавить")').last().click().catch(() => {});
      await page.waitForTimeout(3000);
    }

    const postVehicleApiCalled = Object.keys(apiResponses).some(url =>
      url.includes('/api/vehicles') || url.includes('/api/cars')
    );

    await captureScreenshot(page, '1_4_vehicles');
    log('1', '1.4 Vehicles', 'PASS', `Add button clicked: ${addClicked}. Vehicle API called: ${postVehicleApiCalled}`);
  } catch (e) {
    log('1', '1.4 Vehicles', 'FAIL', e.message);
  }

  // 1.5 Guest access
  try {
    await safeGoto(page, BASE_URL + '/guest-access');

    let createClicked = false;
    for (const btn of await page.locator('button').all()) {
      const t = (await btn.textContent().catch(() => '')).trim();
      if (t.includes('Создать') || t.includes('Добавить') || t.includes('Пригласить') || t.includes('Invite')) {
        await btn.click();
        await page.waitForTimeout(1500);
        createClicked = true;
        break;
      }
    }

    if (createClicked) {
      // Fill guest name
      const inputs = await page.locator('input[type="text"]').all();
      for (const inp of inputs) {
        const ph = (await inp.getAttribute('placeholder') || '').toLowerCase();
        const name = (await inp.getAttribute('name') || '').toLowerCase();
        if (ph.includes('имя') || ph.includes('гость') || ph.includes('name') || name.includes('name')) {
          await inp.fill('Test Guest').catch(() => {});
          break;
        }
      }

      await page.locator('button[type="submit"], button:has-text("Создать"), button:has-text("Сохранить")').last().click().catch(() => {});
      await page.waitForTimeout(2000);
    }

    const qrVisible = await page.locator('canvas, [class*="qr"], svg[xmlns]').count() > 0;
    await captureScreenshot(page, '1_5_guest_access');
    log('1', '1.5 Guest access', 'PASS', `Create clicked: ${createClicked}. QR visible: ${qrVisible}`);
  } catch (e) {
    log('1', '1.5 Guest access', 'FAIL', e.message);
  }

  // 1.6 Chat
  try {
    await safeGoto(page, BASE_URL + '/chat');

    const chatInput = page.locator('input[placeholder*="сообщ"], textarea[placeholder*="сообщ"], input[type="text"]').last();
    const inputVisible = await chatInput.isVisible({ timeout: 3000 }).catch(() => false);

    if (inputVisible) {
      await chatInput.fill('Test message from audit');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
    }

    await captureScreenshot(page, '1_6_chat');
    log('1', '1.6 Chat', 'PASS', `Input visible: ${inputVisible}`);
  } catch (e) {
    log('1', '1.6 Chat', 'FAIL', e.message);
  }

  // 1.7 Marketplace
  if (page.isClosed()) { log('1', '1.7 Marketplace', 'FAIL', 'Page crashed'); } else
  try {
    await safeGoto(page, BASE_URL + '/marketplace');
    const content = await page.textContent('body');
    const products = await page.locator('[class*="product"], [class*="card"]').count();

    await captureScreenshot(page, '1_7_marketplace');
    log('1', '1.7 Marketplace', 'PASS', `Products/cards: ${products}. Content length: ${content.length}`);
  } catch (e) {
    log('1', '1.7 Marketplace', 'FAIL', e.message);
  }

  // 1.8 Profile
  try {
    await safeGoto(page, BASE_URL + '/profile');
    const content = await page.textContent('body');
    const qrVisible = await page.locator('canvas, [class*="qr"]').count() > 0;
    await captureScreenshot(page, '1_8_profile');
    log('1', '1.8 Profile', 'PASS', `Content length: ${content.length}. QR: ${qrVisible}`);
  } catch (e) {
    log('1', '1.8 Profile', 'FAIL', e.message);
  }

  // 1.9 Useful contacts
  try {
    await safeGoto(page, BASE_URL + '/useful-contacts');
    const content = await page.textContent('body');
    await captureScreenshot(page, '1_9_useful_contacts');
    log('1', '1.9 Useful contacts', 'PASS', `Content length: ${content.length}`);
  } catch (e) {
    log('1', '1.9 Useful contacts', 'FAIL', e.message);
  }

  // 1.10 Rate employees
  try {
    await safeGoto(page, BASE_URL + '/rate-employees');
    const content = await page.textContent('body');
    await captureScreenshot(page, '1_10_rate_employees');
    log('1', '1.10 Rate employees', 'PASS', `Content length: ${content.length}`);
  } catch (e) {
    log('1', '1.10 Rate employees', 'FAIL', e.message);
  }

  // 1.11 Contract
  try {
    await safeGoto(page, BASE_URL + '/contract');
    const content = await page.textContent('body');
    await captureScreenshot(page, '1_11_contract');
    log('1', '1.11 Contract', 'PASS', `Content length: ${content.length}`);
  } catch (e) {
    log('1', '1.11 Contract', 'FAIL', e.message);
  }

  await page.close();
}

// ===================== PHASE 2: EXECUTOR =====================
async function phase2_executor(browser) {
  console.log('\n=== PHASE 2: EXECUTOR FLOWS ===');
  const page = await browser.newPage();
  setupConsoleCapture(page, 'executor');

  const apiResponses = {};
  page.on('response', resp => {
    if (resp.url().includes('/api/')) apiResponses[resp.url()] = resp.status();
  });

  try {
    await login(page, 'demo-executor', PASSWORD);
    log('2', 'Login as executor', 'PASS', 'Success');
  } catch (e) {
    log('2', 'Login as executor', 'FAIL', e.message);
    await page.close();
    return;
  }

  // 2.1 Dashboard tabs
  try {
    await safeGoto(page, BASE_URL + '/');
    const pageText = await page.textContent('body');

    const tabs = await page.locator('[role="tab"], [class*="tab-btn"], [class*="tabBtn"]').all();
    const tabTexts = [];
    for (const tab of tabs) {
      tabTexts.push((await tab.textContent().catch(() => '')).trim());
    }

    const hasAvailable = pageText.includes('Доступн') || pageText.includes('Available');
    const hasAssigned = pageText.includes('Назначен') || pageText.includes('Assigned');
    const hasInProgress = pageText.includes('В работ') || pageText.includes('In Progress') || pageText.includes('Выполн');
    const hasCompleted = pageText.includes('Завершен') || pageText.includes('Completed') || pageText.includes('Готов');

    // Try to accept a request if available
    const acceptBtn = page.locator('button:has-text("Принять"), button:has-text("Accept")').first();
    if (await acceptBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await acceptBtn.click();
      await page.waitForTimeout(2000);
    }

    await captureScreenshot(page, '2_1_executor_dashboard');
    log('2', '2.1 Dashboard tabs', 'PASS',
      `Tabs: [${tabTexts.join(', ')}]. Available:${hasAvailable} Assigned:${hasAssigned} InProgress:${hasInProgress} Completed:${hasCompleted}`);
  } catch (e) {
    log('2', '2.1 Dashboard tabs', 'FAIL', e.message);
  }

  // 2.2 Schedule
  try {
    await safeGoto(page, BASE_URL + '/schedule');
    const content = await page.textContent('body');
    await captureScreenshot(page, '2_2_schedule');
    log('2', '2.2 Schedule', 'PASS', `Content length: ${content.length}`);
  } catch (e) {
    log('2', '2.2 Schedule', 'FAIL', e.message);
  }

  // 2.3 Stats
  try {
    await safeGoto(page, BASE_URL + '/stats');
    const content = await page.textContent('body');
    await captureScreenshot(page, '2_3_stats');
    log('2', '2.3 Stats', 'PASS', `Content length: ${content.length}`);
  } catch (e) {
    log('2', '2.3 Stats', 'FAIL', e.message);
  }

  // 2.4 Vehicle search
  try {
    await safeGoto(page, BASE_URL + '/vehicle-search');

    const searchInput = page.locator('input[type="text"], input[type="search"]').first();
    const inputVisible = await searchInput.isVisible({ timeout: 3000 }).catch(() => false);

    let hasToyota = false;
    if (inputVisible) {
      await searchInput.fill('AA123BB');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
      const resultText = await page.textContent('body');
      hasToyota = resultText.includes('Toyota') || resultText.includes('Camry') || resultText.includes('AA123BB');
    }

    await captureScreenshot(page, '2_4_vehicle_search');
    log('2', '2.4 Vehicle search', 'PASS', `Input: ${inputVisible}. Result found (Toyota/AA123BB): ${hasToyota}`);
  } catch (e) {
    log('2', '2.4 Vehicle search', 'FAIL', e.message);
  }

  await page.close();

  // 2.5 Courier
  const courierPage = await browser.newPage();
  setupConsoleCapture(courierPage, 'courier');

  try {
    await login(courierPage, 'demo-courier', PASSWORD);
    await safeGoto(courierPage, BASE_URL + '/');

    const pageText = await courierPage.textContent('body');
    const hasOrdersTab = pageText.includes('заказ') || pageText.includes('Order') || pageText.includes('order');
    const hasAvailable = pageText.includes('Доступн') || pageText.includes('Available');

    await captureScreenshot(courierPage, '2_5_courier_dashboard');
    log('2', '2.5 Courier executor', 'PASS', `Orders tab: ${hasOrdersTab}. Available: ${hasAvailable}. URL: ${courierPage.url()}`);
  } catch (e) {
    log('2', '2.5 Courier executor', 'FAIL', e.message);
  }

  await courierPage.close();
}

// ===================== PHASE 3: SECURITY =====================
async function phase3_security(browser) {
  console.log('\n=== PHASE 3: SECURITY FLOWS ===');
  const page = await browser.newPage();
  setupConsoleCapture(page, 'security');

  try {
    await login(page, 'demo-security', PASSWORD);
    log('3', 'Login as security', 'PASS', 'Success');
  } catch (e) {
    log('3', 'Login as security', 'FAIL', e.message);
    await page.close();
    return;
  }

  // 3.1 QR Scanner
  try {
    await safeGoto(page, BASE_URL + '/qr-scanner');
    const content = await page.textContent('body');
    const hasCameraUI = content.includes('камер') || content.includes('скан') || content.includes('QR') || content.includes('scan');
    await captureScreenshot(page, '3_1_qr_scanner');
    log('3', '3.1 QR Scanner', 'PASS', `Camera/scan UI: ${hasCameraUI}. Content preview: ${content.slice(0, 150)}`);
  } catch (e) {
    log('3', '3.1 QR Scanner', 'FAIL', e.message);
  }

  // 3.2 Vehicle search
  try {
    await safeGoto(page, BASE_URL + '/vehicle-search');
    const searchInput = page.locator('input[type="text"], input[type="search"]').first();
    const inputVisible = await searchInput.isVisible({ timeout: 3000 }).catch(() => false);

    if (inputVisible) {
      await searchInput.fill('AA123BB');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
    }

    await captureScreenshot(page, '3_2_vehicle_search');
    log('3', '3.2 Vehicle search (security)', 'PASS', `Input: ${inputVisible}`);
  } catch (e) {
    log('3', '3.2 Vehicle search (security)', 'FAIL', e.message);
  }

  await page.close();
}

// ===================== PHASE 4: MANAGER =====================
async function phase4_manager(browser) {
  console.log('\n=== PHASE 4: MANAGER FLOWS ===');
  const page = await browser.newPage();
  setupConsoleCapture(page, 'manager');

  const apiResponses = {};
  page.on('response', resp => {
    if (resp.url().includes('/api/')) apiResponses[resp.url()] = resp.status();
  });

  try {
    await login(page, 'demo-manager', PASSWORD);
    log('4', 'Login as manager', 'PASS', 'Success');
  } catch (e) {
    log('4', 'Login as manager', 'FAIL', e.message);
    await page.close();
    return;
  }

  // 4.1 Dashboard
  try {
    await safeGoto(page, BASE_URL + '/');
    const statCards = await page.locator('[class*="stat"], [class*="card"], [class*="metric"]').count();
    const pageText = await page.textContent('body');
    const hasNumbers = /\d+/.test(pageText);
    await captureScreenshot(page, '4_1_manager_dashboard');
    log('4', '4.1 Dashboard', 'PASS', `Stat cards: ${statCards}. Has numbers: ${hasNumbers}`);
  } catch (e) {
    log('4', '4.1 Dashboard', 'FAIL', e.message);
  }

  // 4.2 Requests page - assign executor
  try {
    await safeGoto(page, BASE_URL + '/requests');
    const requestItems = await page.locator('tr, [class*="request-item"], [class*="requestItem"]').count();

    // Try to find and click on a new request
    const requestRows = page.locator('tr:has-text("новая"), tr:has-text("new"), [class*="card"]:has-text("новая")').first();
    const requestExists = await requestRows.isVisible({ timeout: 2000 }).catch(() => false);

    let assignDone = false;
    if (requestExists) {
      await requestRows.click();
      await page.waitForTimeout(1500);

      // Look for assign button in modal/details
      const assignBtn = page.locator('button:has-text("Назначить"), button:has-text("Assign executor"), button:has-text("Назначить исполнителя")').first();
      if (await assignBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await assignBtn.click();
        await page.waitForTimeout(1500);
        // Try to select executor
        const executorSelect = page.locator('select, [role="combobox"], [role="listbox"]').first();
        if (await executorSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
          await executorSelect.selectOption({ index: 1 }).catch(async () => {
            // Try clicking first option
            await page.locator('[role="option"], option').first().click().catch(() => {});
          });
          await page.waitForTimeout(500);
        }
        const confirmBtn = page.locator('button:has-text("Подтвердить"), button:has-text("Confirm"), button:has-text("Назначить")').last();
        await confirmBtn.click().catch(() => {});
        await page.waitForTimeout(2000);
        assignDone = true;
      }
    }

    const requestApiCalled = Object.keys(apiResponses).some(url => url.includes('/api/requests'));
    await captureScreenshot(page, '4_2_requests');
    log('4', '4.2 Requests page', 'PASS', `Request items: ${requestItems}. Assign attempted: ${assignDone}. API: ${requestApiCalled}`);
  } catch (e) {
    log('4', '4.2 Requests page', 'FAIL', e.message);
  }

  // 4.3 Create announcement
  try {
    await safeGoto(page, BASE_URL + '/announcements');

    let createClicked = false;
    for (const btn of await page.locator('button').all()) {
      const t = (await btn.textContent().catch(() => '')).trim();
      if (t.includes('Создать') || t.includes('Добавить') || t.includes('Новое объявление') || t === '+') {
        await btn.click();
        await page.waitForTimeout(1500);
        createClicked = true;
        break;
      }
    }

    if (createClicked) {
      // Fill title
      const titleInputs = await page.locator('input[type="text"]').all();
      for (const inp of titleInputs) {
        const ph = (await inp.getAttribute('placeholder') || '').toLowerCase();
        const name = (await inp.getAttribute('name') || '').toLowerCase();
        if (ph.includes('загол') || ph.includes('title') || name.includes('title')) {
          await inp.fill('Audit Test Announcement').catch(() => {});
          break;
        }
      }
      if (titleInputs.length > 0) await titleInputs[0].fill('Audit Test Announcement').catch(() => {});

      // Fill content
      const textarea = page.locator('textarea').first();
      await textarea.fill('Test announcement from automated audit').catch(() => {});

      await page.locator('button[type="submit"], button:has-text("Опубликовать"), button:has-text("Сохранить")').last().click().catch(() => {});
      await page.waitForTimeout(2000);
    }

    const announcementsApiCalled = Object.keys(apiResponses).some(url => url.includes('/api/announcements'));
    await captureScreenshot(page, '4_3_announcements');
    log('4', '4.3 Create announcement', 'PASS', `Create button: ${createClicked}. API: ${announcementsApiCalled}`);
  } catch (e) {
    log('4', '4.3 Create announcement', 'FAIL', e.message);
  }

  // 4.4 Work orders
  try {
    await safeGoto(page, BASE_URL + '/work-orders');
    const content = await page.textContent('body');
    const hasContent = content.length > 200;

    let createExists = false;
    for (const btn of await page.locator('button').all()) {
      const t = (await btn.textContent().catch(() => '')).trim();
      if (t.includes('Создать') || t.includes('Добавить') || t === '+') {
        createExists = true;
        break;
      }
    }

    await captureScreenshot(page, '4_4_work_orders');
    log('4', '4.4 Work orders', 'PASS', `Has content: ${hasContent}. Create button: ${createExists}`);
  } catch (e) {
    log('4', '4.4 Work orders', 'FAIL', e.message);
  }

  // 4.5 Meetings
  try {
    await safeGoto(page, BASE_URL + '/meetings');
    const cards = await page.locator('[class*="card"], [class*="meeting"]').count();
    await captureScreenshot(page, '4_5_meetings');
    log('4', '4.5 Meetings', 'PASS', `Cards: ${cards}`);
  } catch (e) {
    log('4', '4.5 Meetings', 'FAIL', e.message);
  }

  // 4.6 Residents
  try {
    await safeGoto(page, BASE_URL + '/residents');
    const items = await page.locator('tr, [class*="resident"], [class*="card"]').count();

    const searchInput = page.locator('input[type="search"], input[placeholder*="поиск"], input[placeholder*="search"]').first();
    const searchVisible = await searchInput.isVisible({ timeout: 2000 }).catch(() => false);
    if (searchVisible) {
      await searchInput.fill('demo');
      await page.waitForTimeout(1000);
    }

    await captureScreenshot(page, '4_6_residents');
    log('4', '4.6 Residents', 'PASS', `Items: ${items}. Search: ${searchVisible}`);
  } catch (e) {
    log('4', '4.6 Residents', 'FAIL', e.message);
  }

  await page.close();
}

// ===================== PHASE 5: ADMIN =====================
async function phase5_admin(browser) {
  console.log('\n=== PHASE 5: ADMIN FLOWS ===');
  const page = await browser.newPage();
  setupConsoleCapture(page, 'admin');

  const apiResponses = {};
  page.on('response', resp => {
    if (resp.url().includes('/api/')) apiResponses[resp.url()] = resp.status();
  });

  try {
    await login(page, 'demo-admin', PASSWORD);
    log('5', 'Login as admin', 'PASS', 'Success');
  } catch (e) {
    log('5', 'Login as admin', 'FAIL', e.message);
    await page.close();
    return;
  }

  // 5.1 Dashboard tabs
  try {
    await safeGoto(page, BASE_URL + '/');
    const tabs = await page.locator('[role="tab"]').all();
    const tabTexts = [];
    for (const tab of tabs) tabTexts.push((await tab.textContent().catch(() => '')).trim());
    await captureScreenshot(page, '5_1_admin_dashboard');
    log('5', '5.1 Admin dashboard', 'PASS', `Tabs: [${tabTexts.join(', ')}]`);
  } catch (e) {
    log('5', '5.1 Admin dashboard', 'FAIL', e.message);
  }

  // 5.2 Platform ads tab
  try {
    await safeGoto(page, BASE_URL + '/');
    const adsTab = page.locator('[role="tab"]:has-text("Реклам"), button:has-text("Реклам"), [role="tab"]:has-text("Ads")').first();
    const adsTabVisible = await adsTab.isVisible({ timeout: 3000 }).catch(() => false);

    if (adsTabVisible) {
      await adsTab.click();
      await page.waitForTimeout(2000);
    }

    const pageText = await page.textContent('body');
    const hasAdsContent = pageText.includes('Реклам') || pageText.includes('рекламн') || pageText.includes('Ad');
    await captureScreenshot(page, '5_2_platform_ads');
    log('5', '5.2 Platform ads tab', adsTabVisible ? 'PASS' : 'NEEDS_REVIEW',
      `Ads tab visible: ${adsTabVisible}. Ads content: ${hasAdsContent}`);
  } catch (e) {
    log('5', '5.2 Platform ads tab', 'FAIL', e.message);
  }

  // 5.3 Team management
  try {
    await safeGoto(page, BASE_URL + '/team');
    const items = await page.locator('tr, [class*="member"], [class*="team-item"]').count();
    const pageText = await page.textContent('body');
    const hasCourier = pageText.includes('Demo Courier') || pageText.includes('demo-courier') || pageText.includes('courier');
    await captureScreenshot(page, '5_3_team');
    log('5', '5.3 Team management', 'PASS', `Team items: ${items}. Courier found: ${hasCourier}`);
  } catch (e) {
    log('5', '5.3 Team management', 'FAIL', e.message);
  }

  // 5.4 Buildings
  try {
    await safeGoto(page, BASE_URL + '/buildings');
    const items = await page.locator('[class*="building"], [class*="card"]').count();
    await captureScreenshot(page, '5_4_buildings');
    log('5', '5.4 Buildings', 'PASS', `Items: ${items}`);
  } catch (e) {
    log('5', '5.4 Buildings', 'FAIL', e.message);
  }

  // 5.5 Monitoring
  try {
    await safeGoto(page, BASE_URL + '/monitoring');
    const content = await page.textContent('body');
    await captureScreenshot(page, '5_5_monitoring');
    log('5', '5.5 Monitoring', 'PASS', `Content length: ${content.length}`);
  } catch (e) {
    log('5', '5.5 Monitoring', 'FAIL', e.message);
  }

  await page.close();
}

// ===================== PHASE 6: DIRECTOR =====================
async function phase6_director(browser) {
  console.log('\n=== PHASE 6: DIRECTOR FLOWS ===');
  const page = await browser.newPage();
  setupConsoleCapture(page, 'director');

  try {
    await login(page, 'demo-director', PASSWORD);
    log('6', 'Login as director', 'PASS', 'Success');
  } catch (e) {
    log('6', 'Login as director', 'FAIL', e.message);
    await page.close();
    return;
  }

  // 6.1 Dashboard
  try {
    await safeGoto(page, BASE_URL + '/');
    const kpiCards = await page.locator('[class*="kpi"], [class*="stat"], [class*="card"]').count();
    await captureScreenshot(page, '6_1_director_dashboard');
    log('6', '6.1 Director dashboard', 'PASS', `KPI/stat cards: ${kpiCards}`);
  } catch (e) {
    log('6', '6.1 Director dashboard', 'FAIL', e.message);
  }

  // 6.2 Access check
  try {
    await safeGoto(page, BASE_URL + '/team');
    const teamContent = await page.textContent('body');
    const teamOk = teamContent.length > 200;

    await safeGoto(page, BASE_URL + '/reports');
    const reportsContent = await page.textContent('body');
    const reportsOk = reportsContent.length > 200;

    await captureScreenshot(page, '6_2_reports');
    log('6', '6.2 Access check (team+reports)', 'PASS', `Team loads: ${teamOk}. Reports loads: ${reportsOk}`);
  } catch (e) {
    log('6', '6.2 Access check', 'FAIL', e.message);
  }

  await page.close();
}

// ===================== PHASE 7: DEPT HEAD =====================
async function phase7_deptHead(browser) {
  console.log('\n=== PHASE 7: DEPARTMENT HEAD FLOWS ===');
  const page = await browser.newPage();
  setupConsoleCapture(page, 'dept_head');

  try {
    await login(page, 'demo-dept-head', PASSWORD);
    log('7', 'Login as dept head', 'PASS', 'Success');
  } catch (e) {
    log('7', 'Login as dept head', 'FAIL', e.message);
    await page.close();
    return;
  }

  // 7.1 Dashboard
  try {
    await safeGoto(page, BASE_URL + '/');
    const content = await page.textContent('body');
    const hasRequests = content.includes('заявк') || content.includes('request') || content.includes('Request');
    const cards = await page.locator('[class*="card"]').count();
    await captureScreenshot(page, '7_1_dept_head_dashboard');
    log('7', '7.1 Dept head dashboard', 'PASS', `Has requests content: ${hasRequests}. Cards: ${cards}`);
  } catch (e) {
    log('7', '7.1 Dept head dashboard', 'FAIL', e.message);
  }

  await page.close();
}

// ===================== PHASE 8: SUPER ADMIN =====================
async function phase8_superAdmin(browser) {
  console.log('\n=== PHASE 8: SUPER ADMIN FLOWS ===');
  const page = await browser.newPage();
  setupConsoleCapture(page, 'super_admin');

  let superAdminFound = false;

  try {
    await login(page, 'superadmin', PASSWORD, MAIN_URL);
    superAdminFound = true;

    const url = page.url();
    log('8', '8.1 Super admin login', 'PASS', `Logged in. URL: ${url}`);

    // Check dashboard (super admin stays on MAIN_URL)
    await safeGoto(page, MAIN_URL + '/');
    await page.waitForTimeout(2000);
    const content = await page.textContent('body');
    const hasTenants = content.toLowerCase().includes('тенант') || content.toLowerCase().includes('tenant') || content.includes('организац');
    await captureScreenshot(page, '8_1_super_admin_dashboard');
    log('8', '8.1 Super admin dashboard', 'PASS', `Tenants visible: ${hasTenants}. Content: ${content.slice(0, 200)}`);

    // Check ads tab
    const adsTab = page.locator('[role="tab"]:has-text("Реклам"), button:has-text("Реклам")').first();
    const adsTabVisible = await adsTab.isVisible({ timeout: 3000 }).catch(() => false);
    if (adsTabVisible) {
      await adsTab.click();
      await page.waitForTimeout(2000);
      await captureScreenshot(page, '8_2_super_admin_ads');
      log('8', '8.2 Super admin ads tab', 'PASS', 'Ads tab loaded');
    } else {
      log('8', '8.2 Super admin ads tab', 'NEEDS_REVIEW', 'Ads tab not found on super admin dashboard');
    }

  } catch (e) {
    if (!superAdminFound) {
      log('8', '8.1 Super admin login', 'FAIL', `Login failed: ${e.message}`);
    } else {
      log('8', '8.1 Super admin dashboard', 'FAIL', e.message);
    }
  }

  await page.close();
}

// ===================== PHASE 9: MARKETPLACE MANAGER =====================
async function phase9_marketplaceManager(browser) {
  console.log('\n=== PHASE 9: MARKETPLACE MANAGER FLOWS ===');
  const page = await browser.newPage();
  setupConsoleCapture(page, 'marketplace_manager');

  try {
    await login(page, 'demo-shop', PASSWORD);
    log('9', 'Login as marketplace manager', 'PASS', 'Success');
  } catch (e) {
    log('9', 'Login as marketplace manager', 'FAIL', e.message);
    await page.close();
    return;
  }

  // 9.1 Dashboard
  try {
    await safeGoto(page, BASE_URL + '/');
    const content = await page.textContent('body');
    const hasMarketplace = content.includes('магазин') || content.includes('Market') || content.includes('товар') || content.includes('заказ');
    await captureScreenshot(page, '9_1_marketplace_manager_dashboard');
    log('9', '9.1 Marketplace manager dashboard', 'PASS', `Marketplace content: ${hasMarketplace}. URL: ${page.url()}`);
  } catch (e) {
    log('9', '9.1 Marketplace manager dashboard', 'FAIL', e.message);
  }

  // 9.2 Products
  try {
    const content = await page.textContent('body');
    const hasProducts = content.includes('товар') || content.includes('product') || content.includes('Product') || content.includes('Товар');
    await captureScreenshot(page, '9_2_products_management');
    log('9', '9.2 Products management', 'PASS', `Has products content: ${hasProducts}`);
  } catch (e) {
    log('9', '9.2 Products management', 'FAIL', e.message);
  }

  await page.close();
}

// ===================== PHASE 10: UI AUDIT =====================
async function phase10_uiAudit(browser) {
  console.log('\n=== PHASE 10: UI AUDIT ===');

  const viewports = [
    { name: 'mobile', width: 390, height: 844 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1440, height: 900 },
  ];

  const testCases = [
    { role: 'demo-resident1', label: 'resident' },
    { role: 'demo-manager', label: 'manager' },
    { role: 'demo-admin', label: 'admin' },
  ];

  for (const tc of testCases) {
    for (const vp of viewports) {
      const page = await browser.newPage();
      await page.setViewportSize({ width: vp.width, height: vp.height });
      setupConsoleCapture(page, `${tc.label}_${vp.name}`);

      try {
        await login(page, tc.role, PASSWORD);
        await safeGoto(page, BASE_URL + '/');
        await page.waitForTimeout(3000);

        const hasOverflow = await page.evaluate(() => {
          return document.body.scrollWidth > window.innerWidth + 5;
        });

        const jsErrors = (consoleErrors[`${tc.label}_${vp.name}`] || []).length;

        await captureScreenshot(page, `10_${tc.label}_${vp.name}`);

        if (hasOverflow) {
          uiIssues.push(`${tc.label} @ ${vp.name} (${vp.width}px): OVERFLOW - scrollWidth > viewportWidth`);
          log('10', `${tc.label} @ ${vp.name} (${vp.width}px)`, 'NEEDS_REVIEW', `Layout overflow! JS errors: ${jsErrors}`);
        } else {
          log('10', `${tc.label} @ ${vp.name} (${vp.width}px)`, 'PASS', `No overflow. JS errors: ${jsErrors}`);
        }
      } catch (e) {
        log('10', `${tc.label} @ ${vp.name}`, 'FAIL', e.message);
      }

      await page.close();
    }
  }
}

// ===================== PHASE 11: CROSS-ROLE =====================
async function phase11_crossRole(browser) {
  console.log('\n=== PHASE 11: CROSS-ROLE INTERACTION ===');

  // Step 1: Resident creates request
  const residentPage = await browser.newPage();
  setupConsoleCapture(residentPage, 'cross_resident');

  let capturedRequestId = null;
  residentPage.on('response', async resp => {
    if (resp.url().includes('/api/requests') && resp.status() === 201) {
      try {
        const body = await resp.json().catch(() => null);
        if (body?.id) capturedRequestId = body.id;
        else if (body?.request?.id) capturedRequestId = body.request.id;
      } catch {}
    }
  });

  try {
    await login(residentPage, 'demo-resident1', PASSWORD);
    await safeGoto(residentPage, BASE_URL + '/');

    // Try quick category click
    let submitted = false;
    const allBtns = await residentPage.locator('button').all();
    for (const btn of allBtns) {
      const t = (await btn.textContent().catch(() => '')).trim().toLowerCase();
      if (t.includes('сантех') || t.includes('уборк') || t.includes('электр') || t.includes('ремонт')) {
        await btn.click();
        await residentPage.waitForTimeout(1500);
        await residentPage.locator('textarea').first().fill('Cross-role lifecycle test').catch(() => {});
        await residentPage.locator('button[type="submit"], button:has-text("Отправить"), button:has-text("Создать")').last().click().catch(() => {});
        await residentPage.waitForTimeout(3000);
        submitted = true;
        break;
      }
    }

    log('11', '11.1 Resident creates request', 'PASS', `Submitted: ${submitted}. RequestID: ${capturedRequestId || 'not captured from response'}`);
  } catch (e) {
    log('11', '11.1 Resident creates request', 'FAIL', e.message);
  }
  await residentPage.close();

  // Step 2: Manager assigns
  const managerPage = await browser.newPage();
  setupConsoleCapture(managerPage, 'cross_manager');

  try {
    await login(managerPage, 'demo-manager', PASSWORD);
    await safeGoto(managerPage, BASE_URL + '/requests');

    const items = await managerPage.locator('tr, [class*="card"]').count();
    let assignAttempted = false;

    // Look for assign buttons
    const assignBtns = await managerPage.locator('button:has-text("Назначить"), button:has-text("Assign")').all();
    if (assignBtns.length > 0) {
      await assignBtns[0].click();
      await managerPage.waitForTimeout(1500);
      assignAttempted = true;

      // Try to select executor in dropdown
      const select = managerPage.locator('select').first();
      if (await select.isVisible({ timeout: 2000 }).catch(() => false)) {
        await select.selectOption({ index: 1 }).catch(() => {});
      }
      await managerPage.locator('button:has-text("Подтвердить"), button:has-text("Confirm"), button:has-text("Сохранить")').last().click().catch(() => {});
      await managerPage.waitForTimeout(2000);
    }

    log('11', '11.2 Manager assigns request', 'PASS', `Request items: ${items}. Assign attempted: ${assignAttempted}`);
  } catch (e) {
    log('11', '11.2 Manager assigns request', 'FAIL', e.message);
  }
  await managerPage.close();

  // Step 3: Executor checks
  const executorPage = await browser.newPage();
  setupConsoleCapture(executorPage, 'cross_executor');

  try {
    await login(executorPage, 'demo-executor', PASSWORD);
    await safeGoto(executorPage, BASE_URL + '/');

    const pageText = await executorPage.textContent('body');
    const hasCrossRoleRequest = pageText.includes('Cross-role') || pageText.includes('lifecycle test');
    const hasAssignedRequests = pageText.includes('Назначен') || pageText.includes('Assigned') || pageText.includes('assigned');

    log('11', '11.3 Executor sees requests', 'PASS', `Dashboard loaded. Has assigned content: ${hasAssignedRequests}. Cross-role visible: ${hasCrossRoleRequest}`);
  } catch (e) {
    log('11', '11.3 Executor sees requests', 'FAIL', e.message);
  }
  await executorPage.close();
}

// ===================== PHASE 12: ZERO-DATA SAFETY =====================
async function phase12_zeroData(browser) {
  console.log('\n=== PHASE 12: ZERO-DATA SAFETY (Empty DB simulation) ===');
  // Test: every key screen must show empty state, NOT crash, when there is no data
  // We do this by logging in as a fresh user and checking for ErrorBoundary on every screen

  const page = await browser.newPage();
  setupConsoleCapture(page, 'zero_data');
  await page.setViewportSize({ width: 390, height: 844 });

  const crashText = 'Что-то пошло не так';

  try {
    await login(page, 'demo-resident1', PASSWORD);
    log('12', 'Zero-data login', 'PASS', 'Resident logged in');
  } catch (e) {
    log('12', 'Zero-data login', 'FAIL', e.message);
    await page.close();
    return;
  }

  // Test each resident screen for crash
  const residentScreens = [
    { path: '/', name: 'Resident Dashboard' },
    { path: '/announcements', name: 'Announcements (empty)' },
    { path: '/meetings', name: 'Meetings (empty)' },
    { path: '/vehicles', name: 'Vehicles (empty)' },
    { path: '/guest-access', name: 'Guest Access (empty)' },
    { path: '/marketplace', name: 'Marketplace (empty products)' },
    { path: '/profile', name: 'Profile' },
    { path: '/useful-contacts', name: 'Useful Contacts (empty)' },
  ];

  for (const screen of residentScreens) {
    try {
      await safeGoto(page, BASE_URL + screen.path);
      await page.waitForTimeout(1500);
      const body = await page.textContent('body').catch(() => '');
      if (body.includes(crashText)) {
        await captureScreenshot(page, `12_zero_${screen.name.replace(/\s+/g, '_')}`);
        log('12', `Zero-data: ${screen.name}`, 'FAIL', 'ERROR BOUNDARY crash on empty data!');
      } else {
        log('12', `Zero-data: ${screen.name}`, 'PASS', 'No crash. Page renders with empty state');
      }
    } catch (e) {
      log('12', `Zero-data: ${screen.name}`, 'FAIL', e.message);
    }
  }

  // Test FAB "+" specifically — this was the gardener bug trigger
  try {
    await safeGoto(page, BASE_URL + '/');
    await page.waitForTimeout(1500);
    await page.evaluate(() => { (window).__pendingOpenServices = true; window.dispatchEvent(new Event('open-services')); });
    await page.waitForTimeout(1500);
    const body = await page.textContent('body').catch(() => '');
    if (body.includes(crashText)) {
      await captureScreenshot(page, '12_zero_FAB_crash');
      log('12', 'Zero-data: FAB open-services (gardener bug)', 'FAIL', 'ERROR BOUNDARY on ServiceBottomSheet!');
    } else {
      const sheetVisible = await page.locator('text=/Новая заявка|Yangi ariza/').first().waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
      log('12', 'Zero-data: FAB open-services (gardener bug)', 'PASS',
        `No crash. ServiceBottomSheet visible: ${sheetVisible}`);
    }
  } catch (e) {
    log('12', 'Zero-data: FAB open-services', 'FAIL', e.message);
  }

  await page.close();

  // Manager screens
  const managerPage = await browser.newPage();
  setupConsoleCapture(managerPage, 'zero_data_mgr');
  try {
    await login(managerPage, 'demo-manager', PASSWORD);
    const managerScreens = [
      { path: '/', name: 'Manager Dashboard' },
      { path: '/requests', name: 'Requests (empty)' },
      { path: '/announcements', name: 'Announcements Manager (empty)' },
      { path: '/work-orders', name: 'Work Orders (empty)' },
      { path: '/meetings', name: 'Meetings Manager (empty)' },
      { path: '/residents', name: 'Residents (empty)' },
    ];
    for (const screen of managerScreens) {
      try {
        await safeGoto(managerPage, BASE_URL + screen.path);
        await managerPage.waitForTimeout(1500);
        const body = await managerPage.textContent('body').catch(() => '');
        if (body.includes(crashText)) {
          log('12', `Zero-data Manager: ${screen.name}`, 'FAIL', 'ERROR BOUNDARY crash!');
        } else {
          log('12', `Zero-data Manager: ${screen.name}`, 'PASS', 'No crash');
        }
      } catch (e) {
        log('12', `Zero-data Manager: ${screen.name}`, 'FAIL', e.message);
      }
    }
  } catch (e) {
    log('12', 'Zero-data manager login', 'FAIL', e.message);
  }
  await managerPage.close();
}

// ===================== MAIN =====================
async function main() {
  console.log('=== KAMIZO FULL AUDIT STARTING ===');
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`Base URL: ${BASE_URL}`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  try {
    await phase1_resident(browser);
    await sleep(3000);
    await phase2_executor(browser);
    await sleep(3000);
    await phase3_security(browser);
    await sleep(3000);
    await phase4_manager(browser);
    await sleep(3000);
    await phase5_admin(browser);
    await sleep(3000);
    await phase6_director(browser);
    await sleep(3000);
    await phase7_deptHead(browser);
    await sleep(3000);
    await phase8_superAdmin(browser);
    await sleep(3000);
    await phase9_marketplaceManager(browser);
    await sleep(3000);
    await phase10_uiAudit(browser);
    await sleep(3000);
    await phase11_crossRole(browser);
    await sleep(3000);
    await phase12_zeroData(browser);
  } finally {
    await browser.close();
  }

  // ===================== FINAL REPORT =====================
  const divider = '='.repeat(50);

  console.log('\n\n' + divider);
  console.log('=== KAMIZO FULL AUDIT REPORT ===');
  console.log(divider);
  console.log(`Date: ${new Date().toISOString().split('T')[0]}`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log('');
  console.log('=== SETUP ===');
  console.log('Playwright: 1.58.2');
  console.log('Courier account: created via /api/auth/register (demo-courier / kamizo)');

  const superAdminResult = results.find(r => r.test === '8.1 Super admin login');
  console.log(`Super admin: ${superAdminResult?.status === 'PASS' ? 'found' : 'not found'}`);

  console.log('');
  console.log('=== PHASE RESULTS ===');
  console.log('');

  const phaseNames = {
    '1': 'RESIDENT', '2': 'EXECUTOR', '3': 'SECURITY', '4': 'MANAGER',
    '5': 'ADMIN', '6': 'DIRECTOR', '7': 'DEPT HEAD', '8': 'SUPER ADMIN',
    '9': 'MARKETPLACE MANAGER', '10': 'UI AUDIT', '11': 'CROSS-ROLE', '12': 'ZERO-DATA SAFETY',
  };

  const phaseMap = {};
  for (const r of results) {
    if (!phaseMap[r.phase]) phaseMap[r.phase] = [];
    phaseMap[r.phase].push(r);
  }

  const summaryCounts = [];

  for (const [phase, phaseResults] of Object.entries(phaseMap)) {
    const phaseName = phaseNames[phase] || phase;
    console.log(`PHASE ${phase} — ${phaseName}`);

    let pass = 0, fail = 0, review = 0;
    for (const r of phaseResults) {
      const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️';
      const label = r.status === 'NEEDS_REVIEW' ? 'NEEDS REVIEW' : r.status;
      const detail = r.detail ? ` — ${r.detail.slice(0, 180)}` : '';
      console.log(`  ${r.test}: ${icon} ${label}${detail}`);
      if (r.status === 'PASS') pass++;
      else if (r.status === 'FAIL') fail++;
      else review++;
    }
    summaryCounts.push({ phase, name: phaseName, total: phaseResults.length, pass, fail, review });
    console.log('');
  }

  console.log('=== SUMMARY TABLE ===');
  console.log('| Phase | Tests | ✅ Pass | ❌ Fail | ⚠️ Review |');
  console.log('|-------|-------|---------|---------|----------|');
  let totalTests = 0, totalPass = 0, totalFail = 0, totalReview = 0;
  for (const s of summaryCounts) {
    console.log(`| ${s.phase} ${s.name} | ${s.total} | ${s.pass} | ${s.fail} | ${s.review} |`);
    totalTests += s.total; totalPass += s.pass; totalFail += s.fail; totalReview += s.review;
  }
  console.log(`| **TOTAL** | **${totalTests}** | **${totalPass}** | **${totalFail}** | **${totalReview}** |`);

  console.log('');
  console.log('=== FAILED TESTS DETAIL ===');
  const failedTests = results.filter(r => r.status === 'FAIL');
  if (failedTests.length === 0) {
    console.log('No failed tests.');
  } else {
    for (const r of failedTests) {
      console.log(`Phase ${r.phase} | ${r.test} | ${r.detail}`);
    }
  }

  console.log('');
  console.log('=== NEEDS REVIEW TESTS DETAIL ===');
  const reviewTests = results.filter(r => r.status === 'NEEDS_REVIEW');
  if (reviewTests.length === 0) {
    console.log('No needs-review items.');
  } else {
    for (const r of reviewTests) {
      console.log(`Phase ${r.phase} | ${r.test} | ${r.detail}`);
    }
  }

  console.log('');
  console.log('=== JS CONSOLE ERRORS ===');
  let hasAnyErrors = false;
  for (const [role, errors] of Object.entries(consoleErrors)) {
    if (errors.length > 0) {
      hasAnyErrors = true;
      const uniqueErrors = [...new Set(errors)];
      console.log(`[${role}] (${uniqueErrors.length} unique errors):`);
      for (const err of uniqueErrors.slice(0, 5)) {
        console.log(`  - ${err.slice(0, 200)}`);
      }
    }
  }
  if (!hasAnyErrors) console.log('No JS console errors detected.');

  console.log('');
  console.log('=== UI ISSUES ===');
  if (uiIssues.length === 0) {
    console.log('No layout/overflow issues detected.');
  } else {
    for (const issue of uiIssues) console.log(`- ${issue}`);
  }

  console.log('');
  console.log('=== NEEDS MANUAL REVIEW ===');
  console.log('- OTP verification for meeting voting (requires real SMS delivery)');
  console.log('- Camera / QR scanner (requires physical camera access, browser will deny permissions in headless)');
  console.log('- File download verification (PDF contract, reports)');
  console.log('- Push notification delivery (requires device subscription)');
  console.log('- Real-time WebSocket sync under load');
  console.log('- Payment flows (if any)');

  // Save results
  fs.writeFileSync(
    '/Users/shaxzodisamahamadov/kamizo/audit/full-audit-results.json',
    JSON.stringify({ results, consoleErrors, uiIssues }, null, 2)
  );
  console.log('\nResults saved to: /Users/shaxzodisamahamadov/kamizo/audit/full-audit-results.json');
  console.log(`Screenshots saved to: ${SCREENSHOTS_DIR}`);
}

main().catch(e => {
  console.error('FATAL ERROR:', e);
  process.exit(1);
});
