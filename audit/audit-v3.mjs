import { chromium } from 'playwright';
import fs from 'fs';

const BASE = 'https://demo.kamizo.uz';
const PW = 'kamizo';
const SHOTS = '/Users/shaxzodisamahamadov/kamizo/audit/screenshots';
fs.mkdirSync(SHOTS, { recursive: true });

const R = { total: 0, working: 0, broken: [], review: [] };

function log(m) { console.log(`[AUDIT] ${m}`); }

function rec(screen, el, role, expected, actual, st) {
  R.total++;
  if (st === 'ok') R.working++;
  else if (st === 'broken') R.broken.push({ screen, el, role, expected, actual });
  else R.review.push({ screen, el, role, expected, actual });
  console.log(`  ${st === 'ok' ? '✅' : st === 'broken' ? '❌' : '⚠️'} [${screen}] ${el} | ${role} | ${actual}`);
}

// ===== UI LOGIN (proven to work) =====
async function uiLogin(page, login) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);

  // Fill credentials
  await page.locator('input[type="text"]').first().fill(login);
  await page.locator('input[type="password"]').first().fill(PW);

  // Open offer modal by clicking the agreement area
  await page.locator('text=публичной оферты').first().click({ timeout: 3000 }).catch(async () => {
    await page.locator('text=ommaviy oferta').first().click({ timeout: 3000 }).catch(() => {});
  });
  await page.waitForTimeout(800);

  // Scroll offer to bottom
  const scrollable = page.locator('.overflow-y-auto').first();
  if (await scrollable.isVisible().catch(() => false)) {
    await scrollable.evaluate(el => el.scrollTop = el.scrollHeight);
    await page.waitForTimeout(600);
    // Click accept
    const acceptBtns = await page.locator('button').all();
    for (const b of acceptBtns) {
      const t = (await b.textContent() || '').trim();
      if (t === 'Принять' || t === 'Qabul qilish') {
        if (await b.isEnabled()) { await b.click(); break; }
      }
    }
    await page.waitForTimeout(500);
  }

  // Submit login
  const submitBtns = await page.locator('button[type="submit"], button').all();
  for (const b of submitBtns) {
    const t = (await b.textContent() || '').trim();
    if (t === 'Войти' || t === 'Kirish') {
      await b.click();
      break;
    }
  }

  await page.waitForTimeout(4000);

  // Check success
  const hasNav = await page.locator('nav').first().isVisible().catch(() => false);
  return hasNav;
}

// ===== FIND PAGE BUTTONS (excluding sidebar & login remnants) =====
async function getPageButtons(page) {
  return page.evaluate(() => {
    const skip = new Set(['Войти', 'Kirish', 'Показать пароль', 'Скрыть пароль', 'публичной оферты',
      'ommaviy oferta', 'Принять', 'Qabul qilish', 'Yopish', 'Закрыть', 'Выйти', 'Chiqish']);
    const demoPatterns = ['Direktor', 'Boshqaruvchi', 'Administrator', "Bo'lim", 'Dispetcher',
      "Do'kon", 'Aholi', 'Santexnik', 'Elektrik', "Qo'riqchi", 'Ijarachi'];

    const nav = document.querySelector('nav');
    const navRect = nav?.getBoundingClientRect();

    const items = [];
    for (const el of document.querySelectorAll('button, a[href], [role="button"]')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.top < 0) continue;
      // Skip if inside nav/sidebar
      if (navRect && r.left >= navRect.left - 5 && r.right <= navRect.right + 5 &&
          r.top >= navRect.top && r.bottom <= navRect.bottom) continue;

      const text = (el.textContent || '').trim().slice(0, 80);
      const aria = el.getAttribute('aria-label') || '';
      const label = text || aria;

      if (skip.has(label.trim())) continue;
      if (demoPatterns.some(p => label.includes(p))) continue;
      if (['🇷🇺RU', '🇺🇿UZ', '🇷🇺 RU', '🇺🇿 UZ', 'RU', 'UZ'].includes(label.trim())) continue;
      if (!label && r.width < 25) continue;

      items.push({
        label: label.slice(0, 60),
        aria, tag: el.tagName.toLowerCase(),
        href: el.getAttribute('href') || '',
        x: Math.round(r.x + r.width / 2),
        y: Math.round(r.y + r.height / 2),
        w: Math.round(r.width), h: Math.round(r.height),
      });
    }
    return items;
  });
}

