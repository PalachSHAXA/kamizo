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

  for (const b of await page.locator('button').all()) {
    const t = (await b.textContent() || '').trim();
    if (t === 'Войти' || t === 'Kirish') { await b.click(); break; }
  }
  await page.waitForTimeout(5000);

  const ok = await page.locator('nav').first().isVisible().catch(() => false);
  if (ok) {
    finding(roleName, 'Login', user, 'ok', 'Успешный вход');
    await page.screenshot({ path: `${S}/r3-dashboard-${roleName}.png`, fullPage: true });
  } else {
    finding(roleName, 'Login', user, 'broken', 'Не удалось войти');
    await page.screenshot({ path: `${S}/r3-login-fail-${roleName}.png`, fullPage: true });
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
  finding(roleName, 'Sidebar', 'menu items', 'ok', `${items.length} пунктов меню`);

  for (const item of items) {
    if (!item.href || item.href === '#') continue;
    try {
      await page.goto(`${BASE}${item.href}`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(1500);
      const loggedIn = await page.locator('nav').first().isVisible().catch(() => false);
      if (!loggedIn) {
        finding(roleName, item.text, 'sidebar nav', 'broken', 'Потеря сессии при навигации');
        await doLogin(page, user, roleName);
        continue;
      }

      // Check for error states on the page
      const hasError = await page.evaluate(() => {
        const body = document.body.innerText;
        return body.includes('Ошибка') || body.includes('Error') || body.includes('404') || body.includes('500');
      });

      if (hasError) {
        await page.screenshot({ path: `${S}/r3-error-${roleName}-${item.href.replace(/\//g, '_')}.png` });
        finding(roleName, item.text, 'page content', 'warn', `Возможная ошибка на ${item.href}`);
      } else {
        finding(roleName, item.text, 'sidebar link', 'ok', `Навигация на ${item.href}`);
      }
    } catch (e) {
      finding(roleName, item.text, 'sidebar link', 'broken', e.message.slice(0, 80));
    }
  }
}

async function testDashboardButtons(page, roleName) {
  const buttons = await page.evaluate(() => {
    const items = [];
    for (const el of document.querySelectorAll('button, [role="button"], a[href]')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.x < 260) continue;
      const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60);
      if (!text) continue;
      items.push({ text, tag: el.tagName, disabled: el.disabled || false });
    }
    return items;
  });

  log(`  Dashboard: ${buttons.length} interactive elements`);
  finding(roleName, 'Dashboard', 'interactive elements', 'ok', `${buttons.length} элементов`);

  // Report disabled buttons
  const disabled = buttons.filter(b => b.disabled);
  if (disabled.length > 0) {
    finding(roleName, 'Dashboard', 'disabled buttons', 'warn',
      `${disabled.length} заблокировано: ${disabled.map(b => b.text).join(', ').slice(0, 100)}`);
  }
}

async function testChatPage(page, roleName) {
  try {
    await page.goto(`${BASE}/chat`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);

    const loggedIn = await page.locator('nav').first().isVisible().catch(() => false);
    if (!loggedIn) {
      finding(roleName, 'Chat', 'page', 'broken', 'Потеря сессии');
      return;
    }

    // Check if chat loaded
    const hasChatUI = await page.evaluate(() => {
      return document.querySelectorAll('[class*="chat"], [class*="message"], [class*="channel"]').length > 0;
    });

    if (hasChatUI) {
      finding(roleName, 'Chat', 'UI', 'ok', 'Чат загружен');

      // Test search button
      const searchBtn = await page.locator('button:has(svg)').filter({ hasText: /search|поиск/i }).first();
      const hasSearch = await searchBtn.isVisible().catch(() => false);
      if (hasSearch) {
        finding(roleName, 'Chat', 'search button', 'ok', 'Кнопка поиска видна');
      }
    } else {
      finding(roleName, 'Chat', 'UI', 'warn', 'Чат пуст или нет каналов');
    }

    await page.screenshot({ path: `${S}/r3-chat-${roleName}.png` });
  } catch (e) {
    finding(roleName, 'Chat', 'page', 'broken', e.message.slice(0, 80));
  }
}

