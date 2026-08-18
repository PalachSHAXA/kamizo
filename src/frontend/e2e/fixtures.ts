import { test as base, expect } from '@playwright/test';
import { apiProxyHeaders, LOCAL_WEB_ORIGIN, localApiUrl } from './isolated/network.mjs';

type IsolatedFixtures = {
  apiTenantOrigin: string;
  isolatedNetwork: void;
};

export const test = base.extend<IsolatedFixtures>({
  apiTenantOrigin: [LOCAL_WEB_ORIGIN, { option: true }],
  isolatedNetwork: [async ({ context, apiTenantOrigin }, use) => {
    await context.route(/https?:\/\/.*/, async route => {
      const url = new URL(route.request().url());
      if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
        await route.continue();
      } else {
        await route.abort('blockedbyclient');
      }
    });

    await context.route('https://api.kamizo.uz/**', async route => {
      const headers = apiProxyHeaders(route.request().headers(), apiTenantOrigin);
      let response;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          response = await route.fetch({
            url: localApiUrl(route.request().url()),
            headers,
            timeout: 15_000,
            maxRedirects: 0,
          });
          break;
        } catch (error) {
          if (attempt === 2) throw error;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      if (!response) throw new Error('Local API proxy exhausted retries');
      const location = response.headers().location;
      if (location) {
        const target = new URL(location, route.request().url());
        if (target.hostname !== '127.0.0.1' && target.hostname !== 'localhost') {
          await route.abort('blockedbyclient');
          return;
        }
      }
      await route.fulfill({
        response,
        headers: {
          ...response.headers(),
          'access-control-allow-origin': LOCAL_WEB_ORIGIN,
        },
      });
    });

    await context.routeWebSocket('wss://api.kamizo.uz/**', webSocket => {
      webSocket.close();
    });

    try {
      await use();
    } finally {
      await context.unrouteAll({ behavior: 'ignoreErrors' });
    }
  }, { auto: true }],
});

export const demoTest = test.extend({
  apiTenantOrigin: 'https://demo.kamizo.uz',
});

export { expect };
