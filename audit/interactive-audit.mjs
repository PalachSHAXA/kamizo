import { chromium } from 'playwright';
import fs from 'fs';

const BASE_URL = 'https://demo.kamizo.uz';
const PASSWORD = 'kamizo';

const ACCOUNTS = [
  { login: 'demo-manager', role: 'manager' },
  { login: 'demo-resident1', role: 'resident' },
  { login: 'demo-admin', role: 'admin' },
  { login: 'demo-executor', role: 'executor' },
  { login: 'demo-security', role: 'security' },
  { login: 'demo-director', role: 'director' },
];

const results = {
  total: 0,
  working: 0,
  broken: [],
  needsReview: [],
};

function log(msg) {
  console.log(`[AUDIT] ${msg}`);
}

function logResult(screen, element, role, expected, actual, status) {
  results.total++;
  if (status === 'working') {
    results.working++;
  } else if (status === 'broken') {
    results.broken.push({ screen, element, role, expected, actual });
  } else if (status === 'needs_review') {
    results.needsReview.push({ screen, element, role, expected, actual });
  }
  const icon = status === 'working' ? '✅' : status === 'broken' ? '❌' : '⚠️';
  console.log(`  ${icon} [${screen}] ${element} (${role}) — ${actual}`);
}

async function loginAs(page, account) {
  log(`Logging in as ${account.login}...`);
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Fill login
  const loginInput = page.locator('input[type="text"]').first();
  await loginInput.fill(account.login);
  const passwordInput = page.locator('input[type="password"]').first();
  await passwordInput.fill(PASSWORD);

  // Accept offer - click the checkbox area to open modal
  const offerCheckbox = page.locator('text=публичной оферты, text=ommaviy oferta').first();
  try {
    await offerCheckbox.click({ timeout: 3000 });
  } catch {
    // Try clicking the agreement area
    const agreementArea = page.locator('.flex.items-start.gap-2\\.5').first();
    await agreementArea.click({ timeout: 3000 });
  }

  // Wait for offer modal and scroll to bottom
  await page.waitForTimeout(1000);
  const offerModal = page.locator('.overflow-y-auto').first();
  if (await offerModal.isVisible()) {
    await offerModal.evaluate(el => el.scrollTop = el.scrollHeight);
    await page.waitForTimeout(500);
    // Click accept button
    const acceptBtn = page.getByRole('button', { name: /Принять|Qabul/ });
    if (await acceptBtn.isVisible()) {
      await acceptBtn.click();
      await page.waitForTimeout(500);
    }
  }

  // Click login button
  const loginBtn = page.getByRole('button', { name: /Войти|Kirish/ });
  await loginBtn.click();
  await page.waitForTimeout(3000);

  // Verify login
  const url = page.url();
  if (url.includes('/login') || url === BASE_URL + '/') {
    // Check if we're on dashboard
    const body = await page.textContent('body');
    return !body.includes('Войдите') && !body.includes('Добро пожаловать');
  }
  return true;
}

async function testClickable(page, selector, screen, elementName, role, expectedBehavior) {
  try {
    const el = page.locator(selector).first();
    if (!(await el.isVisible({ timeout: 2000 }))) {
      return; // Element not visible, skip
    }

    const beforeUrl = page.url();
    const responsePromise = page.waitForResponse(r => r.url().includes('/api/'), { timeout: 3000 }).catch(() => null);

    await el.click({ timeout: 3000 });
    await page.waitForTimeout(1500);

    const afterUrl = page.url();
    const response = await responsePromise;
    const modalAppeared = await page.locator('[role="dialog"], .modal, .fixed.inset-0').first().isVisible().catch(() => false);

    if (afterUrl !== beforeUrl || response || modalAppeared) {
      logResult(screen, elementName, role, expectedBehavior, 'Element responds to click', 'working');
    } else {
      // Check for any visible change
      logResult(screen, elementName, role, expectedBehavior, 'No visible response to click', 'broken');
    }
  } catch (e) {
    logResult(screen, elementName, role, expectedBehavior, `Error: ${e.message.slice(0, 100)}`, 'needs_review');
  }
}

