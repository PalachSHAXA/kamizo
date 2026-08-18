import { request, FullConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { API, CREDS, tokenFile, type Role } from './helpers/auth';
import { writePrivateJson } from './isolated/harness-lib.mjs';

export default async function globalSetup(_config: FullConfig) {
  const TOKEN_FILE = tokenFile();
  fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });

  const ctx = await request.newContext();
  try {
    const tokens: Record<string, { token: string; user: unknown }> = {};
    const roles = Object.keys(CREDS) as Role[];

    for (let i = 0; i < roles.length; i++) {
      const role = roles[i];
      const { login, password } = CREDS[role];
      const res = await ctx.post(`${API}/api/auth/login`, {
        data: { login, password, tenantSlug: 'e2e' },
        headers: {
          'content-type': 'application/json',
          'cf-connecting-ip': `127.0.0.${i + 1}`,
        },
        timeout: 10_000,
      });
      if (!res.ok()) {
        throw new Error(`globalSetup: login ${role} failed: ${res.status()} ${await res.text()}`);
      }
      tokens[role] = await res.json() as { token: string; user: unknown };
      console.log(`[setup] issued run-scoped token for ${role}`);
    }
    await writePrivateJson(TOKEN_FILE, tokens);
  } finally {
    await ctx.dispose();
  }
}