// ===== TEST A SINGLE BUTTON =====
async function testBtn(page, el, screen, role) {
  const label = el.label || el.aria || `(${el.x},${el.y})`;
  try {
    const before = page.url();
    let net = false;
    const h = (req) => { if (req.url().includes('/api/')) net = true; };
    page.on('request', h);

    await page.mouse.click(el.x, el.y);
    await page.waitForTimeout(1200);
    page.off('request', h);

    const after = page.url();
    const modal = await page.locator('.fixed.inset-0:visible').first().isVisible().catch(() => false);
    const dropdown = await page.locator('.absolute:visible').count().catch(() => 0);

    const responded = after !== before || net || modal || dropdown > 2;

    if (responded) {
      rec(screen, `"${label}"`, role, 'Responds', 'OK', 'ok');
      if (after !== before) {
        await page.goBack({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(600);
      }
      if (modal) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
      }
    } else {
      rec(screen, `"${label}"`, role, 'Responds', 'NO RESPONSE — dead', 'broken');
    }
    return responded;
  } catch (e) {
    rec(screen, `"${label}"`, role, 'Responds', `Error: ${e.message.slice(0, 50)}`, 'review');
    return false;
  }
}

// ===== NAVIGATE VIA SIDEBAR =====
async function navTo(page, path, name, role) {
  try {
    // Direct navigation preserves localStorage auth
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1500);

    // Check we're still logged in
    const loggedIn = await page.locator('nav').first().isVisible().catch(() => false);
    if (!loggedIn) {
      rec(name, 'Page access', role, 'Loads', 'Session lost — redirected to login', 'broken');
      return false;
    }

    const bodyLen = (await page.textContent('body') || '').length;
    if (bodyLen < 100) {
      rec(name, 'Page load', role, 'Renders', 'Blank/minimal content', 'broken');
      return false;
    }

    rec(name, 'Page load', role, 'Renders', 'OK', 'ok');
    return true;
  } catch (e) {
    rec(name, 'Page load', role, 'Renders', `Error: ${e.message.slice(0, 50)}`, 'review');
    return false;
  }
}