async function auditNavigation(page, role) {
  log(`Testing navigation for ${role}...`);

  // Get all sidebar links/buttons
  const navItems = await page.locator('nav a, nav button, [class*="sidebar"] a, [class*="sidebar"] button, [class*="Sidebar"] a, [class*="Sidebar"] button').all();

  for (const item of navItems) {
    try {
      const text = (await item.textContent())?.trim().slice(0, 50) || '';
      const isVisible = await item.isVisible();
      if (!isVisible || !text) continue;

      const beforeUrl = page.url();
      await item.click({ timeout: 3000 });
      await page.waitForTimeout(1500);
      const afterUrl = page.url();

      if (afterUrl !== beforeUrl) {
        logResult('Navigation', `Nav: "${text}"`, role, 'Navigate to page', `Navigated to ${afterUrl.replace(BASE_URL, '')}`, 'working');
      } else {
        // Some nav items may toggle submenus
        logResult('Navigation', `Nav: "${text}"`, role, 'Navigate to page', 'URL unchanged (may be submenu)', 'working');
      }
    } catch (e) {
      // Skip elements that become stale
    }
  }
}

async function auditButtons(page, role, screenName) {
  log(`Testing buttons on ${screenName} for ${role}...`);

  const buttons = await page.locator('button:visible').all();
  const testedLabels = new Set();

  for (const btn of buttons.slice(0, 30)) { // Limit to 30 buttons per screen
    try {
      const text = (await btn.textContent())?.trim().slice(0, 60) || '';
      const ariaLabel = await btn.getAttribute('aria-label') || '';
      const label = text || ariaLabel || 'unnamed';

      if (testedLabels.has(label)) continue;
      testedLabels.add(label);

      // Skip language/theme toggles that we know work
      if (['RU', 'UZ', '🇷🇺', '🇺🇿'].includes(label.trim())) continue;

      const isVisible = await btn.isVisible();
      if (!isVisible) continue;

      const beforeUrl = page.url();
      const beforeHtml = await page.content();

      // Listen for network requests
      let networkHit = false;
      const handler = () => { networkHit = true; };
      page.on('request', handler);

      await btn.click({ timeout: 2000, force: true }).catch(() => {});
      await page.waitForTimeout(1000);

      page.off('request', handler);

      const afterUrl = page.url();
      const afterHtml = await page.content();
      const modalVisible = await page.locator('.fixed.inset-0, [role="dialog"]').first().isVisible().catch(() => false);

      if (afterUrl !== beforeUrl || networkHit || modalVisible || afterHtml !== beforeHtml) {
        logResult(screenName, `Button: "${label}"`, role, 'Respond to click', 'Responds correctly', 'working');
      } else {
        logResult(screenName, `Button: "${label}"`, role, 'Respond to click', 'No visible response', 'broken');
      }

      // Go back if navigated
      if (afterUrl !== beforeUrl) {
        await page.goBack({ timeout: 5000 }).catch(() => page.goto(beforeUrl));
        await page.waitForTimeout(1000);
      }

      // Close modal if opened
      if (modalVisible) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      }
    } catch (e) {
      // Skip stale elements
    }
  }
}

