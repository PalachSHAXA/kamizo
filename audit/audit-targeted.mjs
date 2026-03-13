import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE = 'https://demo.kamizo.uz';
const SCREENSHOT_DIR = '/Users/shaxzodisamahamadov/kamizo/audit/screenshots';
const RESULTS_FILE = '/Users/shaxzodisamahamadov/kamizo/audit/targeted-results.json';
const PASSWORD = 'kamizo';

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const results = {};

function log(test, msg) {
  console.log(`[${test}] ${msg}`);
  if (!results[test]) results[test] = { logs: [], buttons: [], screenshots: [] };
  results[test].logs.push(msg);
}

function addScreenshot(test, name) {
  if (!results[test]) results[test] = { logs: [], buttons: [], screenshots: [] };
  results[test].screenshots.push(name);
}

async function screenshot(page, test, name) {
  const filename = `${name}.png`;
  const filepath = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: false });
  addScreenshot(test, filename);
  log(test, `Screenshot saved: ${filename}`);
}

async function listButtons(page, test) {
  const buttons = await page.evaluate(() => {
    const els = [...document.querySelectorAll('button, [role="button"], a[href]')];
    return els.slice(0, 60).map(el => ({
      tag: el.tagName,
      text: (el.textContent || '').trim().substring(0, 80),
      type: el.getAttribute('type'),
      className: (el.className || '').toString().substring(0, 80),
      rect: el.getBoundingClientRect().toJSON(),
      visible: el.offsetParent !== null || el.getBoundingClientRect().height > 0,
      hasSvg: el.querySelector('svg') !== null,
      innerHTML: el.innerHTML.substring(0, 200),
    }));
  });
  if (!results[test]) results[test] = { logs: [], buttons: [], screenshots: [] };
  results[test].buttons = buttons;
  log(test, `Found ${buttons.length} buttons/links on page`);
  return buttons;
}