// ===== AUDIT A PAGE =====
async function auditPage(page, path, name, role, maxBtns = 12) {
  const ok = await navTo(page, path, name, role);
  if (!ok) return;

  await page.screenshot({ path: `${SHOTS}/${name.toLowerCase().replace(/[/ ]/g, '-')}-${role}.png` });

  const btns = await getPageButtons(page);
  log(`  ${name}: ${btns.length} interactive elements`);

  const seen = new Set();
  let n = 0;
  for (const b of btns) {
    if (n >= maxBtns) break;
    const key = b.label || `${b.x}-${b.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!b.label && b.w < 30 && b.h < 30) continue;

    await testBtn(page, b, name, role);
    n++;

    // If navigated away, go back
    if (!page.url().endsWith(path) && !page.url().endsWith(path + '/')) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(800);
    }
  }
}

// ===== SPECIFIC MODULE TESTS =====

async function auditChat(page, role) {
  log(`  Chat: specific tests...`);
  const ok = await navTo(page, '/chat', 'Chat', role);
  if (!ok) return;

  await page.screenshot({ path: `${SHOTS}/chat-${role}.png` });

  // Click first conversation/channel
  const convs = await page.locator('.cursor-pointer, [class*="hover\\:bg"]').all();
  let opened = false;
  for (const c of convs.slice(0, 10)) {
    const box = await c.boundingBox();
    if (!box || box.width < 100 || box.height < 30 || box.x < 50) continue;
    try {
      await c.click({ timeout: 2000 });
      await page.waitForTimeout(1500);
      opened = true;
      rec('Chat', 'Open channel', role, 'Opens', 'OK', 'ok');
      break;
    } catch { continue; }
  }
  if (!opened) rec('Chat', 'Open channel', role, 'Opens', 'No clickable channel found', 'review');

  // Find message input
  const inputs = await page.locator('input:visible, textarea:visible').all();
  let msgInput = null;
  for (const inp of inputs) {
    const ph = (await inp.getAttribute('placeholder')) || '';
    if (/сообщ|напиш|yoz|message/i.test(ph)) { msgInput = inp; break; }
  }

  if (msgInput) {
    await msgInput.fill('Audit test');
    rec('Chat', 'Message input', role, 'Accepts text', 'OK', 'ok');

    // Send
    const sendBtn = page.locator('button[type="submit"]').first();
    if (await sendBtn.isVisible().catch(() => false)) {
      let netHit = false;
      page.on('request', (r) => { if (r.url().includes('/api/')) netHit = true; });
      await sendBtn.click();
      await page.waitForTimeout(2000);
      rec('Chat', 'Send message', role, 'Sends', netHit ? 'Message sent (API called)' : 'Button clicked, no API call', netHit ? 'ok' : 'review');
    }
  } else {
    rec('Chat', 'Message input', role, 'Exists', opened ? 'No input found after channel open' : 'No input (select channel first)', opened ? 'broken' : 'review');
  }

  // Emoji button
  const allBtns = await page.locator('button:visible').all();
  for (const btn of allBtns) {
    const html = await btn.innerHTML().catch(() => '');
    if (/smile|emoji/i.test(html)) {
      await btn.click().catch(() => {});
      await page.waitForTimeout(800);
      const picker = await page.locator('[class*="emoji"], [class*="picker"]').first().isVisible().catch(() => false);
      rec('Chat', 'Emoji button', role, 'Opens picker', picker ? 'OK' : 'No picker appeared', picker ? 'ok' : 'broken');
      await page.keyboard.press('Escape');
      break;
    }
  }

  // Attach file button
  for (const btn of allBtns) {
    const html = await btn.innerHTML().catch(() => '');
    if (/paperclip|attach|clip/i.test(html)) {
      rec('Chat', 'Attach button', role, 'Present', 'Found', 'ok');
      break;
    }
  }

  await page.screenshot({ path: `${SHOTS}/chat-detail-${role}.png` });
}

async function auditAnnouncements(page, role) {
  log(`  Announcements: specific tests...`);
  const ok = await navTo(page, '/announcements', 'Announcements', role);
  if (!ok) return;
  await page.screenshot({ path: `${SHOTS}/announcements-${role}.png` });

  // Create button (managers)
  if (['manager', 'admin', 'director'].includes(role)) {
    const btns = await getPageButtons(page);
    let found = false;
    for (const b of btns) {
      if (/создат|добав|новое|yangi/i.test(b.label)) {
        await testBtn(page, b, 'Announcements-Create', role);
        found = true;
        break;
      }
    }
    // Also check for plus icon buttons
    if (!found) {
      for (const b of btns) {
        const html = await page.evaluate(({x,y}) => {
          const el = document.elementFromPoint(x,y);
          return el?.innerHTML?.slice(0, 100) || '';
        }, {x: b.x, y: b.y});
        if (/plus|Plus/i.test(html)) {
          await testBtn(page, b, 'Announcements-Create', role);
          break;
        }
      }
    }
  }

  // Click announcement card
  const cards = await page.locator('.rounded-xl, .rounded-2xl, .rounded-lg').all();
  for (const card of cards) {
    const box = await card.boundingBox();
    if (!box || box.width < 200 || box.height < 60) continue;
    try {
      await card.click({ timeout: 2000 });
      await page.waitForTimeout(1000);
      rec('Announcements', 'Card click', role, 'Detail', 'Card responds', 'ok');
      break;
    } catch { continue; }
  }

  // Like/reaction (look for heart/thumbs)
  const btns = await page.locator('button:visible').all();
  for (const btn of btns) {
    const html = await btn.innerHTML().catch(() => '');
    if (/heart|Heart|thumbs|ThumbsUp/i.test(html)) {
      let netHit = false;
      page.on('request', r => { if (r.url().includes('/api/')) netHit = true; });
      await btn.click().catch(() => {});
      await page.waitForTimeout(1000);
      rec('Announcements', 'Like/reaction', role, 'Toggles', netHit ? 'API called' : 'Clicked, no API', netHit ? 'ok' : 'review');
      break;
    }
  }
}

async function auditMeetings(page, role) {
  log(`  Meetings: specific tests...`);
  const ok = await navTo(page, '/meetings', 'Meetings', role);
  if (!ok) return;
  await page.screenshot({ path: `${SHOTS}/meetings-${role}.png` });

  if (['manager', 'admin', 'director'].includes(role)) {
    const btns = await getPageButtons(page);
    for (const b of btns) {
      if (/создат|новое|назнач|yangi/i.test(b.label)) {
        await testBtn(page, b, 'Meetings-Create', role);
        break;
      }
    }
  }

  // Click meeting card
  const cards = await page.locator('.rounded-xl, .rounded-2xl, .bg-white.rounded').all();
  for (const card of cards) {
    const box = await card.boundingBox();
    if (!box || box.width < 200 || box.height < 50) continue;
    try {
      await card.click({ timeout: 2000 });
      await page.waitForTimeout(1000);
      rec('Meetings', 'Meeting card', role, 'Opens detail', 'Card responds', 'ok');
      await page.keyboard.press('Escape');
      break;
    } catch { continue; }
  }

  // RSVP buttons
  const allBtns = await page.locator('button:visible').all();
  for (const btn of allBtns) {
    const text = (await btn.textContent() || '').trim();
    if (/участву|приму|голосова|RSVP|ishtirok/i.test(text)) {
      await btn.click().catch(() => {});
      await page.waitForTimeout(800);
      rec('Meetings', 'RSVP/vote button', role, 'Responds', 'Button clicked', 'ok');
      break;
    }
  }
}

async function auditVehicleSearch(page, role) {
  log(`  Vehicle Search: specific tests...`);
  const ok = await navTo(page, '/vehicle-search', 'VehicleSearch', role);
  if (!ok) return;
  await page.screenshot({ path: `${SHOTS}/vehicle-search-${role}.png` });

  const inputs = await page.locator('input:visible').all();
  if (inputs.length > 0) {
    await inputs[0].fill('01A777AA');
    await inputs[0].press('Enter');
    await page.waitForTimeout(2000);
    rec('VehicleSearch', 'Search by plate', role, 'Executes search', 'OK', 'ok');
    await page.screenshot({ path: `${SHOTS}/vehicle-search-result-${role}.png` });
  } else {
    rec('VehicleSearch', 'Search input', role, 'Exists', 'No input found', 'broken');
  }
}

async function auditNotifications(page, role) {
  log(`  Notifications test...`);
  // Navigate to dashboard first
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);

  const btns = await page.locator('button:visible').all();
  for (const btn of btns) {
    const box = await btn.boundingBox();
    if (!box || box.y > 65 || box.width > 150) continue;
    const html = await btn.innerHTML().catch(() => '');
    if (/bell|Bell/i.test(html)) {
      await btn.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${SHOTS}/notifications-${role}.png` });

      const panel = await page.locator('.fixed:visible').count();
      rec('Notifications', 'Bell click', role, 'Opens panel', panel > 0 ? 'Panel opened' : 'No panel', panel > 0 ? 'ok' : 'broken');

      // Try mark all read
      const allBtns2 = await page.locator('button:visible').all();
      for (const b of allBtns2) {
        const t = (await b.textContent() || '').trim();
        if (/прочитан|o.qilgan|очист|clear|mark.*read/i.test(t)) {
          await b.click().catch(() => {});
          await page.waitForTimeout(800);
          rec('Notifications', 'Mark read', role, 'Responds', 'Clicked', 'ok');
          break;
        }
      }

      await page.keyboard.press('Escape');
      return;
    }
  }
  rec('Notifications', 'Bell icon', role, 'Exists', 'Not found', 'review');
}

