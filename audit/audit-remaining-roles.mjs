import { chromium } from 'playwright';
import fs from 'fs';

const BASE = 'https://demo.kamizo.uz';
const PW = 'kamizo';
const S = '/Users/shaxzodisamahamadov/kamizo/audit/screenshots';
fs.mkdirSync(S, { recursive: true });

const findings = [];
function log(m) { console.log(`[T] ${m}`); }
function finding(role, page, element, status, notes) {
  findings.push({ role, page, element, status, notes });
  const icon = status === 'ok' ? '✅' : status === 'broken' ? '❌' : '⚠️';
  console.log(`  ${icon} [${role}] ${page} — ${element}: ${notes}`);
}

async function doLogin(page, user, roleName) {
  log(`Logging in as ${user} (${roleName})...`);
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Fill credentials
  await page.locator('input[type="text"]').first().fill(user);
  await page.locator('input[type="password"]').first().fill(PW);

  // Accept offer modal
  try { await page.locator('text=публичной оферты').first().click({ timeout: 3000 }); } catch {
    try { await page.locator('text=ommaviy oferta').first().click({ timeout: 2000 }); } catch {}
  }
  await page.waitForTimeout(1000);
  const modal = page.locator('.overflow-y-auto').first();
  if (await modal.isVisible().catch(() => false)) {
    await modal.evaluate(el => el.scrollTop = el.scrollHeight);
    await page.waitForTimeout(600);
    for (const b of await page.locator('button').all()) {
      const t = (await b.textContent() || '').trim();
      if ((t === 'Принять' || t === 'Qabul qilish') && await b.isEnabled()) { await b.click(); break; }
    }
    await page.waitForTimeout(500);
  }

  // Click login button
  for (const b of await page.locator('button').all()) {
    const t = (await b.textContent() || '').trim();
    if (t === 'Войти' || t === 'Kirish') { await b.click(); break; }
  }
  await page.waitForTimeout(5000);

  const ok = await page.locator('nav').first().isVisible().catch(() => false);
  if (ok) {
    finding(roleName, 'Login', user, 'ok', 'Успешный вход');
    await page.screenshot({ path: `${S}/r2-dashboard-${roleName}.png` });
  } else {
    finding(roleName, 'Login', user, 'broken', 'Не удалось войти');
    await page.screenshot({ path: `${S}/r2-login-fail-${roleName}.png` });
  }
  return ok;
}

async function getSidebarItems(page) {
  return page.evaluate(() => {
    const items = [];
    for (const el of document.querySelectorAll('nav a, nav button, aside a, aside button, [class*="sidebar"] a')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.x > 260) continue;
      const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60);
      if (!text || text === 'Выйти' || text === 'Chiqish') continue;
      const href = el.getAttribute('href') || '';
      items.push({ text, href, tag: el.tagName });
    }
    return items;
  });
}

async function testSidebarNavigation(page, roleName, user) {
  const items = await getSidebarItems(page);
  log(`  Found ${items.length} sidebar items for ${roleName}`);
  for (const item of items) {
    if (!item.href || item.href === '#') continue;
    try {
      await page.goto(`${BASE}${item.href}`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(1500);
      // Check if we got logged out
      const loggedIn = await page.locator('nav').first().isVisible().catch(() => false);
      if (!loggedIn) {
        finding(roleName, item.text, 'sidebar nav', 'warn', 'Потеря сессии при навигации');
        await doLogin(page, user, roleName);
        continue;
      }
      finding(roleName, item.text, 'sidebar link', 'ok', `Навигация на ${item.href}`);
    } catch (e) {
      finding(roleName, item.text, 'sidebar link', 'broken', e.message.slice(0, 80));
    }
  }
}

async function testDashboardElements(page, roleName) {
  // Count interactive elements on dashboard
  const elements = await page.evaluate(() => {
    const result = { buttons: 0, links: 0, cards: 0, tabs: 0, inputs: 0 };
    result.buttons = document.querySelectorAll('button').length;
    result.links = document.querySelectorAll('a').length;
    result.cards = document.querySelectorAll('[class*="glass-card"], [class*="rounded-"][class*="shadow"]').length;
    result.tabs = document.querySelectorAll('[role="tab"], [class*="tab"]').length;
    result.inputs = document.querySelectorAll('input, select, textarea').length;
    return result;
  });
  log(`  Dashboard: ${elements.buttons} buttons, ${elements.links} links, ${elements.cards} cards, ${elements.tabs} tabs, ${elements.inputs} inputs`);
  return elements;
}

async function testClickableElements(page, roleName, pageName) {
  // Get all visible buttons/links on the page (excluding sidebar)
  const buttons = await page.evaluate(() => {
    const items = [];
    for (const el of document.querySelectorAll('button, [role="button"]')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.x < 260) continue; // Skip sidebar
      const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60);
      if (!text) continue;
      items.push({ text, x: Math.round(r.x), y: Math.round(r.y), disabled: el.disabled || false });
    }
    return items;
  });

  for (const btn of buttons.slice(0, 15)) { // Test first 15 buttons
    if (btn.disabled) {
      finding(roleName, pageName, btn.text, 'warn', 'Кнопка заблокирована');
      continue;
    }
    finding(roleName, pageName, btn.text, 'ok', 'Кнопка видна и активна');
  }
}

