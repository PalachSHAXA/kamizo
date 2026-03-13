import { chromium } from 'playwright';
import fs from 'fs';

const BASE = 'https://demo.kamizo.uz';
const PW = 'kamizo';
const SHOTS = '/Users/shaxzodisamahamadov/kamizo/audit/screenshots';
fs.mkdirSync(SHOTS, { recursive: true });

const R = { total: 0, working: 0, broken: [], review: [] };
function log(m) { console.log(`[A] ${m}`); }
function rec(screen, el, role, expected, actual, st) {
  R.total++;
  if (st === 'ok') R.working++;
  else if (st === 'broken') R.broken.push({ screen, el, role, expected, actual });
  else R.review.push({ screen, el, role, expected, actual });
  console.log(`  ${st === 'ok' ? '✅' : st === 'broken' ? '❌' : '⚠️'} [${screen}] ${el} | ${role} | ${actual}`);
}

// ===== LOGIN via UI =====
async function doLogin(page, login) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.locator('input[type="text"]').first().fill(login);
  await page.locator('input[type="password"]').first().fill(PW);

  // Accept offer
  await page.locator('text=публичной оферты').first().click({ timeout: 3000 }).catch(async () => {
    await page.locator('text=ommaviy oferta').first().click({ timeout: 3000 }).catch(() => {});
  });
  await page.waitForTimeout(800);

  const scrollable = page.locator('.overflow-y-auto').first();
  if (await scrollable.isVisible().catch(() => false)) {
    await scrollable.evaluate(el => el.scrollTop = el.scrollHeight);
    await page.waitForTimeout(600);
    for (const b of await page.locator('button').all()) {
      const t = (await b.textContent() || '').trim();
      if ((t === 'Принять' || t === 'Qabul qilish') && await b.isEnabled()) { await b.click(); break; }
    }
    await page.waitForTimeout(500);
  }

  // Click login
  for (const b of await page.locator('button').all()) {
    const t = (await b.textContent() || '').trim();
    if (t === 'Войти' || t === 'Kirish') { await b.click(); break; }
  }
  await page.waitForTimeout(4000);
  return await page.locator('nav').first().isVisible().catch(() => false);
}

// ===== Check if still logged in =====
async function isLoggedIn(page) {
  return await page.locator('nav').first().isVisible().catch(() => false);
}

// ===== Navigate via sidebar click =====
async function sidebarNav(page, text) {
  const links = await page.locator('nav a, nav button').all();
  for (const l of links) {
    const t = (await l.textContent() || '').trim();
    if (t.includes(text)) {
      await l.click({ timeout: 3000 });
      await page.waitForTimeout(2000);
      return true;
    }
  }
  return false;
}

// ===== Navigate to path, re-login if needed =====
async function goTo(page, path, login) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(1500);

  if (!(await isLoggedIn(page))) {
    log(`  Session lost! Re-logging in...`);
    const ok = await doLogin(page, login);
    if (!ok) return false;
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1500);
    return await isLoggedIn(page);
  }
  return true;
}