async function auditFormValidation(page, role) {
  log(`  Form validation test...`);
  const ok = await navTo(page, '/requests', 'FormValidation', role);
  if (!ok) return;

  // Find create/new button
  const btns = await getPageButtons(page);
  let formOpened = false;
  for (const b of btns) {
    if (/создат|новая|новый|yangi/i.test(b.label) || b.label === '') {
      const html = await page.evaluate(({x,y}) => {
        const el = document.elementFromPoint(x,y);
        return el?.innerHTML?.slice(0, 100) || '';
      }, {x: b.x, y: b.y});
      if (/plus|Plus/i.test(html) || /создат|новая|yangi/i.test(b.label)) {
        await page.mouse.click(b.x, b.y);
        await page.waitForTimeout(1500);
        formOpened = true;
        break;
      }
    }
  }

  if (!formOpened) {
    rec('FormValidation', 'Create button', role, 'Opens form', 'Not found', 'review');
    return;
  }

  // Try submit empty
  const submitBtns = await page.locator('button:visible').all();
  for (const btn of submitBtns) {
    const text = (await btn.textContent() || '').trim();
    if (/отправ|создат|сохран|yuborish|saqlash|submit/i.test(text)) {
      await btn.click();
      await page.waitForTimeout(1500);
      const hasValidation = await page.locator('.text-red-500, .text-red-600, .border-red-500, [class*="error"], [role="alert"]').first().isVisible().catch(() => false);
      rec('FormValidation', 'Empty submit', role, 'Shows validation', hasValidation ? 'Validation shown' : 'No validation', hasValidation ? 'ok' : 'broken');
      await page.screenshot({ path: `${SHOTS}/form-validation-${role}.png` });
      break;
    }
  }

  await page.keyboard.press('Escape');
}