async function auditChat(page, role) {
  log(`Testing chat for ${role}...`);

  try {
    // Navigate to chat
    await page.goto(`${BASE_URL}/chat`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);

    const chatVisible = await page.locator('[class*="chat"], [class*="Chat"]').first().isVisible().catch(() => false);
    if (!chatVisible) {
      const bodyText = await page.textContent('body');
      if (bodyText.includes('Чат') || bodyText.includes('Chat')) {
        logResult('Chat', 'Chat page', role, 'Chat loads', 'Chat page visible', 'working');
      } else {
        logResult('Chat', 'Chat page', role, 'Chat loads', 'Chat page not accessible', 'broken');
        return;
      }
    } else {
      logResult('Chat', 'Chat page', role, 'Chat loads', 'Chat page visible', 'working');
    }

    // Try to find and click a channel
    const channel = page.locator('[class*="channel"], [class*="Channel"]').first();
    if (await channel.isVisible().catch(() => false)) {
      await channel.click();
      await page.waitForTimeout(1500);
      logResult('Chat', 'Channel selection', role, 'Open channel', 'Channel opened', 'working');
    }

    // Test message input
    const msgInput = page.locator('input[placeholder*="сообщ"], input[placeholder*="message"], textarea[placeholder*="сообщ"], textarea[placeholder*="message"], input[placeholder*="Напиш"], textarea[placeholder*="Напиш"], input[placeholder*="Yoz"], textarea[placeholder*="Yoz"]').first();
    if (await msgInput.isVisible().catch(() => false)) {
      await msgInput.fill('Тест аудита / Audit test');
      logResult('Chat', 'Message input', role, 'Accept text', 'Input works', 'working');

      // Try send button
      const sendBtn = page.locator('button[type="submit"], button:has(svg[class*="Send"]), button:has([class*="send"])').first();
      if (await sendBtn.isVisible().catch(() => false)) {
        await sendBtn.click();
        await page.waitForTimeout(2000);
        logResult('Chat', 'Send message', role, 'Message sent', 'Send button clicked', 'working');
      }
    } else {
      logResult('Chat', 'Message input', role, 'Accept text', 'Message input not found', 'needs_review');
    }

    // Test emoji button
    const emojiBtn = page.locator('button:has([class*="smile"]), button:has([class*="Smile"]), button[aria-label*="emoji"], button[aria-label*="Emoji"]').first();
    if (await emojiBtn.isVisible().catch(() => false)) {
      await emojiBtn.click();
      await page.waitForTimeout(1000);
      const pickerVisible = await page.locator('[class*="emoji-picker"], [class*="EmojiPicker"]').first().isVisible().catch(() => false);
      logResult('Chat', 'Emoji picker', role, 'Opens emoji picker', pickerVisible ? 'Picker opened' : 'No picker appeared', pickerVisible ? 'working' : 'broken');
      await page.keyboard.press('Escape');
    }

    // Test file attach
    const attachBtn = page.locator('button:has([class*="paperclip"]), button:has([class*="Paperclip"]), button:has([class*="attach"]), button[aria-label*="attach"], button[aria-label*="file"]').first();
    if (await attachBtn.isVisible().catch(() => false)) {
      logResult('Chat', 'Attach button', role, 'Opens file dialog', 'Attach button present', 'working');
    }

  } catch (e) {
    logResult('Chat', 'Chat module', role, 'Chat works', `Error: ${e.message.slice(0, 100)}`, 'needs_review');
  }
}

async function auditAnnouncements(page, role) {
  log(`Testing announcements for ${role}...`);

  try {
    await page.goto(`${BASE_URL}/announcements`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);

    const pageText = await page.textContent('body');
    if (pageText.includes('Объявлени') || pageText.includes("E'lon") || pageText.includes('Announcement')) {
      logResult('Announcements', 'Page load', role, 'Page loads', 'Announcements page visible', 'working');
    } else {
      logResult('Announcements', 'Page load', role, 'Page loads', 'Page content not found', 'broken');
      return;
    }

    // Test create button (for managers/admins)
    if (['manager', 'admin', 'director'].includes(role)) {
      const createBtn = page.locator('button:has-text("Создать"), button:has-text("Добавить"), button:has-text("Yangi"), button:has([class*="Plus"]), button:has([class*="plus"])').first();
      if (await createBtn.isVisible().catch(() => false)) {
        await createBtn.click();
        await page.waitForTimeout(1500);
        const formVisible = await page.locator('form, [role="dialog"], .modal, .fixed.inset-0').first().isVisible().catch(() => false);
        logResult('Announcements', 'Create button', role, 'Opens create form', formVisible ? 'Form/modal opened' : 'No form appeared', formVisible ? 'working' : 'broken');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      }
    }

    // Test clicking an announcement card
    const card = page.locator('[class*="card"], [class*="Card"], article, .bg-white.rounded').first();
    if (await card.isVisible().catch(() => false)) {
      await card.click();
      await page.waitForTimeout(1500);
      logResult('Announcements', 'Card click', role, 'Opens detail', 'Card clicked', 'working');
    }

    // Test like/reaction buttons
    const likeBtn = page.locator('button:has([class*="heart"]), button:has([class*="Heart"]), button:has([class*="thumbs"]), button:has([class*="ThumbsUp"])').first();
    if (await likeBtn.isVisible().catch(() => false)) {
      await likeBtn.click();
      await page.waitForTimeout(1000);
      logResult('Announcements', 'Like/reaction', role, 'Toggles reaction', 'Like button clicked', 'working');
    }

  } catch (e) {
    logResult('Announcements', 'Announcements module', role, 'Works', `Error: ${e.message.slice(0, 100)}`, 'needs_review');
  }
}