async function login(page, username, testName) {
  log(testName, `Logging in as ${username}...`);
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Fill login
  const loginInput = await page.$('input[type="text"], input[name="login"], input[name="username"], input[placeholder*="логин" i], input[placeholder*="login" i], input:not([type="password"]):not([type="hidden"]):not([type="checkbox"])');
  if (loginInput) {
    await loginInput.fill(username);
    log(testName, `Filled login field with ${username}`);
  } else {
    log(testName, 'ERROR: Could not find login input');
    return false;
  }

  // Fill password
  const passInput = await page.$('input[type="password"]');
  if (passInput) {
    await passInput.fill(PASSWORD);
    log(testName, 'Filled password field');
  } else {
    log(testName, 'ERROR: Could not find password input');
    return false;
  }

  await page.waitForTimeout(500);

  // Click "публичной оферты" link to open offer modal
  const offerLink = await page.$('text=публичной оферты');
  if (!offerLink) {
    // Try broader search
    const altLink = await page.$('a:has-text("оферт"), span:has-text("оферт"), text=оферт');
    if (altLink) {
      await altLink.click();
      log(testName, 'Clicked offer link (alt selector)');
    } else {
      log(testName, 'WARNING: Could not find offer link, trying to proceed anyway');
    }
  } else {
    await offerLink.click();
    log(testName, 'Clicked "публичной оферты" link');
  }

  await page.waitForTimeout(1500);

  // Scroll modal to bottom
  const modalScrollable = await page.$('.modal-body, [class*="modal"] [class*="scroll"], [class*="modal"] [class*="content"], [role="dialog"] [class*="scroll"], [role="dialog"] [class*="content"], [class*="overflow"]');
  if (modalScrollable) {
    await page.evaluate(el => el.scrollTop = el.scrollHeight, modalScrollable);
    log(testName, 'Scrolled modal to bottom');
    await page.waitForTimeout(500);
  } else {
    // Try scrolling any modal-like element
    const scrolled = await page.evaluate(() => {
      const candidates = document.querySelectorAll('[class*="modal"], [role="dialog"], [class*="drawer"], [class*="overlay"]');
      for (const c of candidates) {
        const scrollable = c.querySelector('[class*="body"], [class*="content"], [class*="scroll"]') || c;
        if (scrollable.scrollHeight > scrollable.clientHeight) {
          scrollable.scrollTop = scrollable.scrollHeight;
          return true;
        }
      }
      // Try any scrollable div
      const divs = document.querySelectorAll('div');
      for (const d of divs) {
        if (d.scrollHeight > d.clientHeight + 100 && d.clientHeight > 100 && d.clientHeight < 600) {
          d.scrollTop = d.scrollHeight;
          return true;
        }
      }
      return false;
    });
    log(testName, scrolled ? 'Scrolled modal content to bottom (fallback)' : 'WARNING: Could not find scrollable modal');
  }

  await page.waitForTimeout(500);

  // Scroll modal multiple times to ensure we reach the very bottom
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => {
      const divs = [...document.querySelectorAll('div')];
      for (const d of divs) {
        if (d.scrollHeight > d.clientHeight + 50 && d.clientHeight > 50 && d.clientHeight < 700) {
          d.scrollTop = d.scrollHeight + 10000;
        }
      }
    });
    await page.waitForTimeout(300);
  }
  log(testName, 'Scrolled modal content multiple times');

  await page.waitForTimeout(1000);

  // Click "Принять" button - wait for it to be enabled
  const acceptBtn = await page.$('button:has-text("Принять"), button:has-text("принять"), button:has-text("Accept")');
  if (acceptBtn) {
    // Check if disabled
    const isDisabled = await acceptBtn.evaluate(el => el.disabled);
    log(testName, `Accept button disabled: ${isDisabled}`);
    if (isDisabled) {
      // Force enable and click
      await acceptBtn.evaluate(el => { el.disabled = false; });
      log(testName, 'Force-enabled accept button');
    }
    try {
      await acceptBtn.click({ timeout: 5000 });
      log(testName, 'Clicked "Принять" button');
    } catch (e) {
      // Force click via JS
      await acceptBtn.evaluate(el => el.click());
      log(testName, 'Force-clicked "Принять" button via JS');
    }
  } else {
    log(testName, 'WARNING: Could not find "Принять" button');
  }

  await page.waitForTimeout(1000);

  // Click "Войти" button
  const loginBtn = await page.$('button:has-text("Войти"), button[type="submit"]');
  if (loginBtn) {
    await loginBtn.click();
    log(testName, 'Clicked "Войти" button');
  } else {
    log(testName, 'ERROR: Could not find "Войти" button');
    return false;
  }

  // Wait for navigation
  try {
    await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 15000 });
    log(testName, `Login successful, now at: ${page.url()}`);
    return true;
  } catch {
    log(testName, `Login may have failed, current URL: ${page.url()}`);
    await screenshot(page, testName, `login-fail-${username}`);
    return false;
  }
}

