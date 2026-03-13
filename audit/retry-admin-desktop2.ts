import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'https://demo.kamizo.uz';
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots', 'admin', 'desktop');

async function run() {
  if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  const loginPage = await context.newPage();
  await loginPage.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await loginPage.waitForTimeout(2000);

  const loginResult: any = await loginPage.evaluate(async ({ login, password }: any) => {
    const resp = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, password }),
    });
    if (!resp.ok) return { error: resp.status + ': ' + (await resp.text()) };
    const data: any = await resp.json();
    localStorage.setItem('auth_token', data.token);
    localStorage.setItem('auth-storage', JSON.stringify({
      state: { user: data.user, token: data.token, isLoading: false, error: null, additionalUsers: {} },
      version: 3,
    }));
    return { success: true, name: data.user.name };
  }, { login: 'demo-admin', password: 'kamizo' });

  console.log('Login result:', loginResult);
  await loginPage.close();

  if (loginResult.error) { console.log('Aborting'); await browser.close(); return; }

  const page = await context.newPage();
  const pages = [
    'dashboard:/', 'requests:/requests', 'residents:/residents', 'buildings:/buildings',
    'meetings:/meetings', 'announcements:/announcements', 'marketplace:/marketplace',
    'chat:/chat', 'profile:/profile', 'settings:/settings', 'useful-contacts:/useful-contacts',
    'colleagues:/colleagues', 'executors:/executors', 'work-orders:/work-orders',
    'reports:/reports', 'monitoring:/monitoring', 'team:/team', 'trainings:/trainings',
  ];

  for (const p of pages) {
    const [name, route] = p.split(':');
    try {
      await page.goto(BASE_URL + route, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, name + '.png'), fullPage: true });
      console.log('ok ' + name + '.png');
    } catch (err: any) {
      console.log('fail ' + name + ': ' + (err.message || '').substring(0, 80));
    }
  }
  await browser.close();
}
run().catch(console.error);