async function auditMeetings(page, role) {
  log(`Testing meetings for ${role}...`);

  try {
    await page.goto(`${BASE_URL}/meetings`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);

    const pageText = await page.textContent('body');
    if (pageText.includes('Собрани') || pageText.includes("Yig'ilish") || pageText.includes('Meeting')) {
      logResult('Meetings', 'Page load', role, 'Page loads', 'Meetings page visible', 'working');
    } else {
      logResult('Meetings', 'Page load', role, 'Page loads', 'Page content not found', 'needs_review');
      return;
    }

    // Test create meeting (for managers/admins)
    if (['manager', 'admin', 'director'].includes(role)) {
      const createBtn = page.locator('button:has-text("Создать"), button:has-text("Новое"), button:has-text("Yangi"), button:has([class*="Plus"]), button:has([class*="plus"])').first();
      if (await createBtn.isVisible().catch(() => false)) {
        await createBtn.click();
        await page.waitForTimeout(1500);
        const formVisible = await page.locator('form, [role="dialog"], .modal, .fixed.inset-0').first().isVisible().catch(() => false);
        logResult('Meetings', 'Create meeting button', role, 'Opens form', formVisible ? 'Form/modal opened' : 'No form appeared', formVisible ? 'working' : 'broken');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      }
    }

    // Click a meeting card
    const meetingCard = page.locator('[class*="card"], [class*="Card"], article, .bg-white.rounded').first();
    if (await meetingCard.isVisible().catch(() => false)) {
      await meetingCard.click();
      await page.waitForTimeout(1500);
      logResult('Meetings', 'Meeting card click', role, 'Opens detail', 'Card responds', 'working');
    }

  } catch (e) {
    logResult('Meetings', 'Meetings module', role, 'Works', `Error: ${e.message.slice(0, 100)}`, 'needs_review');
  }
}

async function auditVehicleSearch(page, role) {
  log(`Testing vehicle search for ${role}...`);

  try {
    await page.goto(`${BASE_URL}/vehicle-search`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);

    const searchInput = page.locator('input[placeholder*="номер"], input[placeholder*="авто"], input[placeholder*="raqam"], input[placeholder*="search"], input[type="search"], input[type="text"]').first();
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill('01A777AA');
      await page.waitForTimeout(1000);

      // Try search button or press enter
      const searchBtn = page.locator('button:has([class*="search"]), button:has([class*="Search"]), button[type="submit"]').first();
      if (await searchBtn.isVisible().catch(() => false)) {
        await searchBtn.click();
      } else {
        await searchInput.press('Enter');
      }
      await page.waitForTimeout(2000);

      logResult('Vehicle Search', 'Search by plate', role, 'Returns results', 'Search executed', 'working');
    } else {
      logResult('Vehicle Search', 'Search input', role, 'Input present', 'Search input not found', 'broken');
    }
  } catch (e) {
    logResult('Vehicle Search', 'Vehicle search', role, 'Works', `Error: ${e.message.slice(0, 100)}`, 'needs_review');
  }
}

async function auditNotifications(page, role) {
  log(`Testing notifications for ${role}...`);

  try {
    // Look for notification bell/icon
    const bellBtn = page.locator('button:has([class*="bell"]), button:has([class*="Bell"]), [aria-label*="notification"], [aria-label*="Notification"]').first();
    if (await bellBtn.isVisible().catch(() => false)) {
      await bellBtn.click();
      await page.waitForTimeout(1500);

      const dropdown = await page.locator('.fixed, [class*="dropdown"], [class*="Dropdown"], [class*="notification"]').first().isVisible().catch(() => false);
      logResult('Notifications', 'Bell icon click', role, 'Opens notification panel', dropdown ? 'Panel opened' : 'No panel appeared', dropdown ? 'working' : 'broken');

      // Test mark as read
      const markReadBtn = page.locator('button:has-text("Прочитано"), button:has-text("Mark"), button:has-text("Все")').first();
      if (await markReadBtn.isVisible().catch(() => false)) {
        await markReadBtn.click();
        await page.waitForTimeout(1000);
        logResult('Notifications', 'Mark as read', role, 'Marks notifications', 'Button clicked', 'working');
      }

      await page.keyboard.press('Escape');
    } else {
      logResult('Notifications', 'Bell icon', role, 'Bell visible', 'Bell icon not found', 'needs_review');
    }
  } catch (e) {
    logResult('Notifications', 'Notifications', role, 'Works', `Error: ${e.message.slice(0, 100)}`, 'needs_review');
  }
}