// ===== Get interactive elements (excluding sidebar & login) =====
async function getButtons(page) {
  return page.evaluate(() => {
    const skipText = new Set(['Войти', 'Kirish', 'Показать пароль', 'Скрыть пароль',
      'публичной оферты', 'ommaviy oferta', 'Принять', 'Qabul qilish',
      'Yopish', 'Закрыть', 'Выйти', 'Chiqish', 'Обновить']);
    const demoP = ['Direktor', 'Boshqaruvchi', 'Administrator', "Bo'lim", 'Dispetcher',
      "Do'kon", 'Aholi', 'Santexnik', 'Elektrik', "Qo'riqchi", 'Ijarachi'];

    // Find sidebar width - it's the left nav panel
    const sidebar = document.querySelector('.sidebar, nav, [class*="sidebar"]');
    const sidebarRight = sidebar ? sidebar.getBoundingClientRect().right : 220;
    // Use at least 200px as sidebar cutoff
    const cutoff = Math.max(sidebarRight, 200);

    const items = [];
    for (const el of document.querySelectorAll('button, a[href], [role="button"]')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.top < 0) continue;
      // SKIP anything in the sidebar area (x < cutoff) unless it's in the top header bar
      if (r.right < cutoff + 5 && r.top > 50) continue;

      const text = (el.textContent || '').trim().slice(0, 80);
      const aria = el.getAttribute('aria-label') || '';
      const label = text || aria;

      if (skipText.has(label.trim())) continue;
      if (demoP.some(p => label.includes(p))) continue;
      if (['🇷🇺RU', '🇺🇿UZ', '🇷🇺 RU', '🇺🇿 UZ', 'RU', 'UZ'].includes(label.trim())) continue;
      if (!label && r.width < 25) continue;

      // Get SVG class for identification
      const svg = el.querySelector('svg');
      const svgClass = svg ? (svg.getAttribute('class') || svg.innerHTML.slice(0, 50)) : '';

      items.push({
        label: label.slice(0, 60), aria, tag: el.tagName.toLowerCase(),
        href: el.getAttribute('href') || '',
        x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2),
        w: Math.round(r.width), h: Math.round(r.height),
        svg: svgClass.slice(0, 60),
      });
    }
    return items;
  });
}

