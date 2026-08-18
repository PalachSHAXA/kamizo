import { describe, expect, it } from 'vitest';

import { demoRoleManifest } from '../manifest';
import { demoId } from '../ids';

describe('demo role manifest', () => {
  it('exposes each allowlisted presentation login once without super_admin', () => {
    expect(demoRoleManifest.map((role) => role.login)).toEqual([
      'demo-director',
      'demo-manager',
      '98765432',
      'demo-executor',
      'demo-security',
      'demo-shop',
      'demo-director-admin',
      'demo-dept-head',
      'demo-dispatcher',
      'demo-electrician',
      'demo-courier',
      'demo-tenant',
      'demo-advertiser',
    ]);
    expect(new Set(demoRoleManifest.map((role) => role.roleKey)).size).toBe(demoRoleManifest.length);
    expect(demoRoleManifest.some((role) => String(role.role) === 'super_admin')).toBe(false);
    expect(demoRoleManifest.filter((role) => role.primary).map((role) => role.roleKey)).toEqual([
      'director', 'manager', 'resident', 'executor', 'security', 'marketplace_manager',
    ]);
    expect(demoRoleManifest.find((role) => role.roleKey === 'courier')).toMatchObject({
      role: 'executor',
      specialization: 'courier',
    });
  });
});

describe('demoId', () => {
  it('returns the same RFC-4122-shaped identifier for the same namespace and key', async () => {
    const first = await demoId('tenant-a', 'building:caravan');
    const second = await demoId('tenant-a', 'building:caravan');

    expect(first).toBe('157b6438-c064-566d-b001-4102c8a9543f');
    expect(second).toBe(first);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('separates namespaces and keys', async () => {
    const ids = await Promise.all([
      demoId('tenant-a', 'building:caravan'),
      demoId('tenant-b', 'building:caravan'),
      demoId('tenant-a', 'building:mirzo'),
    ]);

    expect(new Set(ids).size).toBe(3);
  });
});