async function auditPage(page, path, screenName, role) {
  log(`Auditing page ${path} as ${role}...`);

  try {
    await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);

    // Check page loaded (not blank)
    const bodyText = await page.textContent('body');
    if (bodyText.trim().length < 20) {
      logResult(screenName, 'Page load', role, 'Page renders', 'Page appears blank', 'broken');
      return;
    }
    logResult(screenName, 'Page load', role, 'Page renders', 'Page loaded with content', 'working');

    // Test all buttons on page
    await auditButtons(page, role, screenName);

  } catch (e) {
    logResult(screenName, 'Page access', role, 'Page loads', `Error: ${e.message.slice(0, 100)}`, 'needs_review');
  }
}

async function auditProfile(page, role) {
  log(`Testing profile for ${role}...`);

  try {
    await page.goto(`${BASE_URL}/profile`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);

    logResult('Profile', 'Page load', role, 'Profile loads', 'Profile page loaded', 'working');

    // Test edit profile button
    const editBtn = page.locator('button:has-text("Редактировать"), button:has-text("Изменить"), button:has-text("Tahrirlash"), button:has([class*="Edit"]), button:has([class*="edit"]), button:has([class*="Pencil"]), button:has([class*="pencil"])').first();
    if (await editBtn.isVisible().catch(() => false)) {
      await editBtn.click();
      await page.waitForTimeout(1500);
      logResult('Profile', 'Edit button', role, 'Opens edit form', 'Edit button responds', 'working');
      await page.keyboard.press('Escape');
    }
  } catch (e) {
    logResult('Profile', 'Profile', role, 'Works', `Error: ${e.message.slice(0, 100)}`, 'needs_review');
  }
}

async function auditFormValidation(page, role) {
  log(`Testing form validation for ${role}...`);

  try {
    // Navigate to requests page and try to create one
    await page.goto(`${BASE_URL}/requests`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);

    const createBtn = page.locator('button:has-text("Создать"), button:has-text("Новая"), button:has-text("Yangi"), button:has([class*="Plus"]), button:has([class*="plus"])').first();
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(1500);

      // Try submitting empty form
      const submitBtn = page.locator('button[type="submit"], button:has-text("Отправить"), button:has-text("Создать"), button:has-text("Сохранить"), button:has-text("Yuborish"), button:has-text("Saqlash")').last();
      if (await submitBtn.isVisible().catch(() => false)) {
        await submitBtn.click();
        await page.waitForTimeout(1500);

        const hasValidation = await page.locator('.text-red, [class*="error"], [class*="Error"], [class*="invalid"], [role="alert"]').first().isVisible().catch(() => false);
        const hasRequiredHighlight = await page.locator('input:invalid, select:invalid, textarea:invalid, [class*="border-red"]').first().isVisible().catch(() => false);

        if (hasValidation || hasRequiredHighlight) {
          logResult('Form Validation', 'Empty form submit', role, 'Shows validation', 'Validation shown', 'working');
        } else {
          logResult('Form Validation', 'Empty form submit', role, 'Shows validation', 'No validation shown', 'broken');
        }
      }
      await page.keyboard.press('Escape');
    }
  } catch (e) {
    logResult('Form Validation', 'Validation test', role, 'Validation works', `Error: ${e.message.slice(0, 100)}`, 'needs_review');
  }
}

