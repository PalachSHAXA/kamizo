import puppeteer from 'puppeteer-core';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'https://demo.kamizo.uz';
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844, scale: 2 },
  { name: 'tablet', width: 768, height: 1024, scale: 1 },
  { name: 'desktop', width: 1440, height: 900, scale: 1 },
];

interface RoleConfig {
  name: string;
  login: string;
  password: string;
  pages: { name: string; path: string }[];
}

const ROLES: RoleConfig[] = [
  {
    name: 'resident',
    login: 'demo-resident1',
    password: 'kamizo',
    pages: [
      { name: 'dashboard', path: '/' },
      { name: 'requests', path: '/requests' },
      { name: 'meetings', path: '/meetings' },
      { name: 'announcements', path: '/announcements' },
      { name: 'marketplace', path: '/marketplace' },
      { name: 'chat', path: '/chat' },
      { name: 'profile', path: '/profile' },
      { name: 'useful-contacts', path: '/useful-contacts' },
      { name: 'vehicles', path: '/vehicles' },
      { name: 'guest-access', path: '/guest-access' },
      { name: 'rate-employees', path: '/rate-employees' },
      { name: 'contract', path: '/contract' },
      { name: 'notepad', path: '/notepad' },
    ],
  },
  {
    name: 'manager',
    login: 'demo-manager',
    password: 'kamizo',
    pages: [
      { name: 'dashboard', path: '/' },
      { name: 'requests', path: '/requests' },
      { name: 'residents', path: '/residents' },
      { name: 'buildings', path: '/buildings' },
      { name: 'meetings', path: '/meetings' },
      { name: 'announcements', path: '/announcements' },
      { name: 'marketplace', path: '/marketplace' },
      { name: 'chat', path: '/chat' },
      { name: 'profile', path: '/profile' },
      { name: 'useful-contacts', path: '/useful-contacts' },
      { name: 'colleagues', path: '/colleagues' },
      { name: 'executors', path: '/executors' },
      { name: 'work-orders', path: '/work-orders' },
      { name: 'reports', path: '/reports' },
      { name: 'monitoring', path: '/monitoring' },
      { name: 'guest-access', path: '/guest-access' },
      { name: 'vehicle-search', path: '/vehicle-search' },
    ],
  },
  {
    name: 'admin',
    login: 'demo-admin',
    password: 'kamizo',
    pages: [
      { name: 'dashboard', path: '/' },
      { name: 'requests', path: '/requests' },
      { name: 'residents', path: '/residents' },
      { name: 'buildings', path: '/buildings' },
      { name: 'meetings', path: '/meetings' },
      { name: 'announcements', path: '/announcements' },
      { name: 'marketplace', path: '/marketplace' },
      { name: 'chat', path: '/chat' },
      { name: 'profile', path: '/profile' },
      { name: 'settings', path: '/settings' },
      { name: 'useful-contacts', path: '/useful-contacts' },
      { name: 'colleagues', path: '/colleagues' },
      { name: 'executors', path: '/executors' },
      { name: 'work-orders', path: '/work-orders' },
      { name: 'reports', path: '/reports' },
      { name: 'monitoring', path: '/monitoring' },
      { name: 'team', path: '/team' },
      { name: 'trainings', path: '/trainings' },
    ],
  },
];

const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Get auth data once via API call from a browser page, return serializable auth data
async function getAuthData(browser: any, loginName: string, password: string): Promise<{ token: string; user: any } | null> {
  const page = await browser.newPage();
  await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(2000);

  const result: any = await page.evaluate(async (creds: { login: string; password: string }) => {
    try {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: creds.login, password: creds.password }),
      });
      if (!resp.ok) return { error: `${resp.status}: ${await resp.text()}` };
      const data: any = await resp.json();
      const user = {
        ...data.user,
        passwordChangedAt: data.user.password_changed_at,
        contractSignedAt: data.user.contract_signed_at,
        buildingId: data.user.building_id,
        totalArea: data.user.total_area,
        signatureKey: data.user.signature_key,
      };
      return { token: data.token, user };
    } catch (e: any) {
      return { error: e.message };
    }
  }, { login: loginName, password });

  await page.close();

  if (result.error) {
    console.log(`    Login API failed: ${result.error}`);
    return null;
  }

  return { token: result.token, user: result.user };
}

// Set auth data in page localStorage (no API call needed)
async function setAuthInPage(page: any, authData: { token: string; user: any }) {
  await page.evaluate((data: any) => {
    localStorage.setItem('auth_token', data.token);
    localStorage.setItem('uk-auth-storage', JSON.stringify({
      state: { user: data.user, token: data.token, isLoading: false, error: null, additionalUsers: {} },
      version: 3,
    }));
  }, authData);
}

async function takeScreenshots() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  ensureDir(SCREENSHOTS_DIR);

  for (const role of ROLES) {
    console.log(`\n=== Role: ${role.name} (${role.login}) ===`);

    // Login ONCE per role via API
    console.log(`  Getting auth token...`);
    const authData = await getAuthData(browser, role.login, role.password);
    if (!authData) {
      console.log(`  SKIPPING ${role.name} — login failed`);
      continue;
    }
    console.log(`  Auth OK: ${authData.user.name} (${authData.user.role})`);

    for (const viewport of VIEWPORTS) {
      console.log(`\n  Viewport: ${viewport.name} (${viewport.width}x${viewport.height})`);

      const page = await browser.newPage();
      await page.setViewport({
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: viewport.scale,
      });

      // Set auth in localStorage (no API call)
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(1000);
      await setAuthInPage(page, authData);

      // Reload to apply auth
      await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 30000 });
      await sleep(2000);

      const roleDir = path.join(SCREENSHOTS_DIR, role.name, viewport.name);
      ensureDir(roleDir);

      for (const pg of role.pages) {
        try {
          console.log(`    → ${pg.path}`);
          await page.goto(`${BASE_URL}${pg.path}`, {
            waitUntil: 'networkidle0',
            timeout: 20000,
          });
          await sleep(2500);

          await page.screenshot({
            path: path.join(roleDir, `${pg.name}.png`),
            fullPage: true,
          });
          console.log(`    ✓ ${pg.name}.png`);
        } catch (err: any) {
          console.log(`    ✗ ${pg.name}: ${err.message?.substring(0, 80)}`);
        }
      }

      await page.close();
    }

    // Small delay between roles
    console.log(`\n  Done with ${role.name}, waiting 3s...`);
    await sleep(3000);
  }

  await browser.close();
  console.log('\n\nDone!');
}

takeScreenshots().catch(console.error);
