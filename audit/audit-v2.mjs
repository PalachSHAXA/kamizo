import { chromium } from 'playwright';
import fs from 'fs';

const BASE_URL = 'https://demo.kamizo.uz';
const PASSWORD = 'kamizo';
const SCREENSHOT_DIR = '/Users/shaxzodisamahamadov/kamizo/audit/screenshots';

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const ACCOUNTS = [
  { login: 'demo-manager', role: 'manager', pages: ['/', '/requests', '/work-orders', '/chat', '/executors', '/residents', '/colleagues', '/buildings', '/vehicle-search', '/guest-access', '/rentals', '/announcements', '/meetings', '/trainings', '/marketplace-orders', '/marketplace-products', '/reports', '/notepad', '/settings', '/profile'] },
  { login: 'demo-resident1', role: 'resident', pages: ['/', '/requests', '/chat', '/announcements', '/meetings', '/vehicles', '/guest-access', '/rate-employees', '/contract', '/rentals', '/vehicle-search', '/useful-contacts', '/notepad', '/profile'] },
  { login: 'demo-admin', role: 'admin', pages: ['/', '/requests', '/work-orders', '/chat', '/team', '/residents', '/buildings', '/vehicle-search', '/guest-access', '/rentals', '/announcements', '/meetings', '/trainings', '/reports', '/settings', '/profile', '/monitoring'] },
  { login: 'demo-executor', role: 'executor', pages: ['/', '/requests', '/chat', '/announcements', '/schedule', '/stats', '/colleagues', '/notepad', '/profile'] },
  { login: 'demo-security', role: 'security', pages: ['/', '/chat', '/announcements', '/qr-scanner', '/guest-access', '/vehicle-search', '/colleagues', '/notepad', '/profile'] },
  { login: 'demo-director', role: 'director', pages: ['/', '/requests', '/work-orders', '/chat', '/team', '/residents', '/buildings', '/announcements', '/meetings', '/reports', '/settings', '/profile'] },
];

const results = { total: 0, working: 0, broken: [], needsReview: [] };

function log(msg) { console.log(`[AUDIT] ${msg}`); }

function record(screen, element, role, expected, actual, status) {
  results.total++;
  if (status === 'ok') { results.working++; }
  else if (status === 'broken') { results.broken.push({ screen, element, role, expected, actual }); }
  else { results.needsReview.push({ screen, element, role, expected, actual }); }
  const icon = status === 'ok' ? '✅' : status === 'broken' ? '❌' : '⚠️';
  console.log(`  ${icon} [${screen}] ${element} | ${role} | ${actual}`);
}

// Login via API with rate limit retry
async function apiLogin(login) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const resp = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, password: PASSWORD }),
    });
    if (resp.status === 429) {
      log(`Rate limited, waiting 35s...`);
      await new Promise(r => setTimeout(r, 35000));
      continue;
    }
    if (!resp.ok) throw new Error(`Login failed for ${login}: ${resp.status}`);
    return resp.json();
  }
  throw new Error(`Login failed for ${login} after retries`);
}

