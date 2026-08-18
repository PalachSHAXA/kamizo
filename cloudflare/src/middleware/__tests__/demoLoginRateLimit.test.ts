import { describe, expect, it } from 'vitest';

import {
  DEMO_LOGIN_GLOBAL_LIMIT,
  DEMO_LOGIN_ROLE_LIMIT,
  checkDemoLoginProcessLimit,
  resolveDemoLoginGlobalLimit,
} from '../demoLoginRateLimit';

describe('process-atomic demo login limiter', () => {
  it('keeps the production global limit at 30 even if an override is present', () => {
    expect(resolveDemoLoginGlobalLimit('production', '120')).toBe(30);

    const tenant = 'tenant-production-default';
    const now = 500_000;
    for (let attempt = 0; attempt < 30; attempt++) {
      expect(checkDemoLoginProcessLimit(tenant, `role-${attempt}`, now).allowed).toBe(true);
    }
    expect(checkDemoLoginProcessLimit(tenant, 'overflow', now).reason).toBe('global');
  });

  it('accepts a validated global override only in the isolated test environment', () => {
    expect(resolveDemoLoginGlobalLimit('test', '120')).toBe(120);
    expect(resolveDemoLoginGlobalLimit('test', 'not-a-number')).toBe(30);
    expect(resolveDemoLoginGlobalLimit('staging', '120')).toBe(30);

    const tenant = 'tenant-e2e-override';
    const now = 750_000;
    for (let attempt = 0; attempt < 34; attempt++) {
      expect(checkDemoLoginProcessLimit(tenant, `role-${attempt}`, now, 120).allowed).toBe(true);
    }
  });

  it('enforces one per-role cap regardless of caller IP identity', () => {
    const tenant = 'tenant-role-cap';
    const now = 1_000_000;
    for (let attempt = 0; attempt < DEMO_LOGIN_ROLE_LIMIT; attempt++) {
      expect(checkDemoLoginProcessLimit(tenant, 'resident', now).allowed).toBe(true);
    }

    expect(checkDemoLoginProcessLimit(tenant, 'resident', now)).toMatchObject({
      allowed: false, reason: 'role', retryAfterSec: 60,
    });
  });

  it('enforces one tenant-global cap across spoofed role and IP attempts', () => {
    const tenant = 'tenant-global-cap';
    const now = 2_000_000;
    for (let attempt = 0; attempt < DEMO_LOGIN_GLOBAL_LIMIT; attempt++) {
      expect(checkDemoLoginProcessLimit(tenant, `spoofed-role-${attempt}`, now).allowed).toBe(true);
    }

    expect(checkDemoLoginProcessLimit(tenant, 'another-role', now)).toMatchObject({
      allowed: false, reason: 'global', retryAfterSec: 60,
    });
  });

  it('does not consume the global bucket when an already-full role is denied', () => {
    const tenant = 'tenant-atomic-cap';
    const now = 3_000_000;
    for (let attempt = 0; attempt < DEMO_LOGIN_ROLE_LIMIT; attempt++) {
      expect(checkDemoLoginProcessLimit(tenant, 'manager', now).allowed).toBe(true);
    }
    expect(checkDemoLoginProcessLimit(tenant, 'manager', now).reason).toBe('role');

    for (let attempt = DEMO_LOGIN_ROLE_LIMIT; attempt < DEMO_LOGIN_GLOBAL_LIMIT; attempt++) {
      expect(checkDemoLoginProcessLimit(tenant, `other-${attempt}`, now).allowed).toBe(true);
    }
    expect(checkDemoLoginProcessLimit(tenant, 'overflow', now).reason).toBe('global');
  });

  it('opens fresh role and global windows after sixty seconds', () => {
    const tenant = 'tenant-window-reset';
    const start = 4_000_000;
    for (let attempt = 0; attempt < DEMO_LOGIN_ROLE_LIMIT; attempt++) {
      checkDemoLoginProcessLimit(tenant, 'security', start);
    }
    expect(checkDemoLoginProcessLimit(tenant, 'security', start).allowed).toBe(false);
    expect(checkDemoLoginProcessLimit(tenant, 'security', start + 60_000).allowed).toBe(true);
  });
});