async function auditNavigation(page, role) {
  log(`  Testing sidebar navigation...`);
  const navLinks = await page.locator('nav a, nav button').all();

  for (const link of navLinks) {
    try {
      const text = (await link.textContent())?.trim().slice(0, 50) || '';
      if (!text || text === 'Выйти' || text === 'Chiqish') continue;
      const vis = await link.isVisible();
      if (!vis) continue;

      const before = page.url();
      await link.click({ timeout: 3000 });
      await page.waitForTimeout(1200);
      const after = page.url();

      if (after !== before) {
        rec('Navigation', `"${text}"`, role, 'Navigates', `→ ${after.replace(BASE, '')}`, 'ok');
      } else {
        rec('Navigation', `"${text}"`, role, 'Navigates', 'URL unchanged (toggle/submenu?)', 'ok');
      }
    } catch { continue; }
  }
}

// ===== MAIN =====
async function runAudit() {
  const browser = await chromium.launch({ headless: true });

  const accounts = [
    { login: 'demo-manager', role: 'manager', pages: ['/requests', '/work-orders', '/executors', '/residents', '/colleagues', '/buildings', '/vehicle-search', '/guest-access', '/rentals', '/trainings', '/marketplace-orders', '/marketplace-products', '/reports', '/notepad', '/settings', '/profile'] },
    { login: 'demo-resident1', role: 'resident', pages: ['/requests', '/vehicles', '/guest-access', '/rate-employees', '/contract', '/rentals', '/useful-contacts', '/notepad', '/profile'] },
    { login: 'demo-admin', role: 'admin', pages: ['/requests', '/work-orders', '/team', '/residents', '/buildings', '/vehicle-search', '/guest-access', '/rentals', '/trainings', '/reports', '/settings', '/profile', '/monitoring'] },
    { login: 'demo-executor', role: 'executor', pages: ['/requests', '/schedule', '/stats', '/colleagues', '/notepad', '/profile'] },
    { login: 'demo-security', role: 'security', pages: ['/qr-scanner', '/guest-access', '/vehicle-search', '/colleagues', '/notepad', '/profile'] },
    { login: 'demo-director', role: 'director', pages: ['/requests', '/work-orders', '/team', '/residents', '/buildings', '/reports', '/settings', '/profile'] },
  ];

  for (const acc of accounts) {
    log(`\n${'='.repeat(60)}`);
    log(`AUDITING: ${acc.role.toUpperCase()} (${acc.login})`);
    log(`${'='.repeat(60)}`);

    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ru-RU' });
    const page = await ctx.newPage();
    page.on('pageerror', () => {});

    try {
      const ok = await uiLogin(page, acc.login);
      if (!ok) {
        rec('Login', 'Authentication', acc.role, 'Login', 'FAILED', 'broken');
        await page.screenshot({ path: `${SHOTS}/login-fail-${acc.role}.png` });
        await ctx.close();
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }
      rec('Login', 'Authentication', acc.role, 'Login', 'OK', 'ok');
      await page.screenshot({ path: `${SHOTS}/dashboard-${acc.role}.png` });

      // 1. Navigation
      await auditNavigation(page, acc.role);

      // 2. Dashboard buttons
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(1000);
      const dashBtns = await getPageButtons(page);
      log(`  Dashboard: ${dashBtns.length} interactive elements`);
      const seen = new Set();
      let n = 0;
      for (const b of dashBtns) {
        if (n >= 15) break;
        const k = b.label || `${b.x}-${b.y}`;
        if (seen.has(k) || (!b.label && b.w < 30)) continue;
        seen.add(k);
        await testBtn(page, b, 'Dashboard', acc.role);
        n++;
        if (page.url() !== `${BASE}/`) {
          await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
          await page.waitForTimeout(500);
        }
      }

      // 3. Specific modules
      await auditChat(page, acc.role);
      await auditAnnouncements(page, acc.role);
      await auditMeetings(page, acc.role);

      if (acc.pages.includes('/vehicle-search') || ['manager', 'admin', 'security'].includes(acc.role)) {
        await auditVehicleSearch(page, acc.role);
      }

      await auditNotifications(page, acc.role);

      if (['manager', 'admin', 'resident'].includes(acc.role)) {
        await auditFormValidation(page, acc.role);
      }

      // 4. All other pages
      for (const path of acc.pages) {
        if (['/chat', '/announcements', '/meetings', '/vehicle-search'].includes(path)) continue;
        const name = path.slice(1).split('-').map(w => w[0]?.toUpperCase() + w.slice(1)).join(' ') || 'Home';
        await auditPage(page, path, name, acc.role, 8);
      }

    } catch (e) {
      log(`FATAL for ${acc.role}: ${e.message}`);
      rec('System', 'Audit', acc.role, 'Complete', `Fatal: ${e.message.slice(0, 80)}`, 'review');
    }

    await ctx.close();
    log('Waiting 5s...');
    await new Promise(r => setTimeout(r, 5000));
  }

  await browser.close();
  writeReport();
}

