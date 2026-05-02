import { request, FullConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { CREDS, type Role } from './helpers/auth';

const API = 'http://localhost:8787';
const __filename_setup = fileURLToPath(import.meta.url);
const __dirname_setup = path.dirname(__filename_setup);
const TOKEN_FILE = path.join(__dirname_setup, '.auth', 'tokens.json');

// Log in each role once at the start so individual tests can grab the cached
// token without each one tripping the 5-per-minute /api/auth/login rate limit.
export default async function globalSetup(_config: FullConfig) {
  fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });

  // Skip re-login if cached tokens are <6 days old (JWTs expire at 7 days; leave 24h buffer)
  if (fs.existsSync(TOKEN_FILE)) {
    const ageMs = Date.now() - fs.statSync(TOKEN_FILE).mtimeMs;
    const SIX_DAYS = 6 * 24 * 60 * 60 * 1000;
    if (ageMs < SIX_DAYS) {
      console.log(`[setup] reusing cached tokens (age ${Math.round(ageMs/1000/60)}min)`);
      return;
    }
  }

  const ctx = await request.newContext();
  const tokens: Record<string, { token: string; user: any }> = {};
  const roles = Object.keys(CREDS) as Role[];

  // Login rate limit is 5/60s per IP. Burst 4, sleep 65s, repeat.
  // Spare one slot in each burst as buffer.
  const BURST = 4;
  for (let i = 0; i < roles.length; i++) {
    if (i > 0 && i % BURST === 0) {
      console.log(`[setup] login rate limit cooldown 65s after burst of ${BURST}`);
      await new Promise(r => setTimeout(r, 65_000));
    }
    const role = roles[i];
    const { login, password } = CREDS[role];
    const res = await ctx.post(`${API}/api/auth/login`, {
      data: { login, password },
      headers: { 'content-type': 'application/json' },
    });
    if (!res.ok()) {
      throw new Error(`globalSetup: login ${role} failed: ${res.status()} ${await res.text()}`);
    }
    tokens[role] = await res.json();
    console.log(`[setup] cached token for ${role}`);
  }

  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
  await ctx.dispose();
}
