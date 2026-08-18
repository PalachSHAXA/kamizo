import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createConnection, createServer } from 'node:net';
import test from 'node:test';

import { buildSeedSql } from './seed.mjs';
import {
  HARNESS_READY_WAIT,
  INTEGRATION_READY_WAIT,
  PLAYWRIGHT_WEB_SERVER_TIMEOUT_MS,
  createRunContext,
  readinessBudgetMs,
  spawnIsolated,
  stopChildren,
  waitForHttp,
  writePrivateJson,
} from './harness-lib.mjs';

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise(resolve => server.close(resolve));
  return port;
}

function pidExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function listenerExists(port) {
  return new Promise(resolve => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}
import { contractFromCreateTableSnapshot, replaceTableContracts, validateSchemaContract } from './schema-contract.mjs';
import { migrationFiles } from './schema-plan.mjs';
import { portsForRun } from './ports.mjs';
import { writeWranglerConfig } from './wrangler-config.mjs';

test('createRunContext owns a unique disposable directory', async () => {
  const first = await createRunContext();
  const second = await createRunContext();

  assert.notEqual(first.runDir, second.runDir);
  assert.equal(existsSync(first.runDir), true);
  assert.equal(existsSync(second.runDir), true);
  assert.equal((await stat(first.runDir)).mode & 0o777, 0o700);

  await first.cleanup();
  await first.cleanup();
  await second.cleanup();
  assert.equal(existsSync(first.runDir), false);
  assert.equal(existsSync(second.runDir), false);
});

test('portsForRun gives each run a stable separated local port block', () => {
  const first = portsForRun('demo-run-a');
  const again = portsForRun('demo-run-a');
  const second = portsForRun('demo-run-b');

  assert.deepEqual(first, again);
  assert.notDeepEqual(first, second);
  assert.equal(new Set(Object.values(first)).size, 3);
  assert.ok(Object.values(first).every(port => port >= 20_000 && port <= 49_999));
});

test('writePrivateJson creates token material with owner-only permissions', async () => {
  const context = await createRunContext();
  try {
    const file = `${context.runDir}/tokens.json`;
    await writePrivateJson(file, { token: 'ephemeral' });
    assert.equal((await stat(file)).mode & 0o777, 0o600);
  } finally {
    await context.cleanup();
  }
});

test('isolated Wrangler config raises only the E2E demo-login global cap', async () => {
  const context = await createRunContext();
  try {
    const { configPath } = await writeWranglerConfig({
      runDir: context.runDir,
      workerEntry: `${context.runDir}/worker.ts`,
    });
    const config = JSON.parse(await readFile(configPath, 'utf8'));

    assert.equal(config.vars.ENVIRONMENT, 'test');
    assert.equal(config.vars.DEMO_LOGIN_GLOBAL_LIMIT, '120');
    assert.ok(Number(config.vars.DEMO_LOGIN_GLOBAL_LIMIT) > 34 * 2);
  } finally {
    await context.cleanup();
  }
});

test('buildSeedSql creates tenant-scoped fixtures with PBKDF2 hashes', async () => {
  const sql = await buildSeedSql({ password: "local'pass", superadminPassword: 'root-pass' });

  assert.match(sql, /INSERT INTO tenants/);
  assert.match(sql, /'demo-tenant'.*'demo'/s);
  assert.match(sql, /INSERT INTO buildings/);
  assert.match(sql, /INSERT INTO apartments/);
  assert.match(sql, /e2e-tenant/);
  assert.match(sql, /50000:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+/);
  assert.doesNotMatch(sql, /local'pass/);
  assert.doesNotMatch(sql, /root-pass/);
  assert.doesNotMatch(sql, /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX)\b/i);
  assert.doesNotMatch(sql, /\bPRAGMA\b/i);
});

test('validateSchemaContract rejects missing and type-mismatched production columns', () => {
  const contract = {
    users: {
      exact: true,
      columns: [
        { name: 'id', type: 'TEXT' },
        { name: 'total_area', type: 'REAL' },
      ],
    },
  };

  assert.throws(
    () => validateSchemaContract(contract, {
      users: [{ name: 'id', type: 'TEXT' }],
    }),
    /users missing columns: total_area/,
  );
  assert.throws(
    () => validateSchemaContract(contract, {
      users: [
        { name: 'id', type: 'TEXT' },
        { name: 'total_area', type: 'INTEGER' },
      ],
    }),
    /users\.total_area type INTEGER != REAL/,
  );
});

test('validateSchemaContract rejects unexpected columns for exact snapshots', () => {
  assert.throws(
    () => validateSchemaContract({
      users: { exact: true, columns: [{ name: 'id', type: 'TEXT' }] },
    }, {
      users: [
        { name: 'id', type: 'TEXT' },
        { name: 'password_plain', type: 'TEXT' },
      ],
    }),
    /users unexpected columns: password_plain/,
  );
});

test('contractFromCreateTableSnapshot derives all top-level columns and ignores constraints', () => {
  const contract = contractFromCreateTableSnapshot(`
    CREATE TABLE orders (
      id TEXT PRIMARY KEY, amount REAL DEFAULT 0,
      status TEXT CHECK (status IN ('new','done')),
      UNIQUE(id, status)
    );
  `, ['orders']);

  assert.deepEqual(contract.orders, {
    exact: false,
    columns: [
      { name: 'id', type: 'TEXT' },
      { name: 'amount', type: 'REAL' },
      { name: 'status', type: 'TEXT' },
    ],
  });
});

test('replaceTableContracts swaps incompatible empty baseline tables without DROP or stale indexes', () => {
  const baseline = `
    CREATE TABLE IF NOT EXISTS accounts (id TEXT, old_balance INTEGER);
    CREATE INDEX idx_accounts_balance ON accounts(old_balance);
    CREATE TABLE untouched (id TEXT);
  `;
  const snapshot = `CREATE TABLE accounts (id TEXT, balance REAL);`;
  const generated = replaceTableContracts(baseline, snapshot, ['accounts']);

  assert.match(generated, /CREATE TABLE accounts \(id TEXT, balance REAL\);/);
  assert.doesNotMatch(generated, /old_balance|idx_accounts_balance|DROP TABLE/i);
  assert.match(generated, /CREATE TABLE untouched/);
});

test('buildSeedSql escapes fixture values used in SQL literals', async () => {
  const sql = await buildSeedSql({
    password: 'resident-pass',
    superadminPassword: 'root-pass',
    tenantName: "Owner's House",
  });

  assert.match(sql, /Owner''s House/);
  assert.doesNotMatch(sql, /Owner's House/);
});

test('demo presentation applies replay-safe authoritative commerce migrations in dependency order', () => {
  assert.deepEqual(migrationFiles(['base.sql'], true), [
    'base.sql',
    '054_marketplace_orders_add_order_type.sql',
    '055_marketplace_products_add_is_on_demand.sql',
    '056_marketplace_order_items_nullable_product_id.sql',
    '057_rental_listings.sql',
  ]);
  assert.deepEqual(migrationFiles(['base.sql'], false), ['base.sql']);
});

test('production schema overlay contains no table or column absent from the checked-in snapshot', async () => {
  const overlay = [
    await readFile(new URL('./prod-common-overlay.sql', import.meta.url), 'utf8'),
    await readFile(new URL('./prod-schema-overlay.sql', import.meta.url), 'utf8'),
  ].join('\n');
  const snapshot = await readFile(
    new URL('../../../../cloudflare/src/lib/demo/__tests__/fixtures/demo-production-schema.sql', import.meta.url),
    'utf8',
  );
  const multiTenantMigration = await readFile(
    new URL('../../../../cloudflare/migrations/0003_add_multi_tenancy.sql', import.meta.url),
    'utf8',
  );
  const tableBlocks = new Map();
  for (const match of snapshot.matchAll(/CREATE TABLE (\w+)\s*\(([\s\S]*?)\n\);/g)) {
    tableBlocks.set(match[1], match[2]);
  }

  for (const match of overlay.matchAll(/ALTER TABLE (\w+) ADD COLUMN (\w+)/g)) {
    const [, table, column] = match;
    if (tableBlocks.has(table)) {
      assert.match(tableBlocks.get(table), new RegExp(`(?:^|[,\\n])\\s*${column}\\s`, 'm'));
    } else {
      assert.match(multiTenantMigration, new RegExp(`ALTER TABLE ${table} ADD COLUMN ${column}\\s`, 'm'));
    }
  }
  for (const match of overlay.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/g)) {
    assert.ok(tableBlocks.has(match[1]), `${match[1]} is absent from production snapshot`);
  }
});

test('checked-in production contract covers every commerce table used by demo provision', async () => {
  const snapshot = await readFile(
    new URL('../../../../cloudflare/src/lib/demo/__tests__/fixtures/demo-production-schema.sql', import.meta.url),
    'utf8',
  );
  const required = {
    marketplace_products: ['is_on_demand', 'tenant_id'],
    marketplace_orders: ['order_type', 'price_offered_at', 'price_offered_expires_at', 'tenant_id'],
    marketplace_order_items: ['product_id', 'tenant_id'],
    ad_categories: ['name', 'description', 'name_ru', 'name_uz', 'tenant_id'],
    ads: ['advertiser_id', 'target_buildings', 'tenant_id'],
    rental_listings: ['publisher_user_id', 'source_type', 'state', 'tenant_id'],
    rental_listing_photos: ['listing_id', 'data_url', 'tenant_id'],
    vehicles: ['user_id', 'plate_number', 'tenant_id'],
    guest_access_codes: ['qr_token', 'status', 'tenant_id'],
    guest_access_logs: ['code_id', 'action', 'tenant_id'],
  };
  const contract = contractFromCreateTableSnapshot(snapshot, Object.keys(required));

  for (const [table, columns] of Object.entries(required)) {
    const actual = contract[table]?.columns?.map(column => column.name) ?? [];
    assert.deepEqual(columns.filter(column => !actual.includes(column)), [], `${table} contract is incomplete`);
  }
});

test('waitForHttp stops after the configured number of attempts', async () => {
  let calls = 0;

  await assert.rejects(
    waitForHttp('http://127.0.0.1:1/health', {
      attempts: 3,
      intervalMs: 1,
      fetchImpl: async () => {
        calls += 1;
        throw new Error('offline');
      },
    }),
    /not ready after 3 attempts/,
  );
  assert.equal(calls, 3);
});

test('waitForHttp keeps its abort timer referenced and leaves no handle after rejection', async () => {
  const moduleUrl = new URL('./harness-lib.mjs', import.meta.url).href;
  const script = `
    import { waitForHttp } from ${JSON.stringify(moduleUrl)};
    try {
      await waitForHttp('http://127.0.0.1:1/hangs', {
        attempts: 1,
        timeoutMs: 20,
        fetchImpl: async (_url, { signal }) => new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
      });
    } catch {
      process.stdout.write('aborted-cleanly');
    }
  `;
  const startedAt = Date.now();
  const child = spawn(process.execPath, ['--input-type=module', '--eval', script], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const exitCode = await new Promise((resolve, reject) => {
    const guard = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('child process leaked an active timeout handle'));
    }, 1_000);
    child.once('error', reject);
    child.once('exit', code => {
      clearTimeout(guard);
      resolve(code);
    });
  });

  assert.equal(exitCode, 0, stderr);
  assert.equal(stdout, 'aborted-cleanly');
  assert.ok(Date.now() - startedAt >= 15);
  assert.ok(Date.now() - startedAt < 1_000);
});

