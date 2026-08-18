import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';

import { INTEGRATION_READY_WAIT, stopChildren, waitForHttp } from './harness-lib.mjs';

test('harness serves the real Worker with freshly seeded authentication', { timeout: 270_000 }, async () => {
  const child = spawn(process.execPath, ['e2e/isolated/harness.mjs'], {
    cwd: new URL('../..', import.meta.url),
    env: { ...process.env, KAMIZO_E2E_QUIET: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const childExit = new Promise((_, reject) => {
    child.once('exit', code => reject(new Error(`Harness exited before readiness (${code})\n${output}`)));
  });

  try {
    await Promise.race([
      waitForHttp('http://127.0.0.1:8787/__e2e/ready', INTEGRATION_READY_WAIT),
      childExit,
    ]);
    const response = await fetch('http://127.0.0.1:8787/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
      body: JSON.stringify({ login: 'resident', password: 'kamizo-e2e', tenantSlug: 'e2e' }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.json();

    assert.equal(response.status, 200, output || JSON.stringify(body));
    assert.match(body.token, /^eyJ/);
    assert.equal(body.user.role, 'resident');
    assert.equal(body.user.tenant_id, 'e2e-tenant');

    const managerLogin = await fetch('http://127.0.0.1:8787/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:5173',
        'cf-connecting-ip': '127.0.0.20',
      },
      body: JSON.stringify({ login: 'manager', password: 'kamizo-e2e', tenantSlug: 'e2e' }),
      signal: AbortSignal.timeout(10_000),
    });
    const manager = await managerLogin.json();
    const debtorsResponse = await fetch('http://127.0.0.1:8787/api/finance/debtors', {
      headers: { authorization: `Bearer ${manager.token}` },
      signal: AbortSignal.timeout(10_000),
    });
    const debtors = await debtorsResponse.json();
    assert.equal(debtorsResponse.status, 200, JSON.stringify(debtors));
    assert.equal(debtors.debtors.length, 1, JSON.stringify(debtors));

    const outboundResponse = await fetch('http://127.0.0.1:8787/__e2e/outbound-probe', {
      signal: AbortSignal.timeout(5_000),
    });
    assert.equal(outboundResponse.status, 200, output);
    assert.deepEqual(await outboundResponse.json(), {
      directProduction: 'blocked',
      redirectedProduction: 'blocked',
    });

    const bindingsResponse = await fetch('http://127.0.0.1:8787/__e2e/bindings-probe', {
      signal: AbortSignal.timeout(5_000),
    });
    assert.equal(bindingsResponse.status, 200, output);
    assert.deepEqual(await bindingsResponse.json(), {
      connectionManager: 'ok',
      contractsBucket: 'ok',
    });
  } finally {
    await stopChildren([child]);
  }
});

test('demo harness provisions the exact core phase against its authoritative schema plan', { timeout: 270_000 }, async () => {
  const child = spawn(process.execPath, ['e2e/isolated/harness.mjs', '--demo-presentation'], {
    cwd: new URL('../..', import.meta.url),
    env: { ...process.env, KAMIZO_E2E_QUIET: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const childExit = new Promise((_, reject) => {
    child.once('exit', code => reject(new Error(`Demo harness exited before readiness (${code})\n${output}`)));
  });

  try {
    await Promise.race([
      waitForHttp('http://127.0.0.1:8787/__e2e/ready', INTEGRATION_READY_WAIT),
      childExit,
    ]);
    const login = await fetch('http://127.0.0.1:8787/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '127.0.3.1' },
      body: JSON.stringify({ login: 'superadmin', password: 'kamizo-e2e-superadmin' }),
      signal: AbortSignal.timeout(10_000),
    });
    const credentials = await login.json();
    assert.equal(login.status, 200, output || JSON.stringify(credentials));

    const provision = await fetch('http://127.0.0.1:8787/api/super-admin/demo/provision', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${credentials.token}`,
        'content-type': 'application/json',
        origin: 'https://demo.kamizo.uz',
        'cf-connecting-ip': '127.0.3.2',
      },
      body: JSON.stringify({ phases: ['core'] }),
      signal: AbortSignal.timeout(120_000),
    });
    const body = await provision.json();

    assert.equal(provision.status, 200, `${JSON.stringify(body)}\n${output}`);
    assert.deepEqual(body.results?.map(result => result.phase), ['core']);
  } finally {
    await stopChildren([child]);
  }
});
