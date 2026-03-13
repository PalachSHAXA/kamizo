import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'https://demo.kamizo.uz';
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots', 'admin', 'desktop');

async function run() {
  if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  
  const resp = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'demo-admin', password: 'kamizo' }),
  });
  if (!resp.ok) { console.log('Login failed:', resp.status, await resp.text()); return; }
  const data = await resp.json() as any;
  console.log('Logged in as', data.user.name);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const setupPage = await context.newPage();
  await setupPage.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await setupPage.waitForTimeout(1000);
  await setupPage.evaluate(({ token, user }) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth-storage', JSON.stringify({ state: { user, token, isLoading: false, error: null, additionalUsers: {} }, version: 3 }));
  }, { token: data.token, user: data.user });
  await setupPage.close();

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
    await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `${name}.png`), fullPage: true });
    console.log(`✓ ${name}.png`);
  }
  await browser.close();
}
run().catch(console.error);
