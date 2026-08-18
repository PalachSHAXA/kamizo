import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function readWorkflow(name) {
  return parse(readFileSync(join(repoRoot, '.github', 'workflows', name), 'utf8'));
}

function stepIndex(steps, predicate) {
  return steps.findIndex((step) => predicate(step));
}

test('production deployment requires a verified manual dispatch from main', () => {
  const workflow = readWorkflow('deploy.yml');
  const dispatch = workflow.on.workflow_dispatch;
  const pushBranches = workflow.on.push?.branches ?? [];
  const production = workflow.jobs['deploy-production'];
  const condition = production.if.replaceAll(/\s+/g, ' ').trim();

  assert.deepEqual(pushBranches, ['develop']);
  assert.deepEqual(dispatch.inputs.backend_release_verified, {
    description: 'Backend deployed and smoke-tested on VPS',
    required: true,
    type: 'boolean',
    default: false,
  });
  assert.equal(production.environment, 'production');
  assert.match(condition, /github\.event_name == 'workflow_dispatch'/);
  assert.match(condition, /github\.ref == 'refs\/heads\/main'/);
  assert.match(condition, /inputs\.backend_release_verified == true/);
});

test('production deployment blocks on full isolated E2E before Wrangler', () => {
  const workflow = readWorkflow('deploy.yml');
  const steps = workflow.jobs['deploy-production'].steps;
  const unit = stepIndex(steps, (step) => step.run?.includes('npm run test'));
  const typecheck = stepIndex(steps, (step) => step.run?.includes('npm run typecheck'));
  const build = stepIndex(steps, (step) => step.run?.includes('npm run build:budget'));
  const browser = stepIndex(steps, (step) => step.run?.includes('npx playwright install --with-deps chromium'));
  const isolated = stepIndex(steps, (step) => step.run?.includes('npm run test:e2e:isolated'));
  const deploy = stepIndex(steps, (step) => step.uses === 'cloudflare/wrangler-action@v3');

  for (const [name, index] of Object.entries({ unit, typecheck, build, browser, isolated, deploy })) {
    assert.notEqual(index, -1, `missing production ${name} step`);
  }
  assert.ok(unit < isolated, 'unit tests must precede isolated E2E');
  assert.ok(typecheck < isolated, 'type-check must precede isolated E2E');
  assert.ok(build < isolated, 'build must precede isolated E2E');
  assert.ok(browser < isolated, 'Chromium install must precede isolated E2E');
  assert.ok(isolated < deploy, 'isolated E2E must block Wrangler deployment');
});

test('production workflow blocks deployment on the read-only backend ingress preflight', () => {
  const workflow = readWorkflow('deploy.yml');
  const steps = workflow.jobs['deploy-production'].steps;
  const preflight = stepIndex(steps, (step) =>
    step.run?.includes('preflight-backend-production.sh'),
  );
  const deploy = stepIndex(steps, (step) => step.uses === 'cloudflare/wrangler-action@v3');

  assert.notEqual(preflight, -1, 'missing production backend ingress preflight');
  assert.notEqual(deploy, -1, 'missing production deployment');
  assert.ok(preflight < deploy, 'backend ingress preflight must block production deployment');
  assert.equal(steps[preflight]['continue-on-error'], undefined);
});

test('isolated E2E checks cover pull requests and direct main pushes without deployment', () => {
  const workflow = readWorkflow('e2e-isolated.yml');

  assert.ok(workflow.on.pull_request !== undefined);
  assert.deepEqual(workflow.on.push?.branches, ['main']);
  assert.equal(
    Object.values(workflow.jobs).some((job) =>
      job.steps?.some((step) => step.uses === 'cloudflare/wrangler-action@v3' || /wrangler\s+deploy/.test(step.run ?? '')),
    ),
    false,
  );
});

test('develop runs checks and E2E but cannot automatically deploy staging', () => {
  const workflow = readWorkflow('deploy.yml');
  const dispatch = workflow.on.workflow_dispatch;
  const checks = workflow.jobs['develop-checks'];
  const staging = workflow.jobs['deploy-staging'];
  const condition = staging.if.replaceAll(/\s+/g, ' ').trim();

  assert.deepEqual(workflow.on.push?.branches, ['develop']);
  assert.deepEqual(dispatch.inputs.staging_config_verified, {
    description: 'Staging binding IDs and removed classes were manually verified',
    required: true,
    type: 'boolean',
    default: false,
  });
  assert.match(checks.if.replaceAll(/\s+/g, ' ').trim(), /github\.ref == 'refs\/heads\/develop'/);
  assert.ok(checks.steps.some((step) => step.run?.includes('npm run test:e2e:isolated')));
  assert.equal(
    checks.steps.some((step) => step.uses === 'cloudflare/wrangler-action@v3' || /wrangler\s+deploy/.test(step.run ?? '')),
    false,
  );
  assert.equal(staging.environment, 'staging');
  assert.equal(staging.needs, 'develop-checks');
  assert.match(condition, /github\.event_name == 'workflow_dispatch'/);
  assert.match(condition, /github\.ref == 'refs\/heads\/develop'/);
  assert.match(condition, /inputs\.staging_config_verified == true/);
});

test('staging preflight blocks Wrangler and production verifies the app origin', () => {
  const workflow = readWorkflow('deploy.yml');
  const stagingSteps = workflow.jobs['deploy-staging'].steps;
  const preflight = stepIndex(stagingSteps, (step) => step.run?.includes('preflight-staging-config'));
  const deploy = stepIndex(stagingSteps, (step) => step.uses === 'cloudflare/wrangler-action@v3');
  const productionVerify = workflow.jobs['deploy-production'].steps.find(
    (step) => step.name === 'Verify production frontend bundle',
  );

  assert.equal(workflow.env.PRODUCTION_URL, 'https://app.kamizo.uz');
  assert.notEqual(preflight, -1, 'missing staging config preflight');
  assert.notEqual(deploy, -1, 'missing staging Wrangler deploy');
  assert.ok(preflight < deploy, 'staging preflight must block Wrangler deployment');
  assert.equal(productionVerify.run, './scripts/verify-frontend-bundle.sh "$PRODUCTION_URL"');
});