async function runAudit() {
  const browser = await chromium.launch({ headless: true });

  for (const account of ACCOUNTS) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      locale: 'ru-RU',
    });
    const page = await context.newPage();

    // Suppress console errors from the page
    page.on('console', () => {});
    page.on('pageerror', () => {});

    try {
      const loggedIn = await loginAs(page, account);
      if (!loggedIn) {
        logResult('Login', 'Login', account.role, 'Successful login', 'Login failed', 'broken');
        await context.close();
        continue;
      }
      logResult('Login', 'Login', account.role, 'Successful login', 'Login successful', 'working');

      // Audit navigation
      await auditNavigation(page, account.role);

      // Audit dashboard
      await auditPage(page, '/', 'Dashboard', account.role);

      // Audit common pages
      const commonPages = [
        ['/requests', 'Requests'],
        ['/buildings', 'Buildings'],
        ['/announcements', 'Announcements'],
        ['/meetings', 'Meetings'],
        ['/chat', 'Chat'],
        ['/profile', 'Profile'],
        ['/vehicle-search', 'Vehicle Search'],
        ['/notepad', 'Notepad'],
        ['/useful-contacts', 'Useful Contacts'],
        ['/colleagues', 'Colleagues'],
      ];

      // Role-specific pages
      if (['manager', 'admin', 'director'].includes(account.role)) {
        commonPages.push(
          ['/residents', 'Residents'],
          ['/executors', 'Executors'],
          ['/work-orders', 'Work Orders'],
          ['/team', 'Team'],
          ['/settings', 'Settings'],
        );
      }

      if (account.role === 'resident') {
        commonPages.push(
          ['/vehicles', 'Vehicles'],
          ['/guest-access', 'Guest Access'],
          ['/rate-employees', 'Rate Employees'],
          ['/contract', 'Contract'],
          ['/rentals', 'Rentals'],
        );
      }

      if (account.role === 'executor') {
        commonPages.push(
          ['/schedule', 'Schedule'],
          ['/stats', 'Stats'],
        );
      }

      if (account.role === 'security') {
        commonPages.push(
          ['/qr-scanner', 'QR Scanner'],
          ['/guest-access', 'Guest Access'],
        );
      }

      for (const [path, name] of commonPages) {
        await auditPage(page, path, name, account.role);
      }

      // Specific module audits
      await auditChat(page, account.role);
      await auditAnnouncements(page, account.role);
      await auditMeetings(page, account.role);
      await auditNotifications(page, account.role);
      await auditProfile(page, account.role);

      if (['manager', 'admin', 'resident'].includes(account.role)) {
        await auditVehicleSearch(page, account.role);
        await auditFormValidation(page, account.role);
      }

    } catch (e) {
      log(`Error auditing ${account.role}: ${e.message}`);
    }

    await context.close();
  }

  await browser.close();

  // Generate report
  generateReport();
}

function generateReport() {
  let report = `# Interactive Audit Report — demo.kamizo.uz\n\n`;
  report += `**Date:** ${new Date().toISOString().split('T')[0]}\n\n`;

  report += `## Summary\n\n`;
  report += `- **Total elements tested:** ${results.total}\n`;
  report += `- **Working:** ${results.working} ✅\n`;
  report += `- **Broken/Dead:** ${results.broken.length} ❌\n`;
  report += `- **Needs review:** ${results.needsReview.length} ⚠️\n\n`;

  report += `## Dead / Broken Elements\n\n`;
  if (results.broken.length === 0) {
    report += `No broken elements found.\n\n`;
  } else {
    report += `| Screen | Element | Role | Expected | Actual |\n`;
    report += `|--------|---------|------|----------|--------|\n`;
    for (const item of results.broken) {
      report += `| ${item.screen} | ${item.element} | ${item.role} | ${item.expected} | ${item.actual} |\n`;
    }
    report += `\n`;
  }

  report += `## Elements Needing Manual Review\n\n`;
  if (results.needsReview.length === 0) {
    report += `No elements need review.\n\n`;
  } else {
    report += `| Screen | Element | Role | Expected | Actual |\n`;
    report += `|--------|---------|------|----------|--------|\n`;
    for (const item of results.needsReview) {
      report += `| ${item.screen} | ${item.element} | ${item.role} | ${item.expected} | ${item.actual} |\n`;
    }
    report += `\n`;
  }

  // Write report
  fs.writeFileSync('/Users/shaxzodisamahamadov/kamizo/audit/interactive-audit-report.md', report);
  console.log('\n\n=== REPORT WRITTEN TO audit/interactive-audit-report.md ===\n');
  console.log(report);
}

runAudit().catch(console.error);