// ===== Test a button click =====
async function clickTest(page, el, screen, role) {
  const label = el.label || el.aria || `icon at (${el.x},${el.y})`;
  try {
    const before = page.url();
    let net = false;
    const h = (r) => { if (r.url().includes('/api/')) net = true; };
    page.on('request', h);
    await page.mouse.click(el.x, el.y);
    await page.waitForTimeout(1200);
    page.off('request', h);

    const after = page.url();
    const modal = await page.locator('.fixed.inset-0:visible').first().isVisible().catch(() => false);

    if (after !== before || net || modal) {
      rec(screen, `"${label}"`, role, 'Responds', 'OK', 'ok');
      if (modal) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
      if (after !== before) { await page.goBack({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(600); }
    } else {
      rec(screen, `"${label}"`, role, 'Responds', 'NO RESPONSE — dead', 'broken');
    }
  } catch (e) {
    rec(screen, `"${label}"`, role, 'Responds', `Err: ${e.message.slice(0, 50)}`, 'review');
  }
}

// ===== Audit page buttons =====
async function auditPageBtns(page, path, name, role, login, max = 12) {
  const ok = await goTo(page, path, login);
  if (!ok) { rec(name, 'Page', role, 'Loads', 'Failed (session)', 'broken'); return; }

  const bodyLen = (await page.textContent('body') || '').length;
  if (bodyLen < 100) { rec(name, 'Page', role, 'Renders', 'Blank', 'broken'); return; }
  rec(name, 'Page load', role, 'Renders', 'OK', 'ok');

  await page.screenshot({ path: `${SHOTS}/${name.toLowerCase().replace(/[/ ]/g, '-')}-${role}.png` });

  const btns = await getButtons(page);
  log(`  ${name}: ${btns.length} elements`);

  const seen = new Set();
  let n = 0;
  for (const b of btns) {
    if (n >= max) break;
    const k = b.label || `${b.x}-${b.y}`;
    if (seen.has(k) || (!b.label && b.w < 30)) continue;
    // Skip notification badge (single digit in header)
    if (/^\d{1,2}$/.test(b.label) && b.y < 60) continue;
    seen.add(k);
    await clickTest(page, b, name, role);
    n++;
    // Restore if navigated
    if (!page.url().includes(path)) {
      await goTo(page, path, login);
    }
  }
}

// ===== CHAT =====
async function chatAudit(page, role, login) {
  log(`  Chat tests...`);
  if (!(await goTo(page, '/chat', login))) { rec('Chat', 'Page', role, 'Loads', 'Failed', 'broken'); return; }
  rec('Chat', 'Page load', role, 'Renders', 'OK', 'ok');
  await page.screenshot({ path: `${SHOTS}/chat-${role}.png` });

  // Click first channel
  let opened = false;
  const items = await page.locator('[class*="cursor-pointer"]').all();
  for (const item of items.slice(0, 10)) {
    const box = await item.boundingBox();
    if (!box || box.width < 100 || box.height < 30) continue;
    try { await item.click({ timeout: 2000 }); await page.waitForTimeout(1500); opened = true; rec('Chat', 'Channel click', role, 'Opens', 'OK', 'ok'); break; } catch { continue; }
  }
  if (!opened) rec('Chat', 'Channel click', role, 'Opens', 'No channel clickable', 'review');

  // Message input
  const inputs = await page.locator('input:visible, textarea:visible').all();
  let msgInp = null;
  for (const inp of inputs) {
    const ph = (await inp.getAttribute('placeholder')) || '';
    if (/сообщ|напиш|yoz|message/i.test(ph)) { msgInp = inp; break; }
  }
  if (msgInp) {
    await msgInp.fill('Audit test message');
    rec('Chat', 'Message input', role, 'Accepts text', 'OK', 'ok');
    // Send
    const send = page.locator('button[type="submit"]').first();
    if (await send.isVisible().catch(() => false)) {
      let apiHit = false;
      page.on('request', r => { if (r.url().includes('/api/')) apiHit = true; });
      await send.click(); await page.waitForTimeout(2000);
      rec('Chat', 'Send button', role, 'Sends', apiHit ? 'API called' : 'Clicked (no API)', apiHit ? 'ok' : 'review');
    }
  } else {
    rec('Chat', 'Message input', role, 'Exists', opened ? 'Not found after channel open' : 'No channel selected', opened ? 'broken' : 'review');
  }

  // Emoji
  for (const btn of await page.locator('button:visible').all()) {
    const html = await btn.innerHTML().catch(() => '');
    if (/smile|Smile/i.test(html)) {
      await btn.click().catch(() => {}); await page.waitForTimeout(800);
      const picker = await page.locator('[class*="emoji"], [class*="picker"]').first().isVisible().catch(() => false);
      rec('Chat', 'Emoji', role, 'Opens picker', picker ? 'OK' : 'No picker', picker ? 'ok' : 'broken');
      await page.keyboard.press('Escape');
      break;
    }
  }

  // Attach
  for (const btn of await page.locator('button:visible').all()) {
    const html = await btn.innerHTML().catch(() => '');
    if (/paperclip|Paperclip|attach/i.test(html)) {
      rec('Chat', 'Attach button', role, 'Present', 'Found', 'ok');
      break;
    }
  }
  await page.screenshot({ path: `${SHOTS}/chat-detail-${role}.png` });
}

// ===== ANNOUNCEMENTS =====
async function announcementsAudit(page, role, login) {
  log(`  Announcements tests...`);
  if (!(await goTo(page, '/announcements', login))) { rec('Announcements', 'Page', role, 'Loads', 'Failed', 'broken'); return; }
  rec('Announcements', 'Page load', role, 'Renders', 'OK', 'ok');
  await page.screenshot({ path: `${SHOTS}/announcements-${role}.png` });

  // Create (managers)
  if (['manager', 'admin', 'director'].includes(role)) {
    const btns = await getButtons(page);
    let found = false;
    for (const b of btns) {
      if (/создат|добав|новое|yangi/i.test(b.label) || /plus|Plus/i.test(b.svg)) {
        await clickTest(page, b, 'Announcements-Create', role);
        found = true;
        // Restore page
        if (!(await isLoggedIn(page))) await goTo(page, '/announcements', login);
        break;
      }
    }
    if (!found) rec('Announcements', 'Create button', role, 'Exists', 'Not found', 'review');
  }

  // Like/react
  for (const btn of await page.locator('button:visible').all()) {
    const html = await btn.innerHTML().catch(() => '');
    if (/heart|Heart|thumbs|ThumbsUp|eye|Eye/i.test(html)) {
      let apiHit = false;
      page.on('request', r => { if (r.url().includes('/api/')) apiHit = true; });
      await btn.click().catch(() => {}); await page.waitForTimeout(1000);
      rec('Announcements', 'Like/view', role, 'Responds', apiHit ? 'API called' : 'Clicked', apiHit ? 'ok' : 'review');
      break;
    }
  }
}

// ===== MEETINGS =====
async function meetingsAudit(page, role, login) {
  log(`  Meetings tests...`);
  if (!(await goTo(page, '/meetings', login))) { rec('Meetings', 'Page', role, 'Loads', 'Failed', 'broken'); return; }
  rec('Meetings', 'Page load', role, 'Renders', 'OK', 'ok');
  await page.screenshot({ path: `${SHOTS}/meetings-${role}.png` });

  if (['manager', 'admin', 'director'].includes(role)) {
    const btns = await getButtons(page);
    for (const b of btns) {
      if (/создат|новое|назнач|yangi/i.test(b.label) || /plus|Plus/i.test(b.svg)) {
        await clickTest(page, b, 'Meetings-Create', role);
        if (!(await isLoggedIn(page))) await goTo(page, '/meetings', login);
        break;
      }
    }
  }

  // Vote/RSVP
  for (const btn of await page.locator('button:visible').all()) {
    const text = (await btn.textContent() || '').trim();
    if (/участву|приму|голосов|rsvp|ishtirok/i.test(text)) {
      await btn.click().catch(() => {}); await page.waitForTimeout(800);
      rec('Meetings', 'Vote/RSVP', role, 'Responds', 'Clicked', 'ok');
      break;
    }
  }
}

// ===== VEHICLE SEARCH =====
async function vehicleAudit(page, role, login) {
  log(`  Vehicle Search tests...`);
  if (!(await goTo(page, '/vehicle-search', login))) { rec('VehicleSearch', 'Page', role, 'Loads', 'Failed', 'broken'); return; }
  rec('VehicleSearch', 'Page load', role, 'Renders', 'OK', 'ok');
  await page.screenshot({ path: `${SHOTS}/vehicle-search-${role}.png` });

  const inputs = await page.locator('input:visible').all();
  if (inputs.length > 0) {
    await inputs[0].fill('01A777AA');
    let apiHit = false;
    page.on('request', r => { if (r.url().includes('/api/')) apiHit = true; });
    await inputs[0].press('Enter'); await page.waitForTimeout(2000);
    rec('VehicleSearch', 'Search', role, 'Executes', apiHit ? 'API called' : 'Enter pressed', apiHit ? 'ok' : 'review');
    await page.screenshot({ path: `${SHOTS}/vehicle-search-result-${role}.png` });
  } else {
    rec('VehicleSearch', 'Search input', role, 'Exists', 'Not found', 'broken');
  }
}

// ===== NOTIFICATIONS =====
async function notifAudit(page, role, login) {
  log(`  Notifications tests...`);
  await goTo(page, '/', login);

  for (const btn of await page.locator('button:visible').all()) {
    const box = await btn.boundingBox();
    if (!box || box.y > 65 || box.width > 150) continue;
    const html = await btn.innerHTML().catch(() => '');
    if (/bell|Bell/i.test(html)) {
      await btn.click(); await page.waitForTimeout(1500);
      await page.screenshot({ path: `${SHOTS}/notifications-${role}.png` });
      const panel = await page.locator('.fixed.inset-0:visible, [class*="notification"]:visible').first().isVisible().catch(() => false);
      rec('Notifications', 'Bell click', role, 'Opens panel', panel ? 'OK' : 'No panel', panel ? 'ok' : 'broken');

      // Mark read
      for (const b of await page.locator('button:visible').all()) {
        const t = (await b.textContent() || '').trim();
        if (/прочитан|очист|clear|mark/i.test(t)) {
          await b.click().catch(() => {}); await page.waitForTimeout(800);
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

// ===== FORM VALIDATION =====
async function formAudit(page, role, login) {
  log(`  Form validation tests...`);
  if (!(await goTo(page, '/requests', login))) return;

  const btns = await getButtons(page);
  let formOpened = false;
  for (const b of btns) {
    if (/создат|новая|yangi/i.test(b.label) || /plus|Plus/i.test(b.svg)) {
      await page.mouse.click(b.x, b.y); await page.waitForTimeout(1500);
      const modal = await page.locator('.fixed.inset-0:visible').first().isVisible().catch(() => false);
      if (modal) { formOpened = true; break; }
    }
  }
  if (!formOpened) { rec('FormValidation', 'Create form', role, 'Opens', 'Not found', 'review'); return; }

  // Submit empty
  for (const btn of await page.locator('button:visible').all()) {
    const text = (await btn.textContent() || '').trim();
    if (/отправ|создат|сохран|yuborish|saqlash|submit/i.test(text)) {
      await btn.click(); await page.waitForTimeout(1500);
      const validation = await page.locator('.text-red-500, .text-red-600, .border-red-500, [class*="error"], [role="alert"]').first().isVisible().catch(() => false);
      rec('FormValidation', 'Empty submit', role, 'Validates', validation ? 'Validation shown' : 'No validation', validation ? 'ok' : 'broken');
      await page.screenshot({ path: `${SHOTS}/form-validation-${role}.png` });
      break;
    }
  }
  await page.keyboard.press('Escape');
}

// ===== MAIN =====
async function run() {
  const browser = await chromium.launch({ headless: true });

  const accounts = [
    { login: 'demo-manager', role: 'manager', pages: ['/requests', '/work-orders', '/executors', '/residents', '/colleagues', '/buildings', '/guest-access', '/rentals', '/trainings', '/marketplace-orders', '/reports', '/notepad', '/settings', '/profile'] },
    { login: 'demo-resident1', role: 'resident', pages: ['/requests', '/vehicles', '/guest-access', '/rate-employees', '/contract', '/rentals', '/useful-contacts', '/notepad', '/profile'] },
    { login: 'demo-admin', role: 'admin', pages: ['/requests', '/work-orders', '/team', '/residents', '/buildings', '/guest-access', '/rentals', '/trainings', '/reports', '/settings', '/profile', '/monitoring'] },
    { login: 'demo-executor', role: 'executor', pages: ['/requests', '/schedule', '/stats', '/colleagues', '/notepad', '/profile'] },
    { login: 'demo-security', role: 'security', pages: ['/qr-scanner', '/guest-access', '/vehicle-search', '/colleagues', '/notepad', '/profile'] },
    { login: 'demo-director', role: 'director', pages: ['/requests', '/work-orders', '/team', '/residents', '/buildings', '/reports', '/settings', '/profile'] },
  ];

  for (const acc of accounts) {
    log(`\n${'='.repeat(50)}`);
    log(`${acc.role.toUpperCase()} (${acc.login})`);
    log(`${'='.repeat(50)}`);

    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ru-RU' });
    const page = await ctx.newPage();
    page.on('pageerror', () => {});

    try {
      const ok = await doLogin(page, acc.login);
      if (!ok) {
        rec('Login', 'Auth', acc.role, 'Login', 'FAILED', 'broken');
        await page.screenshot({ path: `${SHOTS}/login-fail-${acc.role}.png` });
        await ctx.close(); await new Promise(r => setTimeout(r, 5000)); continue;
      }
      rec('Login', 'Auth', acc.role, 'Login', 'OK', 'ok');
      await page.screenshot({ path: `${SHOTS}/dashboard-${acc.role}.png` });

      // Nav
      log(`  Sidebar navigation...`);
      for (const l of await page.locator('nav a, nav button').all()) {
        try {
          const t = (await l.textContent())?.trim().slice(0, 50) || '';
          if (!t || t === 'Выйти' || t === 'Chiqish') continue;
          if (!(await l.isVisible())) continue;
          const before = page.url();
          await l.click({ timeout: 3000 }); await page.waitForTimeout(1200);
          const after = page.url();
          rec('Nav', `"${t}"`, acc.role, 'Navigates', after !== before ? `→ ${after.replace(BASE, '')}` : 'Stays (submenu?)', 'ok');
        } catch { continue; }
      }

      // Dashboard buttons (carefully, skip notification badges)
      await goTo(page, '/', acc.login);
      const dashBtns = await getButtons(page);
      log(`  Dashboard: ${dashBtns.length} elements`);
      const seen = new Set();
      let n = 0;
      for (const b of dashBtns) {
        if (n >= 15) break;
        const k = b.label || `${b.x}-${b.y}`;
        if (seen.has(k) || (!b.label && b.w < 30)) continue;
        if (/^\d{1,3}$/.test(b.label) && b.y < 65) continue; // notification badge
        seen.add(k);
        await clickTest(page, b, 'Dashboard', acc.role);
        n++;
        if (!(await isLoggedIn(page))) await goTo(page, '/', acc.login);
        else if (!page.url().endsWith('/')) await goTo(page, '/', acc.login);
      }

      // Module audits
      await chatAudit(page, acc.role, acc.login);
      await announcementsAudit(page, acc.role, acc.login);
      await meetingsAudit(page, acc.role, acc.login);
      if (acc.pages.includes('/vehicle-search') || ['manager', 'admin', 'security'].includes(acc.role)) {
        await vehicleAudit(page, acc.role, acc.login);
      }
      await notifAudit(page, acc.role, acc.login);
      if (['manager', 'admin', 'resident'].includes(acc.role)) {
        await formAudit(page, acc.role, acc.login);
      }

      // Other pages
      for (const path of acc.pages) {
        if (['/vehicle-search'].includes(path)) continue;
        const name = path.slice(1).split('-').map(w => w[0]?.toUpperCase() + w.slice(1)).join(' ');
        await auditPageBtns(page, path, name, acc.role, acc.login, 8);
      }

    } catch (e) {
      log(`FATAL ${acc.role}: ${e.message}`);
      rec('System', 'Audit', acc.role, 'Complete', `Fatal: ${e.message.slice(0, 80)}`, 'review');
    }

    await ctx.close();
    log('Pause 5s...'); await new Promise(r => setTimeout(r, 5000));
  }

  await browser.close();
  report();
}

function report() {
  let md = `# Interactive Audit Report — demo.kamizo.uz\n\n`;
  md += `**Date:** ${new Date().toISOString().split('T')[0]}\n`;
  md += `**Tool:** Playwright + Chromium (headless)\n`;
  md += `**Accounts:** demo-manager, demo-resident1, demo-admin, demo-executor, demo-security, demo-director\n\n`;

  md += `## Summary\n\n`;
  md += `| Metric | Count |\n|--------|-------|\n`;
  md += `| Total elements tested | ${R.total} |\n`;
  md += `| Working ✅ | ${R.working} |\n`;
  md += `| Broken/Dead ❌ | ${R.broken.length} |\n`;
  md += `| Needs review ⚠️ | ${R.review.length} |\n\n`;

  md += `## ❌ Dead / Broken Elements\n\n`;
  if (!R.broken.length) md += `None.\n\n`;
  else {
    md += `| # | Screen | Element | Role | Expected | Actual |\n|---|--------|---------|------|----------|--------|\n`;
    R.broken.forEach((i, n) => { md += `| ${n + 1} | ${i.screen} | ${i.el} | ${i.role} | ${i.expected} | ${i.actual} |\n`; });
    md += `\n`;
  }

  md += `## ⚠️ Needs Manual Review\n\n`;
  if (!R.review.length) md += `None.\n\n`;
  else {
    md += `| # | Screen | Element | Role | Expected | Actual |\n|---|--------|---------|------|----------|--------|\n`;
    R.review.forEach((i, n) => { md += `| ${n + 1} | ${i.screen} | ${i.el} | ${i.role} | ${i.expected} | ${i.actual} |\n`; });
    md += `\n`;
  }

  md += `## Screenshots\n\n\`audit/screenshots/\`\n`;

  fs.writeFileSync('/Users/shaxzodisamahamadov/kamizo/audit/interactive-audit-report.md', md);
  fs.writeFileSync('/Users/shaxzodisamahamadov/kamizo/audit/audit-results.json', JSON.stringify(R, null, 2));
  console.log(`\n${'='.repeat(50)}\nREPORT WRITTEN\n${'='.repeat(50)}\n`);
  console.log(md);
}

run().catch(e => { console.error('FATAL:', e); report(); });