function writeReport() {
  let md = `# Interactive Audit Report — demo.kamizo.uz\n\n`;
  md += `**Date:** ${new Date().toISOString().split('T')[0]}\n`;
  md += `**Tool:** Playwright + Chromium (headless)\n`;
  md += `**Accounts tested:** demo-manager, demo-resident1, demo-admin, demo-executor, demo-security, demo-director\n\n`;

  md += `## Summary\n\n`;
  md += `| Metric | Count |\n|--------|-------|\n`;
  md += `| Total elements tested | ${R.total} |\n`;
  md += `| Working ✅ | ${R.working} |\n`;
  md += `| Broken/Dead ❌ | ${R.broken.length} |\n`;
  md += `| Needs review ⚠️ | ${R.review.length} |\n\n`;

  md += `## ❌ Dead / Broken Elements\n\n`;
  if (R.broken.length === 0) {
    md += `None found.\n\n`;
  } else {
    md += `| # | Screen | Element | Role | Expected | Actual |\n`;
    md += `|---|--------|---------|------|----------|--------|\n`;
    R.broken.forEach((i, n) => { md += `| ${n + 1} | ${i.screen} | ${i.el} | ${i.role} | ${i.expected} | ${i.actual} |\n`; });
    md += `\n`;
  }

  md += `## ⚠️ Needs Manual Review\n\n`;
  if (R.review.length === 0) {
    md += `None.\n\n`;
  } else {
    md += `| # | Screen | Element | Role | Expected | Actual |\n`;
    md += `|---|--------|---------|------|----------|--------|\n`;
    R.review.forEach((i, n) => { md += `| ${n + 1} | ${i.screen} | ${i.el} | ${i.role} | ${i.expected} | ${i.actual} |\n`; });
    md += `\n`;
  }

  md += `## Screenshots\n\nSaved to \`audit/screenshots/\`\n`;

  fs.writeFileSync('/Users/shaxzodisamahamadov/kamizo/audit/interactive-audit-report.md', md);
  fs.writeFileSync('/Users/shaxzodisamahamadov/kamizo/audit/audit-results.json', JSON.stringify(R, null, 2));
  console.log(`\n${'='.repeat(60)}\nREPORT WRITTEN\n${'='.repeat(60)}\n`);
  console.log(md);
}

runAudit().catch(e => { console.error('FATAL:', e); writeReport(); });
