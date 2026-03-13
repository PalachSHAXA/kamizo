import { chromium } from 'playwright';
import fs from 'fs';

const BASE = 'https://demo.kamizo.uz';
const PW = 'kamizo';
const S = '/Users/shaxzodisamahamadov/kamizo/audit/screenshots';
fs.mkdirSync(S, { recursive: true });

const findings = [];
function log(m) { console.log(`[T] ${m}`); }
function finding(screen, element, role, expected, actual, status) {
  findings.push({ screen, element, role, expected, actual, status });
  const icon = status === 'ok' ? '✅' : status === 'broken' ? '❌' : '⚠️';
  console.log(`  ${icon} [${screen}] ${element} — ${actual}`);
}

async function login(page, user) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.locator('input[type="text"]').first().fill(user);
  await page.locator('input[type="password"]').first().fill(PW);
  // Open offer
  try { await page.locator('text=публичной оферты').first().click({ timeout: 2000 }); } catch {
    try { await page.locator('text=ommaviy oferta').first().click({ timeout: 2000 }); } catch {}
  }
  await page.waitForTimeout(800);
  const modal = page.locator('.overflow-y-auto').first();
  if (await modal.isVisible().catch(() => false)) {
    await modal.evaluate(el => el.scrollTop = el.scrollHeight);
    await page.waitForTimeout(500);
    for (const b of await page.locator('button').all()) {
      const t = (await b.textContent() || '').trim();
      if ((t === 'Принять' || t === 'Qabul qilish') && await b.isEnabled()) { await b.click(); break; }
    }
    await page.waitForTimeout(300);
  }
  for (const b of await page.locator('button').all()) {
    const t = (await b.textContent() || '').trim();
    if (t === 'Войти' || t === 'Kirish') { await b.click(); break; }
  }
  await page.waitForTimeout(4000);
  const ok = await page.locator('nav').first().isVisible().catch(() => false);
  if (ok) finding('Login', user, 'all', 'Login succeeds', 'OK', 'ok');
  else finding('Login', user, 'all', 'Login succeeds', 'FAILED', 'broken');
  return ok;
}

async function relogin(page, user) {
  if (await page.locator('nav').first().isVisible().catch(() => false)) return true;
  log(`  Re-login needed for ${user}...`);
  return await login(page, user);
}

async function nav(page, path, user) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(1500);
  if (!(await relogin(page, user))) return false;
  if (!page.url().includes(path)) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1500);
  }
  return true;
}

// ===== List ALL clickable elements =====
async function listElements(page, label) {
  const els = await page.evaluate(() => {
    const results = [];
    for (const el of document.querySelectorAll('button, a, [role="button"], [onclick], [class*="cursor-pointer"]')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const text = (el.textContent || '').trim().slice(0, 80);
      const aria = el.getAttribute('aria-label') || '';
      const tag = el.tagName.toLowerCase();
      const cls = (el.className || '').toString().slice(0, 100);
      const svg = el.querySelector('svg')?.innerHTML?.slice(0, 60) || '';
      results.push({ text, aria, tag, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), cls, svg });
    }
    return results;
  });
  log(`  ${label}: ${els.length} clickable elements found`);
  // Log first 20 for debugging
  els.slice(0, 25).forEach((e, i) => {
    const label = e.text.slice(0, 40) || e.aria || `[${e.tag} ${e.w}x${e.h}]`;
    console.log(`    ${i}: (${e.x},${e.y}) ${label}`);
  });
  return els;
}

