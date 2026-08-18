import { randomBytes } from 'node:crypto';
import { chmod, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

export async function writeWranglerConfig({ runDir, workerEntry, redirectOrigin = 'http://127.0.0.1:8790' }) {
  const configPath = join(runDir, 'wrangler.e2e.json');
  const envPath = join(runDir, '.dev.vars');
  const main = relative(runDir, workerEntry);
  const config = {
    name: 'kamizo-e2e-local',
    main,
    compatibility_date: '2026-08-15',
    compatibility_flags: ['nodejs_compat'],
    vars: {
      ENVIRONMENT: 'test',
      DEMO_LOGIN_GLOBAL_LIMIT: '120',
      BASE_DOMAIN: 'kamizo.uz',
      VAPID_EMAIL: 'e2e@localhost',
      E2E_REDIRECT_ORIGIN: redirectOrigin,
    },
    d1_databases: [{
      binding: 'DB',
      database_name: 'kamizo-e2e',
      database_id: '00000000-0000-0000-0000-000000000001',
    }],
    kv_namespaces: [{
      binding: 'RATE_LIMITER',
      id: '00000000000000000000000000000001',
    }],
    r2_buckets: [{
      binding: 'CONTRACTS_BUCKET',
      bucket_name: 'kamizo-e2e-contracts',
    }],
    durable_objects: {
      bindings: [{
        name: 'CONNECTION_MANAGER',
        class_name: 'E2EConnectionManager',
      }],
    },
    migrations: [{
      tag: 'e2e-v1',
      new_sqlite_classes: ['E2EConnectionManager'],
    }],
  };
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  await writeFile(envPath, `JWT_SECRET=${randomBytes(48).toString('base64url')}\n`);
  await chmod(envPath, 0o600);
  return { configPath, envPath };
}