async function setupAuth(context, login) {
  const { user, token } = await apiLogin(login);
  log(`API login OK for ${login} (token: ${token.slice(0, 8)}...)`);

  // Use auto_auth URL parameter — the app handles this natively
  const autoAuthPayload = {
    state: { user, token, isLoading: false, error: null, additionalUsers: {} },
    version: 0,
  };
  const encoded = Buffer.from(encodeURIComponent(JSON.stringify(autoAuthPayload))).toString('base64');

  const page = await context.newPage();

  // Navigate with auto_auth — the app sets localStorage and reloads
  await page.goto(`${BASE_URL}/?auto_auth=${encoded}`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Verify logged in
  const hasNav = await page.locator('nav').first().isVisible().catch(() => false);
  const hasSidebar = await page.locator('[class*="sidebar"], [class*="Sidebar"]').first().isVisible().catch(() => false);
  const hasLoginForm = await page.locator('form input[type="password"]').isVisible().catch(() => false);

  const loggedIn = (hasNav || hasSidebar) && !hasLoginForm;
  if (!loggedIn) {
    log(`Auth check FAILED: nav=${hasNav}, sidebar=${hasSidebar}, loginForm=${hasLoginForm}`);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/auth-fail-${login}.png` });
  }

  return { page, loggedIn, user };
}

// Find interactive elements in main content (exclude sidebar & login page)
async function findInteractiveElements(page) {
  return page.evaluate(() => {
    const results = [];
    const loginTexts = new Set(['Войти', 'Kirish', 'Показать пароль', 'публичной оферты', 'ommaviy oferta',
      'Принять', 'Qabul qilish', 'Yopish', 'Закрыть']);

    const sidebar = document.querySelector('nav');
    const sidebarRect = sidebar?.getBoundingClientRect();

    for (const el of document.querySelectorAll('button, a[href], [role="button"]')) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0 || rect.top < 0 || rect.left < 0) continue;

      // Skip sidebar elements
      if (sidebarRect && rect.left >= sidebarRect.left && rect.right <= sidebarRect.right + 5 &&
          rect.top >= sidebarRect.top && rect.bottom <= sidebarRect.bottom) continue;

      const text = (el.textContent || '').trim().slice(0, 80);
      const ariaLabel = el.getAttribute('aria-label') || '';
      const label = text || ariaLabel;

      if (loginTexts.has(label.trim())) continue;
      if (['🇷🇺RU', '🇺🇿UZ', '🇷🇺 RU', '🇺🇿 UZ'].includes(label.trim())) continue;

      // Skip demo account buttons
      if (label.includes('Direktor') || label.includes('Boshqaruvchi') || label.includes('Santexnik') ||
          label.includes('Elektrik') || label.includes("Qo'riqchi") || label.includes('Ijarachi') ||
          label.includes('Aholi') || label.includes('Dispetcher') || label.includes("Do'kon") ||
          label.includes('Administrator')) continue;

      results.push({
        label: label.slice(0, 60),
        ariaLabel,
        tag: el.tagName.toLowerCase(),
        href: el.getAttribute('href') || '',
        x: Math.round(rect.x + rect.width / 2),
        y: Math.round(rect.y + rect.height / 2),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    }
    return results;
  });
}

async function testButton(page, el, screenName, role) {
  const label = el.label || el.ariaLabel || `element at (${el.x},${el.y})`;

  try {
    const beforeUrl = page.url();

    let networkHit = false;
    const netHandler = () => { networkHit = true; };
    page.on('request', netHandler);

    await page.mouse.click(el.x, el.y);
    await page.waitForTimeout(1200);

    page.off('request', netHandler);

    const afterUrl = page.url();
    const modalAppeared = await page.locator('.fixed.inset-0:visible, [role="dialog"]:visible').first().isVisible().catch(() => false);
    const dropdownAppeared = await page.locator('.absolute:visible, [class*="dropdown"]:visible, [class*="popover"]:visible').first().isVisible().catch(() => false);

    if (afterUrl !== beforeUrl || networkHit || modalAppeared || dropdownAppeared) {
      record(screenName, `"${label}"`, role, 'Responds', 'OK', 'ok');

      // Cleanup
      if (afterUrl !== beforeUrl) {
        await page.goBack({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(800);
      }
      if (modalAppeared) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
      }
      return true;
    } else {
      record(screenName, `"${label}"`, role, 'Responds', 'NO RESPONSE - dead element', 'broken');
      return false;
    }
  } catch (e) {
    record(screenName, `"${label}"`, role, 'Responds', `Error: ${e.message.slice(0, 60)}`, 'needs_review');
    return false;
  }
}

async function testPageLoad(page, path, screenName, role) {
  try {
    await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1500);

    const onLogin = await page.locator('form input[type="password"]').isVisible().catch(() => false);
    if (onLogin) {
      record(screenName, 'Page access', role, 'Page loads', 'Redirected to login (session lost)', 'broken');
      return false;
    }

    const bodyLen = (await page.textContent('body') || '').trim().length;
    if (bodyLen < 50) {
      record(screenName, 'Page load', role, 'Renders', 'Blank page', 'broken');
      return false;
    }

    record(screenName, 'Page load', role, 'Renders', 'OK', 'ok');
    return true;
  } catch (e) {
    record(screenName, 'Page load', role, 'Renders', `Error: ${e.message.slice(0, 60)}`, 'needs_review');
    return false;
  }
}

async function auditPageButtons(page, path, screenName, role, maxButtons = 15) {
  const loaded = await testPageLoad(page, path, screenName, role);
  if (!loaded) return;

  await page.screenshot({ path: `${SCREENSHOT_DIR}/${screenName.toLowerCase().replace(/[/ ]/g, '-')}-${role}.png` });

  const elements = await findInteractiveElements(page);
  log(`  ${screenName}: ${elements.length} interactive elements found`);

  const tested = new Set();
  let count = 0;
  for (const el of elements) {
    if (count >= maxButtons) break;
    const key = el.label || `${el.x}-${el.y}`;
    if (tested.has(key)) continue;
    if (!el.label && el.width < 30 && el.height < 30) continue; // Skip tiny unlabeled icons
    tested.add(key);
    await testButton(page, el, screenName, role);
    count++;

    // Re-navigate if button took us elsewhere
    if (page.url() !== `${BASE_URL}${path}`) {
      await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(1000);
    }
  }
}

async function auditChat(page, role) {
  log(`Testing Chat for ${role}...`);
  const loaded = await testPageLoad(page, '/chat', 'Chat', role);
  if (!loaded) return;

  await page.screenshot({ path: `${SCREENSHOT_DIR}/chat-${role}.png` });

  // Click first channel/conversation
  const conversations = await page.locator('[class*="cursor-pointer"], [class*="hover:bg"]').all();
  let channelClicked = false;
  for (const conv of conversations.slice(0, 5)) {
    const rect = await conv.boundingBox();
    if (!rect || rect.width < 100) continue;
    try {
      await conv.click({ timeout: 2000 });
      await page.waitForTimeout(1500);
      channelClicked = true;
      record('Chat', 'Channel click', role, 'Opens conversation', 'OK', 'ok');
      break;
    } catch { continue; }
  }

  // Find message input
  const allInputs = await page.locator('input, textarea').all();
  let msgInput = null;
  for (const inp of allInputs) {
    if (!(await inp.isVisible().catch(() => false))) continue;
    const ph = (await inp.getAttribute('placeholder')) || '';
    if (ph.toLowerCase().includes('сообщ') || ph.toLowerCase().includes('напиш') || ph.toLowerCase().includes('yoz') || ph.toLowerCase().includes('message')) {
      msgInput = inp;
      break;
    }
  }

  if (msgInput) {
    await msgInput.fill('Audit test message');
    record('Chat', 'Message input', role, 'Accepts text', 'OK', 'ok');

    // Try send
    const sendBtn = page.locator('button[type="submit"]').first();
    if (await sendBtn.isVisible().catch(() => false)) {
      await sendBtn.click();
      await page.waitForTimeout(1500);
      record('Chat', 'Send message', role, 'Sends', 'Button clicked', 'ok');
    }
  } else {
    record('Chat', 'Message input', role, 'Input exists', channelClicked ? 'No input found after channel click' : 'No input (no channel selected)', channelClicked ? 'broken' : 'needs_review');
  }

  await page.screenshot({ path: `${SCREENSHOT_DIR}/chat-after-${role}.png` });
}

async function auditAnnouncements(page, role) {
  log(`Testing Announcements for ${role}...`);
  const loaded = await testPageLoad(page, '/announcements', 'Announcements', role);
  if (!loaded) return;

  await page.screenshot({ path: `${SCREENSHOT_DIR}/announcements-${role}.png` });

  // Test create button (managers/admins)
  if (['manager', 'admin', 'director'].includes(role)) {
    const elements = await findInteractiveElements(page);
    for (const el of elements) {
      if (el.label.includes('Создать') || el.label.includes('Добавить') || el.label.includes('Новое') || el.label.includes('Yangi')) {
        await testButton(page, el, 'Announcements', role);
        break;
      }
    }
  }

  // Click first card
  const cards = await page.locator('.rounded-xl, .rounded-lg, .rounded-2xl').all();
  for (const card of cards) {
    const rect = await card.boundingBox();
    if (!rect || rect.width < 200 || rect.height < 50) continue;
    try {
      await card.click({ timeout: 2000 });
      await page.waitForTimeout(1000);
      record('Announcements', 'Card click', role, 'Opens detail', 'Card responds', 'ok');
      break;
    } catch { continue; }
  }
}

async function auditMeetings(page, role) {
  log(`Testing Meetings for ${role}...`);
  const loaded = await testPageLoad(page, '/meetings', 'Meetings', role);
  if (!loaded) return;

  await page.screenshot({ path: `${SCREENSHOT_DIR}/meetings-${role}.png` });

  if (['manager', 'admin', 'director'].includes(role)) {
    const elements = await findInteractiveElements(page);
    for (const el of elements) {
      if (el.label.includes('Создать') || el.label.includes('Новое') || el.label.includes('Yangi') || el.label.includes('Назначить')) {
        await testButton(page, el, 'Meetings-Create', role);
        break;
      }
    }
  }
}

async function auditVehicleSearch(page, role) {
  log(`Testing Vehicle Search for ${role}...`);
  const loaded = await testPageLoad(page, '/vehicle-search', 'VehicleSearch', role);
  if (!loaded) return;

  await page.screenshot({ path: `${SCREENSHOT_DIR}/vehicle-search-${role}.png` });

  const inputs = await page.locator('input:visible').all();
  for (const inp of inputs) {
    const ph = (await inp.getAttribute('placeholder')) || '';
    if (ph.includes('номер') || ph.includes('авто') || ph.includes('raqam') || ph.includes('поиск')) {
      await inp.fill('01A777AA');
      await inp.press('Enter');
      await page.waitForTimeout(2000);
      record('VehicleSearch', 'Search by plate', role, 'Returns results', 'Search executed', 'ok');
      await page.screenshot({ path: `${SCREENSHOT_DIR}/vehicle-search-result-${role}.png` });
      return;
    }
  }
  // If no placeholder match, try the first visible text input
  if (inputs.length > 0) {
    await inputs[0].fill('01A777AA');
    await inputs[0].press('Enter');
    await page.waitForTimeout(2000);
    record('VehicleSearch', 'Search (first input)', role, 'Returns results', 'Search executed', 'ok');
  } else {
    record('VehicleSearch', 'Search input', role, 'Input exists', 'No input found', 'broken');
  }
}

async function auditNotifications(page, role) {
  log(`Testing Notifications for ${role}...`);

  // Look at top of page for notification bell
  const headerBtns = await page.locator('button').all();
  for (const btn of headerBtns) {
    const rect = await btn.boundingBox();
    if (!rect || rect.y > 70 || rect.width > 150) continue;

    const html = await btn.innerHTML();
    if (html.toLowerCase().includes('bell') || html.toLowerCase().includes('notification')) {
      await btn.click();
      await page.waitForTimeout(1500);

      const panel = await page.locator('.fixed.inset-0:visible, [class*="notification"]:visible').first().isVisible().catch(() => false);
      record('Notifications', 'Bell icon', role, 'Opens panel', panel ? 'Panel opened' : 'No panel', panel ? 'ok' : 'broken');

      if (panel) {
        // Test "mark all read"
        const allBtns = await page.locator('button:visible').all();
        for (const b of allBtns) {
          const t = (await b.textContent() || '').trim();
          if (t.includes('Прочитано') || t.includes('прочитан') || t.includes("O'qilgan") || t.includes('Очистить') || t.includes('Mark')) {
            await b.click();
            await page.waitForTimeout(800);
            record('Notifications', 'Mark read / Clear', role, 'Responds', 'Button clicked', 'ok');
            break;
          }
        }
      }

      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      return;
    }
  }
  record('Notifications', 'Bell icon', role, 'Exists', 'Not found in header', 'needs_review');
}

async function runAudit() {
  const browser = await chromium.launch({ headless: true });

  for (const account of ACCOUNTS) {
    log(`\n========== AUDITING ${account.role.toUpperCase()} (${account.login}) ==========`);

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      locale: 'ru-RU',
    });

    try {
      const { page, loggedIn } = await setupAuth(context, account.login);

      if (!loggedIn) {
        record('Login', 'Authentication', account.role, 'Login', 'FAILED', 'broken');
        await context.close();
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }
      record('Login', 'Authentication', account.role, 'Login', 'OK', 'ok');

      // 1. Dashboard
      await auditPageButtons(page, '/', 'Dashboard', account.role, 20);

      // 2. Requests
      if (account.pages.includes('/requests')) {
        await auditPageButtons(page, '/requests', 'Requests', account.role, 15);
      }

      // 3. Chat
      if (account.pages.includes('/chat')) {
        await auditChat(page, account.role);
      }

      // 4. Announcements
      if (account.pages.includes('/announcements')) {
        await auditAnnouncements(page, account.role);
      }

      // 5. Meetings
      if (account.pages.includes('/meetings')) {
        await auditMeetings(page, account.role);
      }

      // 6. Vehicle search
      if (account.pages.includes('/vehicle-search')) {
        await auditVehicleSearch(page, account.role);
      }

      // 7. Notifications
      await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(1000);
      await auditNotifications(page, account.role);

      // 8. Other pages
      const specialPages = new Set(['/', '/requests', '/chat', '/announcements', '/meetings', '/vehicle-search']);
      for (const path of account.pages) {
        if (specialPages.has(path)) continue;
        const name = path.slice(1).split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ') || 'Home';
        await auditPageButtons(page, path, name, account.role, 10);
      }

    } catch (e) {
      log(`FATAL for ${account.role}: ${e.message}`);
      record('System', 'Audit', account.role, 'Complete', `Fatal: ${e.message.slice(0, 80)}`, 'needs_review');
    }

    await context.close();
    log('Waiting 5s before next account...');
    await new Promise(r => setTimeout(r, 5000));
  }

  await browser.close();
  generateReport();
}

function generateReport() {
  let md = `# Interactive Audit Report — demo.kamizo.uz\n\n`;
  md += `**Date:** ${new Date().toISOString().split('T')[0]}\n`;
  md += `**Tool:** Playwright ${process.env.npm_package_version || '1.58.2'} (headless Chromium)\n\n`;

  md += `## Summary\n\n`;
  md += `| Metric | Count |\n|--------|-------|\n`;
  md += `| Total elements tested | ${results.total} |\n`;
  md += `| Working ✅ | ${results.working} |\n`;
  md += `| Broken/Dead ❌ | ${results.broken.length} |\n`;
  md += `| Needs review ⚠️ | ${results.needsReview.length} |\n\n`;

  md += `## ❌ Dead / Broken Elements\n\n`;
  if (results.broken.length === 0) {
    md += `No broken elements found.\n\n`;
  } else {
    md += `| # | Screen | Element | Role | Expected | Actual |\n`;
    md += `|---|--------|---------|------|----------|--------|\n`;
    results.broken.forEach((item, i) => {
      md += `| ${i + 1} | ${item.screen} | ${item.element} | ${item.role} | ${item.expected} | ${item.actual} |\n`;
    });
    md += `\n`;
  }

  md += `## ⚠️ Elements Needing Manual Review\n\n`;
  if (results.needsReview.length === 0) {
    md += `No elements need review.\n\n`;
  } else {
    md += `| # | Screen | Element | Role | Expected | Actual |\n`;
    md += `|---|--------|---------|------|----------|--------|\n`;
    results.needsReview.forEach((item, i) => {
      md += `| ${i + 1} | ${item.screen} | ${item.element} | ${item.role} | ${item.expected} | ${item.actual} |\n`;
    });
    md += `\n`;
  }

  md += `## Screenshots\n\nAll screenshots saved to \`audit/screenshots/\`\n`;

  const reportPath = '/Users/shaxzodisamahamadov/kamizo/audit/interactive-audit-report.md';
  fs.writeFileSync(reportPath, md);
  fs.writeFileSync('/Users/shaxzodisamahamadov/kamizo/audit/audit-results.json', JSON.stringify(results, null, 2));

  console.log(`\n\n=== REPORT WRITTEN ===\n`);
  console.log(md);
}

runAudit().catch(e => {
  console.error('FATAL:', e);
  generateReport();
});
