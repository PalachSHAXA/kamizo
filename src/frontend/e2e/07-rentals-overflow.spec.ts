// Rentals + Marketplace horizontal-overflow audit at narrow widths.
//
// Runs against `npm run dev` (localhost:5173) with VITE_MOCK_RENTALS_STATE
// and VITE_MOCK_MARKETPLACE both set — the two dev-mock modules prime
// auth/tenant stores at module-load, so we can navigate to every screen
// without hitting the real API.
//
// For each screen × each width:
//   1. Set viewport to that width (height fixed at 800)
//   2. Navigate + wait for network idle
//   3. Assert document.documentElement.scrollWidth ≤ clientWidth + 1
//   4. If it overflows, dump the offending element chain (widest chain of
//      children whose scrollWidth > their parent's clientWidth) so the
//      failure identifies the actual culprit, not just "something overflowed"
//
// Long-content test: for create step 2 we inject a max-price/max-area
// combination via localStorage before navigate — proves the layout holds
// under the widest realistic content, not just the mock defaults.

import { test, expect, type Page } from '@playwright/test';

const WIDTHS = [320, 360, 390, 430];

// Find the deepest element whose scrollWidth exceeds its clientWidth by
// more than 1px — the actual overflow source, not just a symptom parent.
async function findOverflowSource(page: Page): Promise<string> {
  return page.evaluate(() => {
    function describe(el: Element): string {
      const cls = (el.getAttribute('class') || '').slice(0, 80);
      const tag = el.tagName.toLowerCase();
      const id = el.id ? `#${el.id}` : '';
      const text = (el.textContent || '').trim().slice(0, 40).replace(/\s+/g, ' ');
      const rect = (el as HTMLElement).getBoundingClientRect();
      return `${tag}${id}.${cls}  sw=${(el as HTMLElement).scrollWidth} cw=${(el as HTMLElement).clientWidth} rect_r=${Math.round(rect.right)} text="${text}"`;
    }
    const offenders: Element[] = [];
    const walk = (el: Element) => {
      const he = el as HTMLElement;
      if (he.scrollWidth > he.clientWidth + 1) {
        offenders.push(el);
      }
      for (const c of Array.from(el.children)) walk(c);
    };
    walk(document.body);
    // Deepest first — the leaf tells us the real culprit
    offenders.sort((a, b) => {
      const depth = (el: Element) => { let d = 0, p: Element | null = el; while (p) { p = p.parentElement; d++; } return d; };
      return depth(b) - depth(a);
    });
    return offenders.slice(0, 5).map(describe).join('\n    ');
  });
}

async function assertNoHorizontalScroll(page: Page, label: string) {
  const [sw, cw] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  if (sw > cw + 1) {
    const chain = await findOverflowSource(page);
    throw new Error(
      `[${label}] horizontal overflow: scrollWidth=${sw} clientWidth=${cw} (+${sw - cw}px)\n  Overflow chain (deepest first):\n    ${chain}`
    );
  }
}

// Screens that don't require the multi-step create flow. Each has a
// stable URL and either renders standalone or reaches an interesting
// state via a couple of clicks.
const RENTALS_SCREENS: Array<{ path: string; label: string; setup?: (p: Page) => Promise<void> }> = [
  { path: '/apartment-rentals', label: 'feed (populated)' },
  { path: '/apartment-rentals/mine', label: 'my-listings' },
  { path: '/apartment-rentals/rl-01', label: 'detail (rl-01, УК)' },
  { path: '/apartment-rentals/rl-02', label: 'detail (rl-02, neighbour)' },
  { path: '/apartment-rentals/rl-05', label: 'detail (rl-05, hidden by УК)' },
  { path: '/apartment-rentals/create', label: 'create step 1 (photos)' },
  // Sprint 88 — manager moderation surface. Route is role-gated, but in
  // dev the mock primes a resident user; the mock also primes tenant
  // features so hasFeature('rental_listings') is true — the page still
  // renders (ProtectedRoute redirects would surface as a different URL
  // and thus test failure). The overflow gate is what we care about here,
  // not the role gate itself (see wire-test for that).
  // Sprint 88 — manager moderation surface. Route is role-gated
  // (admin/manager/director); `?role=manager` param instructs the
  // rentals mock to prime the auth store with that role, which lets
  // ProtectedRoute pass. Ignored in prod builds. Tap each tab to
  // verify the tab-row layout at every filled state.
  { path: '/rentals-moderation?role=manager', label: 'moderation (all tabs sequentially)', setup: async (p) => {
      for (const label of ['Скрытые', 'Сданные', 'Архив', 'Активные']) {
        const tab = p.locator(`button:has-text("${label}")`).first();
        if (await tab.count()) { await tab.click(); await p.waitForTimeout(150); }
      }
  } },
  // Hide sheet open — hide-reason textarea + reason-length counter
  // must not push the sheet past the viewport.
  { path: '/rentals-moderation?role=manager', label: 'moderation with hide-sheet open', setup: async (p) => {
      // Wait for at least one active card, then hit the red "Скрыть" button.
      const hide = p.locator('button:has-text("Скрыть")').first();
      if (await hide.count()) { await hide.click(); await p.waitForTimeout(200); }
  } },
];

for (const width of WIDTHS) {
  test.describe(`Rentals overflow @ ${width}w`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
    });

    for (const s of RENTALS_SCREENS) {
      test(`${s.label}`, async ({ page }) => {
        await page.goto(s.path);
        // Small wait for layout to settle after route mount
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForTimeout(300);
        if (s.setup) await s.setup(page);
        await assertNoHorizontalScroll(page, `${s.label} @ ${width}w`);
      });
    }

    // Create step 2 is behind a "next" button that requires ≥3 uploaded
    // photos. In dev-mode we shortcut via ?step=N.
    test('create step 2 (fields) — default content', async ({ page }) => {
      await page.goto('/apartment-rentals/create?step=2');
      await page.waitForTimeout(300);
      await assertNoHorizontalScroll(page, `create step 2 default @ ${width}w`);
    });

    test('create step 2 (fields) — long content stress', async ({ page }) => {
      // Longest realistic content: 15 000 000 price (8 chars w/ separators),
      // 3-digit floor, long description. Set via URL params so the create
      // page picks them up on mount (dev-only hook).
      await page.goto('/apartment-rentals/create?step=2&price=15000000&area=250&floor=100&floorTotal=100');
      await page.waitForTimeout(300);
      await assertNoHorizontalScroll(page, `create step 2 long content @ ${width}w`);
    });

    test('create step 3 (review)', async ({ page }) => {
      await page.goto('/apartment-rentals/create?step=3');
      await page.waitForTimeout(300);
      await assertNoHorizontalScroll(page, `create step 3 @ ${width}w`);
    });
  });
}

// Marketplace at the same widths — user asked for the same check
const MARKETPLACE_SCREENS: Array<{ path: string; label: string }> = [
  { path: '/marketplace', label: 'marketplace feed' },
];

for (const width of WIDTHS) {
  test.describe(`Marketplace overflow @ ${width}w`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
    });
    for (const s of MARKETPLACE_SCREENS) {
      test(`${s.label}`, async ({ page }) => {
        await page.goto(s.path);
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForTimeout(300);
        await assertNoHorizontalScroll(page, `${s.label} @ ${width}w`);
      });
    }
  });
}
