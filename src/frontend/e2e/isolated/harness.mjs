import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { HARNESS_READY_WAIT, createRunContext, spawnIsolated, stopChildren, waitForHttp } from './harness-lib.mjs';
import { contractFromCreateTableSnapshot, replaceTableContracts, validateSchemaContract } from './schema-contract.mjs';
import { migrationFiles } from './schema-plan.mjs';
import { configuredPorts } from './ports.mjs';
import { buildSeedSql } from './seed.mjs';
import { writeWranglerConfig } from './wrangler-config.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(here, '..', '..');
const repoRoot = resolve(frontendRoot, '..', '..');
const cloudflareRoot = join(repoRoot, 'cloudflare');
const stateDirName = 'state';
const demoCoreContractTables = [
  'buildings',
  'meeting_eligible_voters', 'meeting_participated_voters',
  'meeting_vote_records', 'meeting_protocols',
];
const commonProductionContractTables = ['employee_ratings'];
const demoCommerceTables = [
  'marketplace_categories', 'marketplace_products', 'marketplace_orders',
  'marketplace_order_items', 'marketplace_order_history', 'marketplace_favorites',
  'marketplace_reviews', 'ad_categories', 'ads', 'rental_apartments',
  'rental_records', 'rental_listings', 'rental_listing_photos', 'vehicles',
  'guest_access_codes', 'guest_access_logs',
];
const demoFinanceTables = [
  'finance_estimates', 'finance_estimate_buildings', 'finance_estimate_staff',
  'finance_estimate_items', 'finance_charges', 'finance_payments', 'personal_accounts',
  'finance_penalty_settings', 'finance_penalties', 'finance_income_categories',
  'finance_income', 'finance_expenses', 'finance_materials', 'finance_material_usage',
  'finance_access', 'finance_claims',
];
const demoEngagementTables = [
  'training_partners', 'training_proposals', 'training_votes',
  'training_registrations', 'training_feedback', 'training_notifications',
  'employee_ratings', 'notes',
];
const children = [];
const ports = configuredPorts();
const apiOrigin = `http://127.0.0.1:${ports.api}`;
const webOrigin = `http://127.0.0.1:${ports.web}`;
const redirectOrigin = `http://127.0.0.1:${ports.redirect}`;
let cleanupPromise;

function log(message) {
  if (process.env.KAMIZO_E2E_QUIET !== '1') console.log(`[e2e-harness] ${message}`);
}