async function testRequestsPage(page, roleName) {
  try {
    await page.goto(`${BASE}/requests`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);

    const loggedIn = await page.locator('nav').first().isVisible().catch(() => false);
    if (!loggedIn) {
      finding(roleName, 'Requests', 'page', 'broken', 'Потеря сессии');
      return;
    }

    const hasRequests = await page.evaluate(() => {
      return document.querySelectorAll('[class*="card"], [class*="request"], table').length > 0;
    });

    finding(roleName, 'Requests', 'page', hasRequests ? 'ok' : 'warn',
      hasRequests ? 'Страница заявок загружена' : 'Нет заявок или пустая страница');

    await page.screenshot({ path: `${S}/r3-requests-${roleName}.png` });
  } catch (e) {
    finding(roleName, 'Requests', 'page', 'broken', e.message.slice(0, 80));
  }
}

// ===== MAIN =====
(async () => {
  const browser = await chromium.launch({ headless: true });

  const roles = [
    { user: 'demo-dept-head', name: 'dept-head', label: 'Глава отдела' },
    { user: 'demo-dispatcher', name: 'dispatcher', label: 'Диспетчер' },
    { user: 'demo-shop', name: 'shop', label: 'Менеджер магазина' },
    { user: 'demo-resident2', name: 'resident2', label: 'Житель Фарход' },
    { user: 'demo-resident3', name: 'resident3', label: 'Житель Малика' },
    { user: 'demo-electrician', name: 'electrician', label: 'Электрик' },
    { user: 'demo-tenant', name: 'tenant', label: 'Арендатор' },
  ];

  for (let i = 0; i < roles.length; i++) {
    const role = roles[i];
    log(`\n========== ${role.label} (${role.user}) ==========`);

    if (i > 0) {
      log(`Waiting 40s to avoid rate limit...`);
      await new Promise(r => setTimeout(r, 40000));
    }

    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    let loggedIn = await doLogin(page, role.user, role.name);
    if (!loggedIn) {
      log(`  ❌ Login failed, retrying after 40s...`);
      await new Promise(r => setTimeout(r, 40000));
      loggedIn = await doLogin(page, role.user, role.name);
      if (!loggedIn) {
        log(`  ❌ Login failed again, skipping ${role.label}`);
        await context.close();
        continue;
      }
    }

    // Test dashboard
    await testDashboardButtons(page, role.name);

    // Test sidebar navigation
    await testSidebarNavigation(page, role.name, role.user);

    // Test chat
    await testChatPage(page, role.name);

    // Test requests
    await testRequestsPage(page, role.name);

    await page.screenshot({ path: `${S}/r3-final-${role.name}.png` });
    await context.close();
  }

  await browser.close();

  // Summary
  log('\n\n========== РЕЗУЛЬТАТЫ ==========');
  const ok = findings.filter(f => f.status === 'ok').length;
  const broken = findings.filter(f => f.status === 'broken').length;
  const warn = findings.filter(f => f.status === 'warn').length;
  log(`Всего: ${findings.length} | ✅ ${ok} | ❌ ${broken} | ⚠️ ${warn}`);

  fs.writeFileSync(`${S}/r3-results.json`, JSON.stringify(findings, null, 2));
  log(`Результаты сохранены в ${S}/r3-results.json`);

  console.log('\n| Роль | Страница | Элемент | Статус | Примечание |');
  console.log('|------|----------|---------|--------|------------|');
  for (const f of findings) {
    const icon = f.status === 'ok' ? '✅' : f.status === 'broken' ? '❌' : '⚠️';
    console.log(`| ${f.role} | ${f.page} | ${f.element} | ${icon} | ${f.notes} |`);
  }
})();