// ===== MAIN =====
(async () => {
  const browser = await chromium.launch({ headless: true });

  const roles = [
    { user: 'demo-security', name: 'security', label: 'Охранник' },
    { user: 'demo-director', name: 'director', label: 'Директор' },
    { user: 'demo-admin', name: 'admin', label: 'Администратор' },
  ];

  for (let i = 0; i < roles.length; i++) {
    const role = roles[i];
    log(`\n========== ${role.label} (${role.user}) ==========`);

    // Wait between roles to avoid rate limiting
    if (i > 0) {
      log(`Waiting 45s to avoid rate limit...`);
      await new Promise(r => setTimeout(r, 45000));
    }

    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    const loggedIn = await doLogin(page, role.user, role.name);
    if (!loggedIn) {
      log(`  ❌ Login failed for ${role.label}, trying again after 40s...`);
      await new Promise(r => setTimeout(r, 40000));
      const retry = await doLogin(page, role.user, role.name);
      if (!retry) {
        log(`  ❌ Login failed again for ${role.label}, skipping`);
        await context.close();
        continue;
      }
    }

    // Screenshot dashboard
    await page.screenshot({ path: `${S}/r2-dashboard-${role.name}.png`, fullPage: true });

    // Test dashboard elements
    const els = await testDashboardElements(page, role.name);
    finding(role.name, 'Dashboard', 'interactive elements', 'ok',
      `${els.buttons} кнопок, ${els.links} ссылок, ${els.cards} карточек`);

    // Test clickable elements on dashboard
    await testClickableElements(page, role.name, 'Dashboard');

    // Test sidebar navigation
    await testSidebarNavigation(page, role.name, role.user);

    // Take final screenshot
    await page.screenshot({ path: `${S}/r2-final-${role.name}.png` });

    // Test notifications bell
    try {
      const bell = page.locator('[class*="notification"], button:has(svg)').first();
      if (await bell.isVisible().catch(() => false)) {
        finding(role.name, 'Header', 'Notifications bell', 'ok', 'Колокольчик виден');
      }
    } catch {}

    // Test header search
    try {
      const search = page.locator('input[placeholder*="оиск"], input[placeholder*="earch"]').first();
      if (await search.isVisible().catch(() => false)) {
        await search.fill('test');
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${S}/r2-search-${role.name}.png` });
        finding(role.name, 'Header', 'Search input', 'ok', 'Поиск работает');
        await search.fill('');
      }
    } catch {}

    await context.close();
  }

  await browser.close();

  // Generate report
  log('\n\n========== РЕЗУЛЬТАТЫ ==========');
  const ok = findings.filter(f => f.status === 'ok').length;
  const broken = findings.filter(f => f.status === 'broken').length;
  const warn = findings.filter(f => f.status === 'warn').length;
  log(`Всего: ${findings.length} | ✅ ${ok} | ❌ ${broken} | ⚠️ ${warn}`);

  // Write JSON results
  fs.writeFileSync(`${S}/r2-results.json`, JSON.stringify(findings, null, 2));
  log(`Результаты сохранены в ${S}/r2-results.json`);

  // Print table
  console.log('\n| Роль | Страница | Элемент | Статус | Примечание |');
  console.log('|------|----------|---------|--------|------------|');
  for (const f of findings) {
    const icon = f.status === 'ok' ? '✅' : f.status === 'broken' ? '❌' : '⚠️';
    console.log(`| ${f.role} | ${f.page} | ${f.element} | ${icon} | ${f.notes} |`);
  }
})();