async function waitForPage(page) {
  await page.waitForTimeout(2000);
  try {
    await page.waitForLoadState('networkidle', { timeout: 10000 });
  } catch { /* ok */ }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: 'ru-RU',
  });

  const page = await context.newPage();

  // ============================
  // LOGIN AS DEMO-MANAGER
  // ============================
  const loginOk = await login(page, 'demo-manager', 'login');
  await screenshot(page, 'login', 'login-manager-result');

  if (!loginOk) {
    log('login', 'FATAL: Cannot proceed without login');
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
    await browser.close();
    process.exit(1);
  }

  await page.waitForTimeout(2000);

  // ============================
  // TEST 1: CHAT MESSAGE SENDING
  // ============================
  {
    const T = 'chat';
    log(T, 'Navigating to /chat...');
    await page.goto(`${BASE}/chat`, { waitUntil: 'networkidle', timeout: 30000 });
    await waitForPage(page);
    await screenshot(page, T, 'chat-before');
    await listButtons(page, T);

    // Click first channel/conversation
    const channel = await page.$('[class*="chat"] [class*="item"], [class*="conversation"], [class*="channel"], [class*="list"] [class*="card"], [class*="sidebar"] a, [class*="sidebar"] [class*="item"]');
    if (channel) {
      await channel.click();
      log(T, 'Clicked first channel/conversation');
      await waitForPage(page);
    } else {
      // Try clicking any list item
      const listItems = await page.$$('[class*="list"] > div, [class*="chat"] > div > div');
      if (listItems.length > 0) {
        await listItems[0].click();
        log(T, 'Clicked first list item as channel');
        await waitForPage(page);
      } else {
        log(T, 'WARNING: No channels found');
      }
    }

    await screenshot(page, T, 'chat-channel-selected');

    // Find ALL inputs and textareas
    const inputs = await page.evaluate(() => {
      const els = [...document.querySelectorAll('input, textarea, [contenteditable="true"]')];
      return els.map(el => ({
        tag: el.tagName,
        type: el.getAttribute('type'),
        placeholder: el.getAttribute('placeholder'),
        className: (el.className || '').toString().substring(0, 100),
        visible: el.offsetParent !== null,
        rect: el.getBoundingClientRect().toJSON(),
      }));
    });
    log(T, `Found ${inputs.length} input elements: ${JSON.stringify(inputs)}`);

    // Try to type in any visible input/textarea
    const chatInput = await page.$('textarea:visible, input[type="text"]:visible, [contenteditable="true"]:visible');
    if (chatInput) {
      await chatInput.fill('Test message from audit');
      log(T, 'Typed test message');
      await page.waitForTimeout(500);

      // Find send button - check all buttons with SVG
      const sendBtn = await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button')];
        for (const b of btns) {
          const html = b.innerHTML.toLowerCase();
          if (html.includes('send') || html.includes('arrow') || html.includes('paper') ||
              html.includes('отправ') || html.includes('M2.01') || html.includes('path')) {
            const rect = b.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && rect.bottom > 400) {
              return { text: b.textContent?.trim(), class: b.className, found: true };
            }
          }
        }
        return { found: false };
      });
      log(T, `Send button search: ${JSON.stringify(sendBtn)}`);

      // Try pressing Enter
      await chatInput.press('Enter');
      log(T, 'Pressed Enter to send');
      await page.waitForTimeout(1000);
    } else {
      log(T, 'WARNING: No visible chat input found');
    }

    await screenshot(page, T, 'chat-after-send');
  }

  // ============================
  // TEST 2: ANNOUNCEMENTS CREATE
  // ============================
  {
    const T = 'announcements';
    log(T, 'Navigating to /announcements...');
    await page.goto(`${BASE}/announcements`, { waitUntil: 'networkidle', timeout: 30000 });
    await waitForPage(page);
    await screenshot(page, T, 'announcements-before');
    const buttons = await listButtons(page, T);

    // Find create/plus button
    const createBtn = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button, a, [role="button"]')];
      for (const b of btns) {
        const text = (b.textContent || '').toLowerCase();
        const html = b.innerHTML.toLowerCase();
        if (text.includes('создат') || text.includes('добав') || text.includes('новый') || text.includes('новая') ||
            html.includes('plus') || html.includes('Plus') || html.includes('M12 4v16') || html.includes('M12 6v12') ||
            html.includes('add') || html.includes('M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6')) {
          return {
            text: b.textContent?.trim().substring(0, 50),
            tag: b.tagName,
            class: b.className?.toString().substring(0, 80),
            found: true,
          };
        }
      }
      return { found: false };
    });
    log(T, `Create button search: ${JSON.stringify(createBtn)}`);

    if (createBtn.found) {
      const btn = await page.$(`button:has-text("${createBtn.text}"), [role="button"]:has-text("${createBtn.text}")`);
      if (btn) {
        await btn.click();
        log(T, 'Clicked create button');
        await page.waitForTimeout(1500);
        await screenshot(page, T, 'announcements-after-create-click');
      }
    } else {
      // Try floating action button or icon-only buttons
      const fab = await page.$('[class*="fab"], [class*="float"], button[class*="add"], button[class*="create"], [class*="fixed"] button');
      if (fab) {
        await fab.click();
        log(T, 'Clicked FAB button');
        await page.waitForTimeout(1500);
        await screenshot(page, T, 'announcements-after-fab-click');
      } else {
        log(T, 'No create button found on announcements page');
        await screenshot(page, T, 'announcements-no-create-btn');
      }
    }
  }

  // ============================
  // TEST 3: MEETINGS CREATE
  // ============================
  {
    const T = 'meetings';
    log(T, 'Navigating to /meetings...');
    await page.goto(`${BASE}/meetings`, { waitUntil: 'networkidle', timeout: 30000 });
    await waitForPage(page);
    await screenshot(page, T, 'meetings-before');
    await listButtons(page, T);

    // Find create/plus/Назначить button
    const createInfo = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button, a, [role="button"]')];
      const matches = [];
      for (const b of btns) {
        const text = (b.textContent || '').toLowerCase();
        const html = b.innerHTML.toLowerCase();
        if (text.includes('создат') || text.includes('добав') || text.includes('назначить') ||
            text.includes('новый') || text.includes('новое') || text.includes('запланир') ||
            html.includes('plus') || html.includes('add') ||
            html.includes('M12 4v16') || html.includes('M12 6v12') ||
            html.includes('M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6')) {
          matches.push({
            text: b.textContent?.trim().substring(0, 50),
            tag: b.tagName,
            index: btns.indexOf(b),
          });
        }
      }
      return matches;
    });
    log(T, `Create button candidates: ${JSON.stringify(createInfo)}`);

    if (createInfo.length > 0) {
      const allBtns = await page.$$('button, a, [role="button"]');
      if (allBtns[createInfo[0].index]) {
        await allBtns[createInfo[0].index].click();
        log(T, `Clicked: "${createInfo[0].text}"`);
        await page.waitForTimeout(1500);
        await screenshot(page, T, 'meetings-after-create-click');
      }
    } else {
      const fab = await page.$('[class*="fab"], [class*="float"], button[class*="add"], [class*="fixed"] button');
      if (fab) {
        await fab.click();
        log(T, 'Clicked FAB');
        await page.waitForTimeout(1500);
        await screenshot(page, T, 'meetings-after-fab');
      } else {
        log(T, 'No create button found');
        await screenshot(page, T, 'meetings-no-create');
      }
    }
  }

  // ============================
  // TEST 4: REQUEST CREATION
  // ============================
  {
    const T = 'requests';
    log(T, 'Navigating to /requests...');
    await page.goto(`${BASE}/requests`, { waitUntil: 'networkidle', timeout: 30000 });
    await waitForPage(page);
    await screenshot(page, T, 'requests-before');
    await listButtons(page, T);

    // Find create button
    const createInfo = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button, a, [role="button"]')];
      const matches = [];
      for (const b of btns) {
        const text = (b.textContent || '').toLowerCase();
        const html = b.innerHTML.toLowerCase();
        if (text.includes('создат') || text.includes('добав') || text.includes('новая') || text.includes('новый') ||
            text.includes('заявк') || html.includes('plus') || html.includes('add') ||
            html.includes('M12 4v16') || html.includes('M12 6v12') ||
            html.includes('M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6')) {
          matches.push({
            text: b.textContent?.trim().substring(0, 50),
            tag: b.tagName,
            index: btns.indexOf(b),
          });
        }
      }
      return matches;
    });
    log(T, `Create button candidates: ${JSON.stringify(createInfo)}`);

    if (createInfo.length > 0) {
      const allBtns = await page.$$('button, a, [role="button"]');
      if (allBtns[createInfo[0].index]) {
        await allBtns[createInfo[0].index].click();
        log(T, `Clicked: "${createInfo[0].text}"`);
        await page.waitForTimeout(2000);
        await screenshot(page, T, 'requests-after-create-click');

        // Check for modal/form
        const formVisible = await page.evaluate(() => {
          const modal = document.querySelector('[class*="modal"]:not([class*="hidden"]), [role="dialog"], [class*="drawer"], form');
          return modal ? { found: true, class: modal.className?.toString().substring(0, 80) } : { found: false };
        });
        log(T, `Form/modal visible: ${JSON.stringify(formVisible)}`);

        if (formVisible.found) {
          // Try submitting empty
          const submitBtn = await page.$('[class*="modal"] button[type="submit"], [role="dialog"] button[type="submit"], [class*="modal"] button:has-text("Создат"), [class*="modal"] button:has-text("Сохран"), [class*="modal"] button:has-text("Отправ"), form button[type="submit"]');
          if (submitBtn) {
            await submitBtn.click();
            log(T, 'Clicked submit on empty form');
            await page.waitForTimeout(1500);
            await screenshot(page, T, 'requests-empty-submit');

            // Check for validation errors
            const errors = await page.evaluate(() => {
              const errEls = document.querySelectorAll('[class*="error"], [class*="invalid"], [class*="required"], [class*="validation"], .text-red-500, .text-danger');
              return [...errEls].map(e => e.textContent?.trim().substring(0, 80)).filter(Boolean);
            });
            log(T, `Validation errors: ${JSON.stringify(errors)}`);
          }
        }
      }
    } else {
      log(T, 'No create button found on requests page');
    }
  }

  // ============================
  // TEST 5: VEHICLE SEARCH
  // ============================
  {
    const T = 'vehicle-search';
    log(T, 'Navigating to /vehicle-search...');
    await page.goto(`${BASE}/vehicle-search`, { waitUntil: 'networkidle', timeout: 30000 });
    await waitForPage(page);
    await screenshot(page, T, 'vehicle-search-before');
    await listButtons(page, T);

    // Find ALL visible inputs
    const allInputs = await page.evaluate(() => {
      const els = [...document.querySelectorAll('input, textarea')];
      return els.map(el => ({
        tag: el.tagName,
        type: el.getAttribute('type'),
        placeholder: el.getAttribute('placeholder'),
        name: el.getAttribute('name'),
        visible: el.offsetParent !== null,
        rect: el.getBoundingClientRect().toJSON(),
      }));
    });
    log(T, `All inputs: ${JSON.stringify(allInputs)}`);

    // Find search input
    const searchInput = await page.$('input:visible');
    if (searchInput) {
      await searchInput.fill('01A777AA');
      log(T, 'Typed "01A777AA" in search input');
      await page.waitForTimeout(500);
      await screenshot(page, T, 'vehicle-search-typed');

      // Try pressing Enter
      await searchInput.press('Enter');
      log(T, 'Pressed Enter');
      await page.waitForTimeout(2000);

      // Check for results
      const pageContent = await page.evaluate(() => {
        return document.body.innerText.substring(0, 2000);
      });
      log(T, `Page content after search: ${pageContent.substring(0, 500)}`);
      await screenshot(page, T, 'vehicle-search-after');

      // Also try clicking a search button if exists
      const searchBtn = await page.$('button:has-text("Поиск"), button:has-text("Найти"), button:has-text("Search"), button[type="submit"]');
      if (searchBtn) {
        await searchBtn.click();
        log(T, 'Clicked search button');
        await page.waitForTimeout(2000);
        await screenshot(page, T, 'vehicle-search-btn-click');
      }
    } else {
      log(T, 'No visible input found on vehicle-search page');
    }
  }

  // ============================
  // TEST 6: NOTIFICATION PANEL
  // ============================
  {
    const T = 'notifications';
    log(T, 'Checking notification bell...');
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 30000 });
    await waitForPage(page);
    await screenshot(page, T, 'notifications-page-before');

    // Find bell icon button in header
    const bellInfo = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button, a, [role="button"]')];
      const matches = [];
      for (const b of btns) {
        const html = b.innerHTML.toLowerCase();
        if (html.includes('bell') || html.includes('notification') || html.includes('уведомлен') ||
            html.includes('M18 8A6 6') || html.includes('M15 17h5') ||
            html.includes('колокол') || html.includes('звонок')) {
          const rect = b.getBoundingClientRect();
          matches.push({
            text: b.textContent?.trim().substring(0, 30),
            class: b.className?.toString().substring(0, 80),
            rect: rect.toJSON(),
            htmlSnippet: html.substring(0, 200),
          });
        }
      }
      return matches;
    });
    log(T, `Bell button candidates: ${JSON.stringify(bellInfo)}`);

    if (bellInfo.length > 0) {
      // Click the first bell-like button
      const bellBtn = await page.evaluate((info) => {
        const btns = [...document.querySelectorAll('button, a, [role="button"]')];
        for (const b of btns) {
          const html = b.innerHTML.toLowerCase();
          if (html.includes('bell') || html.includes('notification') || html.includes('уведомлен') ||
              html.includes('M18 8A6 6') || html.includes('M15 17h5')) {
            b.click();
            return true;
          }
        }
        return false;
      });
      log(T, `Bell clicked: ${bellBtn}`);
      await page.waitForTimeout(1500);
      await screenshot(page, T, 'notifications-after-bell-click');

      // Check what opened
      const panelInfo = await page.evaluate(() => {
        const panels = document.querySelectorAll('[class*="notification"], [class*="panel"], [class*="dropdown"], [class*="popover"], [class*="drawer"]');
        return [...panels].map(p => ({
          class: p.className?.toString().substring(0, 80),
          visible: p.offsetParent !== null || p.getBoundingClientRect().height > 0,
          text: p.textContent?.substring(0, 200),
        }));
      });
      log(T, `Panels found: ${JSON.stringify(panelInfo).substring(0, 500)}`);
    } else {
      // Try header buttons with SVG
      const headerBtns = await page.evaluate(() => {
        const header = document.querySelector('header, nav, [class*="header"], [class*="navbar"], [class*="topbar"]');
        if (!header) return [];
        const btns = [...header.querySelectorAll('button')];
        return btns.map(b => ({
          text: b.textContent?.trim().substring(0, 30),
          hasSvg: b.querySelector('svg') !== null,
          rect: b.getBoundingClientRect().toJSON(),
          htmlSnippet: b.innerHTML.toLowerCase().substring(0, 200),
        }));
      });
      log(T, `Header buttons: ${JSON.stringify(headerBtns)}`);

      // Click any header button with SVG that could be notifications
      for (let i = 0; i < headerBtns.length; i++) {
        if (headerBtns[i].hasSvg) {
          const hbtns = await page.$$('header button, nav button, [class*="header"] button, [class*="navbar"] button');
          const svgBtns = [];
          for (const hb of hbtns) {
            const hasSvg = await hb.$('svg');
            if (hasSvg) svgBtns.push(hb);
          }
          if (svgBtns.length > 0) {
            await svgBtns[0].click();
            log(T, 'Clicked first header SVG button');
            await page.waitForTimeout(1500);
            await screenshot(page, T, 'notifications-header-btn-click');
          }
          break;
        }
      }
    }
  }

  // ============================
  // TEST 7: PROFILE EDIT
  // ============================
  {
    const T = 'profile';
    log(T, 'Navigating to /profile...');
    await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle', timeout: 30000 });
    await waitForPage(page);
    await screenshot(page, T, 'profile-before');
    await listButtons(page, T);

    // Find edit button
    const editInfo = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button, a, [role="button"]')];
      const matches = [];
      for (const b of btns) {
        const text = (b.textContent || '').toLowerCase();
        const html = b.innerHTML.toLowerCase();
        if (text.includes('редакт') || text.includes('edit') || text.includes('изменит') ||
            html.includes('pencil') || html.includes('edit') || html.includes('pen') ||
            html.includes('M11 4H4') || html.includes('M17 3a2.828')) {
          matches.push({
            text: b.textContent?.trim().substring(0, 50),
            index: btns.indexOf(b),
          });
        }
      }
      return matches;
    });
    log(T, `Edit button candidates: ${JSON.stringify(editInfo)}`);

    if (editInfo.length > 0) {
      const allBtns = await page.$$('button, a, [role="button"]');
      if (allBtns[editInfo[0].index]) {
        await allBtns[editInfo[0].index].click();
        log(T, `Clicked edit button: "${editInfo[0].text}"`);
        await page.waitForTimeout(1500);
        await screenshot(page, T, 'profile-after-edit-click');

        // Check for form
        const formInfo = await page.evaluate(() => {
          const inputs = document.querySelectorAll('input:not([type="hidden"]), textarea, select');
          return [...inputs].map(i => ({
            name: i.getAttribute('name'),
            type: i.getAttribute('type'),
            placeholder: i.getAttribute('placeholder'),
            value: i.value?.substring(0, 50),
          }));
        });
        log(T, `Form inputs after edit: ${JSON.stringify(formInfo)}`);
      }
    } else {
      log(T, 'No edit button found on profile page');
    }
  }

  // ============================
  // NOW LOGIN AS DEMO-RESIDENT1
  // ============================
  log('resident-login', 'Switching to demo-resident1...');

  // Clear cookies/storage
  await context.clearCookies();
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });

  const residentLogin = await login(page, 'demo-resident1', 'resident-login');
  await screenshot(page, 'resident-login', 'login-resident-result');

  if (!residentLogin) {
    log('resident-login', 'WARNING: Resident login failed, trying to continue');
  }

  await page.waitForTimeout(2000);

  // ============================
  // TEST 8: RESIDENT DASHBOARD
  // ============================
  {
    const T = 'resident-dashboard';
    log(T, 'Checking resident dashboard...');
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 30000 });
    await waitForPage(page);
    await screenshot(page, T, 'resident-dashboard-before');
    const buttons = await listButtons(page, T);

    // Find all clickable cards
    const cards = await page.evaluate(() => {
      const cardEls = document.querySelectorAll('[class*="card"], [class*="tile"], [class*="widget"], [class*="item"]');
      return [...cardEls].slice(0, 20).map(c => ({
        text: c.textContent?.trim().substring(0, 100),
        class: c.className?.toString().substring(0, 80),
        clickable: c.tagName === 'A' || c.tagName === 'BUTTON' || c.style.cursor === 'pointer' || c.onclick !== null,
        rect: c.getBoundingClientRect().toJSON(),
      }));
    });
    log(T, `Cards found: ${JSON.stringify(cards).substring(0, 1000)}`);

    // Click first visible card
    const clickableCard = await page.$('[class*="card"]:visible, [class*="tile"]:visible');
    if (clickableCard) {
      await clickableCard.click();
      log(T, 'Clicked first card');
      await page.waitForTimeout(1500);
      await screenshot(page, T, 'resident-dashboard-after-card-click');
      log(T, `Now at: ${page.url()}`);
    }
  }

  // ============================
  // TEST 9: GUEST ACCESS
  // ============================
  {
    const T = 'guest-access';
    log(T, 'Navigating to /guest-access...');
    await page.goto(`${BASE}/guest-access`, { waitUntil: 'networkidle', timeout: 30000 });
    await waitForPage(page);
    await screenshot(page, T, 'guest-access-before');
    await listButtons(page, T);

    // Find create guest pass button
    const createInfo = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button, a, [role="button"]')];
      const matches = [];
      for (const b of btns) {
        const text = (b.textContent || '').toLowerCase();
        const html = b.innerHTML.toLowerCase();
        if (text.includes('создат') || text.includes('добав') || text.includes('пригласит') ||
            text.includes('новый') || text.includes('гост') || text.includes('пропуск') ||
            html.includes('plus') || html.includes('add') ||
            html.includes('M12 4v16') || html.includes('M12 6v12')) {
          matches.push({
            text: b.textContent?.trim().substring(0, 50),
            index: btns.indexOf(b),
          });
        }
      }
      return matches;
    });
    log(T, `Create guest pass candidates: ${JSON.stringify(createInfo)}`);

    if (createInfo.length > 0) {
      const allBtns = await page.$$('button, a, [role="button"]');
      if (allBtns[createInfo[0].index]) {
        await allBtns[createInfo[0].index].click();
        log(T, `Clicked: "${createInfo[0].text}"`);
        await page.waitForTimeout(2000);
        await screenshot(page, T, 'guest-access-after-create-click');

        // Check for form/modal
        const formInfo = await page.evaluate(() => {
          const inputs = document.querySelectorAll('input:not([type="hidden"]), textarea, select');
          return [...inputs].map(i => ({
            name: i.getAttribute('name'),
            type: i.getAttribute('type'),
            placeholder: i.getAttribute('placeholder'),
          }));
        });
        log(T, `Form inputs: ${JSON.stringify(formInfo)}`);
      }
    } else {
      log(T, 'No create guest pass button found');
    }
  }

  // ============================
  // TEST 10: RATE EMPLOYEES
  // ============================
  {
    const T = 'rate-employees';
    log(T, 'Navigating to /rate-employees...');
    await page.goto(`${BASE}/rate-employees`, { waitUntil: 'networkidle', timeout: 30000 });
    await waitForPage(page);
    await screenshot(page, T, 'rate-employees-before');
    await listButtons(page, T);

    // Check for rating UI (stars, sliders, etc.)
    const ratingUI = await page.evaluate(() => {
      const stars = document.querySelectorAll('[class*="star"], [class*="rating"], [class*="Star"], svg[class*="star"]');
      const sliders = document.querySelectorAll('input[type="range"], [class*="slider"]');
      const cards = document.querySelectorAll('[class*="card"], [class*="employee"]');
      return {
        stars: stars.length,
        sliders: sliders.length,
        cards: [...cards].slice(0, 10).map(c => c.textContent?.trim().substring(0, 80)),
        pageText: document.body.innerText.substring(0, 500),
      };
    });
    log(T, `Rating UI: ${JSON.stringify(ratingUI)}`);

    // Try clicking a star or rating element
    const starEl = await page.$('[class*="star"]:visible, [class*="rating"] svg:visible, [class*="Star"]:visible');
    if (starEl) {
      await starEl.click();
      log(T, 'Clicked star/rating element');
      await page.waitForTimeout(1000);
      await screenshot(page, T, 'rate-employees-after-star');
    } else {
      // Try clicking first card
      const card = await page.$('[class*="card"]:visible, [class*="employee"]:visible');
      if (card) {
        await card.click();
        log(T, 'Clicked first employee card');
        await page.waitForTimeout(1500);
        await screenshot(page, T, 'rate-employees-after-card');
      } else {
        log(T, 'No rating UI or employee cards found');
      }
    }
    await screenshot(page, T, 'rate-employees-after');
  }

  // Save results
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
  console.log(`\n\nResults saved to ${RESULTS_FILE}`);
  console.log(`Screenshots saved to ${SCREENSHOT_DIR}`);

  await browser.close();
  console.log('Done!');
})();