test('integration readiness budget covers slow cold compile without exceeding Playwright webServer', () => {
  const budget = readinessBudgetMs(INTEGRATION_READY_WAIT);
  assert.ok(budget > 180_000);
  assert.ok(budget <= PLAYWRIGHT_WEB_SERVER_TIMEOUT_MS);
});

test('harness Worker readiness uses the bounded cold-compile budget', () => {
  const budget = readinessBudgetMs(HARNESS_READY_WAIT);
  assert.ok(budget > 180_000);
  assert.ok(budget <= PLAYWRIGHT_WEB_SERVER_TIMEOUT_MS);
});

test('stopChildren terminates live children and is idempotent', async () => {
  class FakeChild extends EventEmitter {
    exitCode = null;
    signalCode = null;
    kills = [];

    kill(signal) {
      this.kills.push(signal);
      this.signalCode = signal;
      queueMicrotask(() => this.emit('exit', null, signal));
      return true;
    }
  }

  const child = new FakeChild();
  await stopChildren([child], { graceMs: 10 });
  await stopChildren([child], { graceMs: 10 });
  assert.deepEqual(child.kills, ['SIGTERM']);
});

test('stopChildren terminates isolated wrapper process groups including grandchild listeners', {
  skip: process.platform === 'win32',
  timeout: 10_000,
}, async () => {
  const port = await reservePort();
  const grandchildScript = `
    const { createServer } = require('node:net');
    const server = createServer(socket => socket.end('alive'));
    server.listen(${port}, '127.0.0.1', () => console.log('GRANDCHILD_READY:' + process.pid));
  `;
  const wrapperScript = `
    const { spawn } = require('node:child_process');
    spawn(process.execPath, ['--eval', ${JSON.stringify(grandchildScript)}], { stdio: ['ignore', 'inherit', 'inherit'] });
    setInterval(() => {}, 1000);
  `;
  const wrapper = spawnIsolated(process.execPath, ['--eval', wrapperScript], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let grandchildPid = 0;
  await new Promise((resolve, reject) => {
    const guard = setTimeout(() => reject(new Error('grandchild listener did not start')), 3_000);
    wrapper.stdout.on('data', chunk => {
      const match = String(chunk).match(/GRANDCHILD_READY:(\d+)/);
      if (!match) return;
      grandchildPid = Number(match[1]);
      clearTimeout(guard);
      resolve();
    });
    wrapper.once('error', reject);
  });

  assert.equal(await listenerExists(port), true);
  assert.equal(pidExists(wrapper.pid), true);
  assert.equal(pidExists(grandchildPid), true);
  await stopChildren([wrapper], { graceMs: 100 });
  await new Promise(resolve => setTimeout(resolve, 50));

  assert.equal(pidExists(wrapper.pid), false);
  assert.equal(pidExists(grandchildPid), false);
  assert.equal(await listenerExists(port), false);
  assert.doesNotThrow(() => process.kill(process.pid, 0));
});
