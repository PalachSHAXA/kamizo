import { request, type FullConfig } from '@playwright/test';
import * as fs from 'node:fs';
import globalSetup from './global-setup';
import { API, tokenFile } from './helpers/auth';

const DEMO_ORIGIN = 'https://demo.kamizo.uz';

export default async function demoGlobalSetup(config: FullConfig) {
  await globalSetup(config);
  const tokens = JSON.parse(fs.readFileSync(tokenFile(), 'utf8')) as Record<string, { token: string }>;
  const superadminToken = tokens.superadmin?.token;
  if (!superadminToken) throw new Error('demoGlobalSetup: superadmin token is missing');

  const ctx = await request.newContext();
  try {
    const response = await ctx.post(`${API}/api/super-admin/demo/provision`, {
      data: { phases: ['core', 'engagement', 'commerce', 'finance'] },
      headers: {
        authorization: `Bearer ${superadminToken}`,
        'content-type': 'application/json',
        origin: DEMO_ORIGIN,
        'cf-connecting-ip': '127.0.1.1',
      },
      timeout: 120_000,
    });
    if (!response.ok()) {
      throw new Error(`demoGlobalSetup: provision failed: ${response.status()} ${await response.text()}`);
    }
    const body = await response.json() as { results?: Array<{ phase: string }> };
    const phases = body.results?.map((phase) => phase.phase) ?? [];
    if (phases.join(',') !== 'core,commerce,finance,engagement') {
      throw new Error(`demoGlobalSetup: unexpected phases ${JSON.stringify(phases)}`);
    }
    console.log('[setup] provisioned local demo phases: core, commerce, finance, engagement');
  } finally {
    await ctx.dispose();
  }
}