function command(bin, args, options = {}) {
  return new Promise((resolveCommand, reject) => {
    const child = spawnIsolated(bin, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.push(child);
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('error', reject);
    child.once('exit', code => {
      if (code === 0) resolveCommand(output);
      else reject(new Error(`${bin} ${args.join(' ')} exited ${code}\n${output}`));
    });
  });
}

function startChild(bin, args, options = {}) {
  const child = spawnIsolated(bin, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  const prefix = options.prefix ?? bin;
  child.stdout.on('data', chunk => {
    if (process.env.KAMIZO_E2E_QUIET !== '1') process.stdout.write(`[${prefix}] ${chunk}`);
  });
  child.stderr.on('data', chunk => process.stderr.write(`[${prefix}] ${chunk}`));
  return child;
}

function wranglerArgs(configPath, envPath, stateDir, extra) {
  return [
    'wrangler', ...extra,
    '--config', configPath,
    '--env-file', envPath,
    '--local',
    '--persist-to', stateDir,
  ];
}

async function localSchemaInfo(configPath, envPath, stateDir, tables) {
  const tableList = tables.map(table => `'${table.replaceAll("'", "''")}'`).join(',');
  const output = await command('npx', wranglerArgs(configPath, envPath, stateDir, [
    'd1', 'execute', 'DB', '--command', `
      SELECT m.name AS table_name, p.cid, p.name, p.type,
             p."notnull" AS "notnull", p.dflt_value, p.pk
      FROM sqlite_master m
      JOIN pragma_table_info(m.name) p
      WHERE m.type = 'table' AND m.name IN (${tableList})
      ORDER BY m.name, p.cid
    `, '--json', '--yes',
  ]), { cwd: cloudflareRoot });
  const start = output.indexOf('[');
  const parsed = JSON.parse(output.slice(start));
  const rows = parsed[0]?.results ?? parsed[0]?.result?.[0]?.results ?? [];
  return Object.fromEntries(tables.map(table => [
    table,
    rows
      .filter(row => row.table_name === table)
      .map(({ table_name: _tableName, ...column }) => column),
  ]));
}

async function validateLocalSchema(configPath, envPath, stateDir, demoPresentation) {
  const contractPath = join(here, 'prod-schema-contract.json');
  const contractDocument = JSON.parse(await readFile(contractPath, 'utf8'));
  const snapshot = await readFile(join(
    cloudflareRoot, 'src', 'lib', 'demo', '__tests__', 'fixtures', 'demo-production-schema.sql',
  ), 'utf8');
  Object.assign(contractDocument.tables, contractFromCreateTableSnapshot(
    snapshot,
    demoPresentation
      ? [
        ...demoCoreContractTables, ...demoCommerceTables,
        ...demoFinanceTables, ...demoEngagementTables,
      ]
      : commonProductionContractTables,
  ));
  const actualSchema = await localSchemaInfo(
    configPath, envPath, stateDir, Object.keys(contractDocument.tables),
  );
  validateSchemaContract(contractDocument.tables, actualSchema);
}

function startWorker(configPath, envPath, stateDir, prefix) {
  return startChild('npx', wranglerArgs(configPath, envPath, stateDir, [
    'wrangler', 'dev', '--ip', '127.0.0.1', '--port', String(ports.api), '--log-level', 'warn',
    '--show-interactive-dev-session', 'false',
  ]).slice(1), { cwd: cloudflareRoot, prefix });
}

async function cleanup(context) {
  if (!cleanupPromise) {
    cleanupPromise = (async () => {
      await stopChildren(children);
      await context.cleanup();
    })();
  }
  return cleanupPromise;
}

async function main() {
  let context;
  let parentWatchdog;
  try {
    context = await createRunContext(process.env.KAMIZO_E2E_RUN_ID);
    if (process.env.KAMIZO_E2E_FAIL_STAGE === 'after-run-dir') {
      throw new Error('Forced E2E setup failure after run directory creation');
    }

    const stateDir = join(context.runDir, stateDirName);
    const seedPath = join(context.runDir, 'seed.sql');
    const demoPresentation = process.argv.includes('--demo-presentation');
    const { configPath, envPath } = await writeWranglerConfig({
      runDir: context.runDir,
      workerEntry: join(here, 'worker-entry.ts'),
      redirectOrigin,
    });

    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.once(signal, () => {
        cleanup(context).then(() => process.exit(0), error => {
          console.error(error);
          process.exit(1);
        });
      });
    }
    const coordinatorPid = process.ppid;
    parentWatchdog = setInterval(() => {
      try {
        process.kill(coordinatorPid, 0);
      } catch {
        cleanup(context).then(() => process.exit(0), () => process.exit(1));
      }
    }, 250);

    log(`initializing disposable D1 in ${context.runDir}`);
    const schemaPlan = JSON.parse(await readFile(join(here, 'schema-plan.json'), 'utf8'));
    let baselinePath = join(cloudflareRoot, schemaPlan.baseline);
    const snapshotPath = join(
      cloudflareRoot, 'src', 'lib', 'demo', '__tests__', 'fixtures', 'demo-production-schema.sql',
    );
    const generatedBaselinePath = join(context.runDir, 'schema.production.sql');
    await writeFile(generatedBaselinePath, replaceTableContracts(
      await readFile(baselinePath, 'utf8'),
      await readFile(snapshotPath, 'utf8'),
      demoPresentation
        ? [...demoCoreContractTables, ...demoEngagementTables, 'personal_accounts']
        : commonProductionContractTables,
    ));
    baselinePath = generatedBaselinePath;
    await command('npx', wranglerArgs(configPath, envPath, stateDir, [
      'd1', 'execute', 'DB', '--file', baselinePath, '--yes',
    ]), { cwd: cloudflareRoot });

    const redirectServer = startChild(process.execPath, [join(here, 'redirect-server.mjs')], {
      cwd: frontendRoot,
      prefix: 'redirect',
    });
    await waitForHttp(`${redirectOrigin}/health`, { attempts: 20, intervalMs: 100 });

    if (schemaPlan.runtimeBootstrap) {
      const bootstrapWorker = startWorker(configPath, envPath, stateDir, 'worker-bootstrap');
      await waitForHttp(`${apiOrigin}/__e2e/browser-marker`, {
        ...HARNESS_READY_WAIT,
      });
      const migrationResponse = await fetch(
        `${apiOrigin}/api/public/tenant-exists?slug=schema-bootstrap`,
        { signal: AbortSignal.timeout(120_000) },
      );
      if (!migrationResponse.ok) {
        throw new Error(`Runtime schema bootstrap failed: HTTP ${migrationResponse.status}`);
      }
      await stopChildren([bootstrapWorker]);
    }

    await command('npx', wranglerArgs(configPath, envPath, stateDir, [
      'd1', 'execute', 'DB', '--file', join(here, 'prod-common-overlay.sql'), '--yes',
    ]), { cwd: cloudflareRoot });
    if (demoPresentation) {
      await command('npx', wranglerArgs(configPath, envPath, stateDir, [
        'd1', 'execute', 'DB', '--file', join(here, 'prod-schema-overlay.sql'), '--yes',
      ]), { cwd: cloudflareRoot });
    }
    for (const migration of migrationFiles(schemaPlan.migrations, demoPresentation)) {
      await command('npx', wranglerArgs(configPath, envPath, stateDir, [
        'd1', 'execute', 'DB', '--file', join(cloudflareRoot, 'migrations', migration), '--yes',
      ]), { cwd: cloudflareRoot });
    }
    await validateLocalSchema(configPath, envPath, stateDir, demoPresentation);

    await writeFile(seedPath, await buildSeedSql({
      password: 'kamizo-e2e',
      superadminPassword: 'kamizo-e2e-superadmin',
    }));
    await command('npx', wranglerArgs(configPath, envPath, stateDir, [
      'd1', 'execute', 'DB', '--file', seedPath, '--yes',
    ]), { cwd: cloudflareRoot });
    const worker = startWorker(configPath, envPath, stateDir, 'worker');
    await waitForHttp(`${apiOrigin}/__e2e/browser-marker`, {
      ...HARNESS_READY_WAIT,
    });
    const runtimeResponse = await fetch(
      `${apiOrigin}/api/public/tenant-exists?slug=e2e`,
      { signal: AbortSignal.timeout(30_000) },
    );
    if (!runtimeResponse.ok) throw new Error(`Final Worker bootstrap failed: HTTP ${runtimeResponse.status}`);
    await waitForHttp(`${apiOrigin}/__e2e/ready`, {
      attempts: 80,
      intervalMs: 500,
    });

    const rentalsMocks = process.argv.includes('--rentals-mocks');
    const marketplaceMocks = process.argv.includes('--marketplace-mocks');
    const viteArgs = ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(ports.web), '--strictPort'];
    // Rentals changes import-time auth/tenant state and needs a fresh optimize pass.
    // Marketplace data is runtime-only; forcing re-optimization made its first 320px load 20-30s.
    if (rentalsMocks) viteArgs.push('--force');
    const vite = startChild('npm', viteArgs, {
      cwd: frontendRoot,
      prefix: 'vite',
      env: {
        ...process.env,
        ...(rentalsMocks ? {
          VITE_MOCK_RENTALS_STATE: 'populated',
        } : {}),
        ...(marketplaceMocks ? { VITE_MOCK_MARKETPLACE: '1' } : {}),
        ...(demoPresentation ? { VITE_DEMO_TENANT: '1' } : {}),
      },
    });
    await waitForHttp(webOrigin, { attempts: 60, intervalMs: 500 });
    log('Worker, D1, and Vite are ready');

    await Promise.race([
      new Promise((_, reject) => redirectServer.once('exit', code => reject(new Error(`Redirect server exited unexpectedly (${code})`)))),
      new Promise((_, reject) => worker.once('exit', code => reject(new Error(`Worker exited unexpectedly (${code})`)))),
      new Promise((_, reject) => vite.once('exit', code => reject(new Error(`Vite exited unexpectedly (${code})`)))),
    ]);
  } finally {
    if (parentWatchdog) clearInterval(parentWatchdog);
    if (context) await cleanup(context);
  }
}

main().catch(error => {
  console.error(`[e2e-harness] ${error instanceof Error ? error.stack : error}`);
  process.exitCode = 1;
});
