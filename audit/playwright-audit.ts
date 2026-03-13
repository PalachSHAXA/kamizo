import { chromium, Page, BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'https://demo.kamizo.uz';

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
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

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function loginViaPage(page: Page, loginName: string, password: string): Promise<boolean> {
  // Navigate to the site - will show login page
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Call login API from the browser context and set localStorage with transformed user
  const result: any = await page.evaluate(async ({ login, password }: any) => {
    try {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, password }),
      });
      if (!resp.ok) {
        return { error: `${resp.status}: ${await resp.text()}` };
      }
      const data: any = await resp.json();
      // Transform user from snake_case to camelCase (matching authApi.login)
      const user = {
        ...data.user,
        passwordChangedAt: data.user.password_changed_at || data.user.passwordChangedAt,
        contractSignedAt: data.user.contract_signed_at || data.user.contractSignedAt,
        buildingId: data.user.building_id || data.user.buildingId,
        totalArea: data.user.total_area || data.user.totalArea,
        signatureKey: data.user.signature_key || data.user.signatureKey,
      };
      // Set auth token
      localStorage.setItem('auth_token', data.token);
      // Set zustand persist state
      localStorage.setItem('uk-auth-storage', JSON.stringify({
        state: {
          user,
          token: data.token,
          isLoading: false,
          error: null,
          additionalUsers: {},
        },
        version: 3,
      }));
      return { success: true, name: user.name, role: user.role };
    } catch (e: any) {
      return { error: e.message };
    }
  }, { login: loginName, password });

  if (result.error) {
    console.log(`    Login failed: ${result.error}`);
    return false;
  }

  console.log(`    Logged in as ${result.name} (${result.role})`);

  // Reload the page so the app reads the token from localStorage
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  return true;
}

async function takeScreenshots() {
  const browser = await chromium.launch({
    executablePath: '/Users/shaxzodisamahamadov/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  ensureDir(SCREENSHOTS_DIR);

  for (const role of ROLES) {
    console.log(`\n=== Role: ${role.name} (${role.login}) ===`);

    for (const viewport of VIEWPORTS) {
      console.log(`\n  Viewport: ${viewport.name} (${viewport.width}x${viewport.height})`);

      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.name === 'mobile' ? 2 : 1,
        bypassCSP: true,
      });

      const page = await context.newPage();

      // Login using the same page
      console.log(`  Logging in as ${role.login}...`);
      const loggedIn = await loginViaPage(page, role.login, role.password);
      if (!loggedIn) {
        console.log(`  SKIPPING ${role.name}/${viewport.name} - login failed`);
        await page.close();
        await context.close();
        continue;
      }

      const roleDir = path.join(SCREENSHOTS_DIR, role.name, viewport.name);
      ensureDir(roleDir);

      for (const pg of role.pages) {
        try {
          console.log(`    → ${pg.path}`);
          await page.goto(`${BASE_URL}${pg.path}`, {
            waitUntil: 'networkidle',
            timeout: 20000,
          });
          await page.waitForTimeout(2500);

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
      await context.close();
    }

    // Small delay between roles to avoid rate limiting
    console.log(`  Waiting 5s before next role...`);
    await new Promise(r => setTimeout(r, 5000));
  }

  await browser.close();
  console.log('\n\nDone! Screenshots saved to:', SCREENSHOTS_DIR);
}

takeScreenshots().catch(console.error);