async function run() {
  const browser = await chromium.launch({ headless: true });

  // ===== MANAGER TESTS =====
  log('\n=== MANAGER TESTS ===');
  const mCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ru-RU' });
  const mPage = await mCtx.newPage();
  mPage.on('pageerror', () => {});

  if (await login(mPage, 'demo-manager')) {
    // 1. Dashboard
    log('\n--- Dashboard ---');
    await mPage.screenshot({ path: `${S}/final-dashboard-manager.png` });
    await listElements(mPage, 'Dashboard');

    // Test stat card click
    const statCards = await mPage.locator('.cursor-pointer').all();
    log(`  Stat cards with cursor-pointer: ${statCards.length}`);
    for (const card of statCards.slice(0, 4)) {
      const box = await card.boundingBox();
      if (!box || box.width < 100) continue;
      const text = (await card.textContent() || '').trim().slice(0, 30);
      const before = mPage.url();
      await card.click({ timeout: 2000 }).catch(() => {});
      await mPage.waitForTimeout(1000);
      const after = mPage.url();
      finding('Dashboard', `Stat card "${text}"`, 'manager', 'Navigates', after !== before ? `→ ${after.replace(BASE, '')}` : 'No nav', after !== before ? 'ok' : 'broken');
      if (after !== before) { await mPage.goBack().catch(() => {}); await mPage.waitForTimeout(500); }
    }

    // Dashboard tabs (Обзор / Отчёты)
    try {
      const obzor = mPage.locator('button:has-text("Обзор")').first();
      if (await obzor.isVisible({ timeout: 2000 })) {
        await obzor.click(); await mPage.waitForTimeout(600);
        finding('Dashboard', 'Tab "Обзор"', 'manager', 'Switches view', 'Clicked', 'ok');
      }
      const otchety = mPage.locator('button:has-text("Отчёты")').first();
      if (await otchety.isVisible({ timeout: 2000 })) {
        await otchety.click(); await mPage.waitForTimeout(600);
        finding('Dashboard', 'Tab "Отчёты"', 'manager', 'Switches view', 'Clicked', 'ok');
      }
    } catch {}

    // 2. Chat
    log('\n--- Chat ---');
    if (await nav(mPage, '/chat', 'demo-manager')) {
      await mPage.screenshot({ path: `${S}/final-chat-manager.png` });
      await listElements(mPage, 'Chat');

      // Click first channel
      const channels = await mPage.locator('[class*="cursor-pointer"]').all();
      let channelOpened = false;
      for (const ch of channels.slice(0, 10)) {
        const box = await ch.boundingBox();
        if (!box || box.width < 150 || box.height < 40) continue;
        await ch.click().catch(() => {});
        await mPage.waitForTimeout(2000);
        channelOpened = true;
        finding('Chat', 'Channel click', 'manager', 'Opens', 'Clicked', 'ok');
        break;
      }

      await mPage.screenshot({ path: `${S}/final-chat-channel-manager.png` });

      // Find ALL inputs
      const allInputs = await mPage.locator('input, textarea').all();
      log(`  All inputs on chat page: ${allInputs.length}`);
      for (const inp of allInputs) {
        const vis = await inp.isVisible().catch(() => false);
        const ph = await inp.getAttribute('placeholder') || '';
        const type = await inp.getAttribute('type') || '';
        log(`    Input: visible=${vis} type=${type} placeholder="${ph}"`);
      }

      // Try any visible input
      let msgSent = false;
      for (const inp of allInputs) {
        if (!(await inp.isVisible().catch(() => false))) continue;
        const type = await inp.getAttribute('type') || '';
        if (type === 'file' || type === 'hidden') continue;
        await inp.fill('Audit test message').catch(() => {});
        await mPage.waitForTimeout(500);

        // Find send button
        for (const btn of await mPage.locator('button:visible').all()) {
          const html = await btn.innerHTML().catch(() => '');
          if (/send|Send|arrow|Arrow/i.test(html) || (await btn.getAttribute('type')) === 'submit') {
            let apiHit = false;
            mPage.on('request', r => { if (r.url().includes('/api/')) apiHit = true; });
            await btn.click().catch(() => {});
            await mPage.waitForTimeout(2000);
            finding('Chat', 'Send message', 'manager', 'API call', apiHit ? 'API called' : 'No API', apiHit ? 'ok' : 'review');
            msgSent = true;
            break;
          }
        }
        if (msgSent) break;
      }
      if (!msgSent && channelOpened) {
        finding('Chat', 'Message send flow', 'manager', 'Works', 'Could not find input+send', 'broken');
      }

      await mPage.screenshot({ path: `${S}/final-chat-after-manager.png` });
    }

    // 3. Announcements
    log('\n--- Announcements ---');
    if (await nav(mPage, '/announcements', 'demo-manager')) {
      await mPage.screenshot({ path: `${S}/final-announcements-manager.png` });
      await listElements(mPage, 'Announcements');

      // Find create button
      let createFound = false;
      for (const btn of await mPage.locator('button:visible').all()) {
        const text = (await btn.textContent() || '').trim();
        const html = await btn.innerHTML().catch(() => '');
        if (/создат|добав|yangi|plus|Plus/i.test(text + html)) {
          const before = mPage.url();
          await btn.click().catch(() => {});
          await mPage.waitForTimeout(1500);
          const modal = await mPage.locator('.fixed.inset-0:visible, [role="dialog"]:visible').first().isVisible().catch(() => false);
          finding('Announcements', 'Create button', 'manager', 'Opens form', modal ? 'Modal opened' : 'No modal', modal ? 'ok' : 'broken');
          createFound = true;
          await mPage.screenshot({ path: `${S}/final-announcements-create-manager.png` });
          await mPage.keyboard.press('Escape');
          await mPage.waitForTimeout(300);
          break;
        }
      }
      if (!createFound) finding('Announcements', 'Create button', 'manager', 'Visible', 'NOT FOUND on page', 'broken');
    }

    // 4. Meetings
    log('\n--- Meetings ---');
    if (await nav(mPage, '/meetings', 'demo-manager')) {
      await mPage.screenshot({ path: `${S}/final-meetings-manager.png` });
      await listElements(mPage, 'Meetings');

      for (const btn of await mPage.locator('button:visible').all()) {
        const text = (await btn.textContent() || '').trim();
        if (/назначить|создат|yangi/i.test(text)) {
          await btn.click().catch(() => {});
          await mPage.waitForTimeout(1500);
          const modal = await mPage.locator('.fixed.inset-0:visible, [role="dialog"]:visible').first().isVisible().catch(() => false);
          finding('Meetings', `"${text}" button`, 'manager', 'Opens form', modal ? 'Modal opened' : 'No modal', modal ? 'ok' : 'broken');
          await mPage.screenshot({ path: `${S}/final-meetings-create-manager.png` });
          await mPage.keyboard.press('Escape');
          break;
        }
      }
    }

    // 5. Requests
    log('\n--- Requests ---');
    if (await nav(mPage, '/requests', 'demo-manager')) {
      await mPage.screenshot({ path: `${S}/final-requests-manager.png` });
      await listElements(mPage, 'Requests');

      // Try clicking request cards
      const cards = await mPage.locator('[class*="cursor-pointer"]').all();
      for (const card of cards.slice(0, 3)) {
        const box = await card.boundingBox();
        if (!box || box.width < 200 || box.height < 40) continue;
        const text = (await card.textContent() || '').trim().slice(0, 40);
        await card.click().catch(() => {});
        await mPage.waitForTimeout(1500);
        const modal = await mPage.locator('.fixed.inset-0:visible').first().isVisible().catch(() => false);
        finding('Requests', `Card "${text}"`, 'manager', 'Opens detail', modal ? 'Modal opened' : 'Some response', modal ? 'ok' : 'review');
        if (modal) { await mPage.keyboard.press('Escape'); await mPage.waitForTimeout(300); }
        break;
      }
    }

    // 6. Vehicle Search
    log('\n--- Vehicle Search ---');
    if (await nav(mPage, '/vehicle-search', 'demo-manager')) {
      await mPage.screenshot({ path: `${S}/final-vehicle-search-manager.png` });
      await listElements(mPage, 'VehicleSearch');

      const inputs = await mPage.locator('input:visible').all();
      log(`  Visible inputs: ${inputs.length}`);
      for (const inp of inputs) {
        const ph = (await inp.getAttribute('placeholder')) || '';
        log(`    placeholder: "${ph}"`);
      }
      if (inputs.length > 0) {
        await inputs[0].fill('01A');
        let apiHit = false;
        mPage.on('request', r => { if (r.url().includes('/api/')) apiHit = true; });
        await inputs[0].press('Enter');
        await mPage.waitForTimeout(2000);
        finding('VehicleSearch', 'Search', 'manager', 'API call', apiHit ? 'API called' : 'No API on Enter', apiHit ? 'ok' : 'review');
        // Try search button
        if (!apiHit) {
          for (const btn of await mPage.locator('button:visible').all()) {
            const html = await btn.innerHTML().catch(() => '');
            if (/search|Search|поиск|Поиск/i.test(html + (await btn.textContent() || ''))) {
              await btn.click().catch(() => {});
              await mPage.waitForTimeout(2000);
              finding('VehicleSearch', 'Search button', 'manager', 'API call', 'Button clicked', 'ok');
              break;
            }
          }
        }
        await mPage.screenshot({ path: `${S}/final-vehicle-search-result-manager.png` });
      }
    }

    // 7. Notifications
    log('\n--- Notifications ---');
    await nav(mPage, '/', 'demo-manager');
    for (const btn of await mPage.locator('button:visible').all()) {
      const box = await btn.boundingBox();
      if (!box || box.y > 60) continue;
      const html = await btn.innerHTML().catch(() => '');
      if (/bell|Bell/i.test(html)) {
        await btn.click();
        await mPage.waitForTimeout(1500);
        await mPage.screenshot({ path: `${S}/final-notifications-manager.png` });
        const panel = await mPage.locator('.fixed.inset-0:visible').first().isVisible().catch(() => false);
        finding('Notifications', 'Bell click', 'manager', 'Opens panel', panel ? 'Panel' : 'No panel', panel ? 'ok' : 'broken');
        await mPage.keyboard.press('Escape');
        break;
      }
    }

    // 8. Profile
    log('\n--- Profile ---');
    if (await nav(mPage, '/profile', 'demo-manager')) {
      await mPage.screenshot({ path: `${S}/final-profile-manager.png` });
      await listElements(mPage, 'Profile');
    }

    // 9. Work Orders (uses mock data per code analysis)
    log('\n--- Work Orders ---');
    if (await nav(mPage, '/work-orders', 'demo-manager')) {
      await mPage.screenshot({ path: `${S}/final-work-orders-manager.png` });
      await listElements(mPage, 'WorkOrders');
    }

    // 10. Settings
    log('\n--- Settings ---');
    if (await nav(mPage, '/settings', 'demo-manager')) {
      await mPage.screenshot({ path: `${S}/final-settings-manager.png` });
      await listElements(mPage, 'Settings');
    }
  }
  await mCtx.close();

  // ===== RESIDENT TESTS =====
  log('\n=== RESIDENT TESTS ===');
  await new Promise(r => setTimeout(r, 5000));
  const rCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ru-RU' });
  const rPage = await rCtx.newPage();
  rPage.on('pageerror', () => {});

  if (await login(rPage, 'demo-resident1')) {
    log('\n--- Resident Dashboard ---');
    await rPage.screenshot({ path: `${S}/final-dashboard-resident.png` });
    await listElements(rPage, 'ResidentDashboard');

    // Test service cards
    const cards = await rPage.locator('[class*="cursor-pointer"]').all();
    log(`  cursor-pointer elements: ${cards.length}`);
    for (const card of cards.slice(0, 5)) {
      const box = await card.boundingBox();
      if (!box || box.width < 80) continue;
      const text = (await card.textContent() || '').trim().slice(0, 30);
      const before = rPage.url();
      await card.click({ timeout: 2000 }).catch(() => {});
      await rPage.waitForTimeout(1000);
      const after = rPage.url();
      const modal = await rPage.locator('.fixed.inset-0:visible').first().isVisible().catch(() => false);
      finding('ResidentDash', `"${text}"`, 'resident', 'Responds', after !== before ? `→ ${after.replace(BASE, '')}` : modal ? 'Modal' : 'No change', (after !== before || modal) ? 'ok' : 'review');
      if (after !== before) { await rPage.goBack().catch(() => {}); await rPage.waitForTimeout(500); }
      if (modal) { await rPage.keyboard.press('Escape'); await rPage.waitForTimeout(300); }
    }

    // Create request (resident)
    log('\n--- Resident Create Request ---');
    // Look for create button on dashboard
    for (const btn of await rPage.locator('button:visible').all()) {
      const text = (await btn.textContent() || '').trim();
      if (/создат|новая|заявк/i.test(text)) {
        await btn.click().catch(() => {});
        await rPage.waitForTimeout(1500);
        const modal = await rPage.locator('.fixed.inset-0:visible').first().isVisible().catch(() => false);
        finding('ResidentDash', `Create request "${text}"`, 'resident', 'Opens form', modal ? 'Form opened' : 'No form', modal ? 'ok' : 'broken');
        await rPage.screenshot({ path: `${S}/final-create-request-resident.png` });
        await rPage.keyboard.press('Escape');
        break;
      }
    }

    // Guest access
    log('\n--- Guest Access ---');
    if (await nav(rPage, '/guest-access', 'demo-resident1')) {
      await rPage.screenshot({ path: `${S}/final-guest-access-resident.png` });
      await listElements(rPage, 'GuestAccess');

      for (const btn of await rPage.locator('button:visible').all()) {
        const text = (await btn.textContent() || '').trim();
        if (/создат|новый|пригласи|qr|invite/i.test(text.toLowerCase())) {
          await btn.click().catch(() => {});
          await rPage.waitForTimeout(1500);
          finding('GuestAccess', `"${text}"`, 'resident', 'Responds', 'Clicked', 'ok');
          await rPage.screenshot({ path: `${S}/final-guest-create-resident.png` });
          await rPage.keyboard.press('Escape');
          break;
        }
      }
    }

    // Rate employees
    log('\n--- Rate Employees ---');
    if (await nav(rPage, '/rate-employees', 'demo-resident1')) {
      await rPage.screenshot({ path: `${S}/final-rate-employees-resident.png` });
      await listElements(rPage, 'RateEmployees');
    }

    // Contract
    log('\n--- Contract ---');
    if (await nav(rPage, '/contract', 'demo-resident1')) {
      await rPage.screenshot({ path: `${S}/final-contract-resident.png` });
    }

    // Vehicles
    log('\n--- My Vehicles ---');
    if (await nav(rPage, '/vehicles', 'demo-resident1')) {
      await rPage.screenshot({ path: `${S}/final-vehicles-resident.png` });
      await listElements(rPage, 'Vehicles');
    }
  }
  await rCtx.close();

  // ===== EXECUTOR TESTS =====
  log('\n=== EXECUTOR TESTS ===');
  await new Promise(r => setTimeout(r, 5000));
  const eCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ru-RU' });
  const ePage = await eCtx.newPage();
  ePage.on('pageerror', () => {});

  if (await login(ePage, 'demo-executor')) {
    await ePage.screenshot({ path: `${S}/final-dashboard-executor.png` });
    await listElements(ePage, 'ExecutorDashboard');

    // Schedule
    if (await nav(ePage, '/schedule', 'demo-executor')) {
      await ePage.screenshot({ path: `${S}/final-schedule-executor.png` });
    }
    // Stats
    if (await nav(ePage, '/stats', 'demo-executor')) {
      await ePage.screenshot({ path: `${S}/final-stats-executor.png` });
    }
  }
  await eCtx.close();

  // ===== SECURITY TESTS =====
  log('\n=== SECURITY TESTS ===');
  await new Promise(r => setTimeout(r, 5000));
  const sCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ru-RU' });
  const sPage = await sCtx.newPage();
  sPage.on('pageerror', () => {});

  if (await login(sPage, 'demo-security')) {
    await sPage.screenshot({ path: `${S}/final-dashboard-security.png` });
    await listElements(sPage, 'SecurityDashboard');

    // QR Scanner
    if (await nav(sPage, '/qr-scanner', 'demo-security')) {
      await sPage.screenshot({ path: `${S}/final-qr-scanner-security.png` });
      await listElements(sPage, 'QRScanner');
    }
  }
  await sCtx.close();

  await browser.close();

  // Write results
  fs.writeFileSync('/Users/shaxzodisamahamadov/kamizo/audit/targeted-results.json', JSON.stringify(findings, null, 2));

  // Quick summary
  const ok = findings.filter(f => f.status === 'ok').length;
  const broken = findings.filter(f => f.status === 'broken').length;
  const review = findings.filter(f => f.status === 'review').length;
  console.log(`\n=== RESULTS: ${findings.length} total, ${ok} ✅, ${broken} ❌, ${review} ⚠️ ===`);
  findings.filter(f => f.status !== 'ok').forEach(f => {
    console.log(`  ${f.status === 'broken' ? '❌' : '⚠️'} [${f.screen}] ${f.element} — ${f.actual}`);
  });
}

run().catch(e => console.error('FATAL:', e));
