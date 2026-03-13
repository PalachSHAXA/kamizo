import puppeteer from 'puppeteer-core';
import * as path from 'path';

const BASE_URL = 'https://demo.kamizo.uz';
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

  // Go to site
  await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));

  // Screenshot the login page
  await page.screenshot({ path: path.join(__dirname, 'debug-1-initial.png'), fullPage: true });
  console.log('1. Initial page screenshot taken');

  // Check what inputs exist
  const inputInfo = await page.evaluate(() => {
    const inputs = document.querySelectorAll('input');
    return Array.from(inputs).map(i => ({
      type: i.type,
      name: i.name,
      placeholder: i.placeholder,
      id: i.id,
      className: i.className.substring(0, 50),
    }));
  });
  console.log('Inputs found:', JSON.stringify(inputInfo, null, 2));

  // Check buttons
  const buttonInfo = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    return Array.from(buttons).map(b => ({
      type: b.type,
      text: b.textContent?.trim().substring(0, 30),
      disabled: b.disabled,
    }));
  });
  console.log('Buttons found:', JSON.stringify(buttonInfo, null, 2));

  // Fill login
  const inputs = await page.$$('input');
  console.log(`\nTotal input elements: ${inputs.length}`);

  // Find the login input (first text-like input)
  for (let i = 0; i < inputs.length; i++) {
    const type = await page.evaluate((el: any) => el.type, inputs[i]);
    const placeholder = await page.evaluate((el: any) => el.placeholder, inputs[i]);
    console.log(`  Input ${i}: type=${type}, placeholder="${placeholder}"`);
  }

  // Type into login field
  if (inputs.length >= 2) {
    await inputs[0].click({ clickCount: 3 });
    await page.keyboard.type('demo-resident1');
    console.log('\nTyped login');

    await inputs[1].click({ clickCount: 3 });
    await page.keyboard.type('kamizo');
    console.log('Typed password');
  }

  await page.screenshot({ path: path.join(__dirname, 'debug-2-filled.png'), fullPage: true });
  console.log('2. After fill screenshot taken');

  // Check checkbox state
  const checkboxes = await page.$$('input[type="checkbox"]');
  console.log(`\nCheckboxes found: ${checkboxes.length}`);
  if (checkboxes.length > 0) {
    const checked = await page.evaluate((el: any) => el.checked, checkboxes[0]);
    console.log(`  Checkbox checked: ${checked}`);

    // Click the checkbox label or the checkbox itself
    // Try clicking the parent label
    await page.evaluate(() => {
      const checkbox = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
      if (checkbox) {
        checkbox.click();
      }
    });

    const checkedAfter = await page.evaluate((el: any) => el.checked, checkboxes[0]);
    console.log(`  Checkbox after click: ${checkedAfter}`);
  }

  await page.screenshot({ path: path.join(__dirname, 'debug-3-checkbox.png'), fullPage: true });
  console.log('3. After checkbox screenshot taken');

  // Check if submit button is now enabled
  const submitBtn = await page.$('button[type="submit"]');
  if (submitBtn) {
    const disabled = await page.evaluate((el: any) => el.disabled, submitBtn);
    console.log(`\nSubmit button disabled: ${disabled}`);

    // Click submit
    await submitBtn.click();
    console.log('Clicked submit');
  }

  await new Promise(r => setTimeout(r, 5000));
  await page.screenshot({ path: path.join(__dirname, 'debug-4-after-submit.png'), fullPage: true });
  console.log('4. After submit screenshot taken');
  console.log(`   URL: ${page.url()}`);

  // Check for errors
  const errors = await page.evaluate(() => {
    const els = document.querySelectorAll('.text-red-500, .text-red-600, [role="alert"]');
    return Array.from(els).map(e => e.textContent?.trim());
  });
  if (errors.length) console.log('Errors:', errors);

  // Check localStorage
  const authToken = await page.evaluate(() => localStorage.getItem('auth_token'));
  console.log(`auth_token: ${authToken ? authToken.substring(0, 20) + '...' : 'null'}`);

  await browser.close();
}

run().catch(console.error);
