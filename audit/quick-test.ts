import puppeteer from 'puppeteer-core';
import * as path from 'path';

const BASE_URL = 'https://demo.kamizo.uz';
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

  // Navigate
  await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(2000);

  // Login via API from browser
  const result: any = await page.evaluate(async () => {
    const resp = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'demo-resident1', password: 'kamizo' }),
    });
    if (!resp.ok) return { error: await resp.text() };
    const data: any = await resp.json();

    const user = {
      ...data.user,
      passwordChangedAt: data.user.password_changed_at,
      contractSignedAt: data.user.contract_signed_at,
      buildingId: data.user.building_id,
      totalArea: data.user.total_area,
      signatureKey: data.user.signature_key,
    };

    localStorage.setItem('auth_token', data.token);
    localStorage.setItem('uk-auth-storage', JSON.stringify({
      state: { user, token: data.token, isLoading: false, error: null, additionalUsers: {} },
      version: 3,
    }));

    return { name: user.name };
  });

  console.log('Login:', result);

  // Reload
  await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(3000);

  // Take screenshot with unique name
  const outPath = path.join(__dirname, 'screenshots', 'test', `verify_${Date.now()}.png`);
  await page.screenshot({ path: outPath, fullPage: true });
  console.log('Screenshot:', outPath);

  // Also check what the page shows
  const pageTitle = await page.evaluate(() => document.querySelector('h1,h2,h3')?.textContent?.trim());
  console.log('Page heading:', pageTitle);

  const hasBottomBar = await page.evaluate(() => !!document.querySelector('[class*="BottomBar"], [class*="bottom-bar"]'));
  console.log('Has bottom bar:', hasBottomBar);

  await browser.close();
}

run().catch(console.error);
