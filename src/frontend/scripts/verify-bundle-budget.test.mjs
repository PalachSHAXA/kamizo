import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const verifier = resolve('scripts/verify-bundle-budget.mjs');

function baseManifest() {
  return {
    'index.html': {
      file: 'assets/entry.js',
      src: 'index.html',
      isEntry: true,
      dynamicImports: ['_App.js'],
    },
    '_App.js': {
      file: 'assets/App.js',
      isDynamicEntry: true,
      dynamicImports: ['src/components/layout/index.ts'],
    },
    'src/components/layout/index.ts': {
      file: 'assets/layout.js',
      src: 'src/components/layout/index.ts',
      isDynamicEntry: true,
      imports: ['_shell.js'],
      dynamicImports: ['src/pages/LazyPage.tsx'],
    },
    '_shell.js': { file: 'assets/shell.js' },
    'src/pages/LazyPage.tsx': {
      file: 'assets/lazy-page.js',
      src: 'src/pages/LazyPage.tsx',
      isDynamicEntry: true,
    },
  };
}

function runFixture({ manifest = baseManifest(), html = '', sizes = {}, rawManifest } = {}) {
  const directory = mkdtempSync(resolve(tmpdir(), 'kamizo-budget-'));
  mkdirSync(resolve(directory, '.vite'));
  mkdirSync(resolve(directory, 'assets'));
  writeFileSync(
    resolve(directory, '.vite/manifest.json'),
    rawManifest ?? JSON.stringify(manifest),
  );
  writeFileSync(resolve(directory, 'index.html'), html);

  if (rawManifest === undefined) {
    for (const record of Object.values(manifest)) {
      if (typeof record?.file !== 'string' || !record.file.endsWith('.js')) continue;
      const sizeKiB = sizes[record.file] ?? 1;
      writeFileSync(resolve(directory, record.file), randomBytes(sizeKiB * 1024));
    }
  }

  const result = spawnSync(process.execPath, [verifier, directory], { encoding: 'utf8' });
  rmSync(directory, { recursive: true, force: true });
  return result;
}

test('passes and reports separate public and authenticated closures', () => {
  const result = runFixture();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /public\/login gzip:/);
  assert.match(result.stdout, /authenticated shell gzip:/);
});

test('fails when entry exceeds 60 KiB gzip', () => {
  const result = runFixture({ sizes: { 'assets/entry.js': 61 } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /entry gzip .* exceeds 60\.00 KiB/);
});

test('fails when public login closure exceeds 120 KiB gzip', () => {
  const result = runFixture({ sizes: { 'assets/App.js': 121 } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /public\/login gzip .* exceeds 120\.00 KiB/);
});

test('fails when authenticated shell exceeds 180 KiB gzip', () => {
  const result = runFixture({ sizes: { 'assets/layout.js': 181 } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /authenticated shell gzip .* exceeds 180\.00 KiB/);
});

test('fails when a heavy library enters the public closure', () => {
  const manifest = baseManifest();
  manifest['_App.js'].imports = ['node_modules/recharts/es6/index.js'];
  manifest['node_modules/recharts/es6/index.js'] = {
    file: 'assets/chart-runtime.js',
    src: 'node_modules/recharts/es6/index.js',
  };
  const result = runFixture({ manifest });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /heavy chunks in public\/login closure: chart-runtime\.js/);
});

test('fails when a heavy library enters the authenticated shell closure', () => {
  const manifest = baseManifest();
  manifest['src/components/layout/index.ts'].imports.push('_exceljs.min.js');
  manifest['_exceljs.min.js'] = { file: 'assets/exceljs.min-test.js' };
  const result = runFixture({ manifest });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /heavy chunks in authenticated shell closure: exceljs\.min-test\.js/);
});

test('does not count lazy page imports beyond Layout', () => {
  const manifest = baseManifest();
  manifest['src/pages/LazyPage.tsx'].imports = ['node_modules/xlsx/xlsx.mjs'];
  manifest['node_modules/xlsx/xlsx.mjs'] = {
    file: 'assets/xlsx-lazy.js',
    src: 'node_modules/xlsx/xlsx.mjs',
  };
  const result = runFixture({ manifest });
  assert.equal(result.status, 0, result.stderr);
});

test('includes and rejects heavy index modulepreloads', () => {
  const manifest = baseManifest();
  manifest['node_modules/xlsx/xlsx.mjs'] = {
    file: 'assets/xlsx-preload.js',
    src: 'node_modules/xlsx/xlsx.mjs',
  };
  const result = runFixture({
    manifest,
    html: '<link href="/assets/xlsx-preload.js" crossorigin rel="modulepreload">',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /heavy modulepreloads in index\.html: xlsx-preload\.js/);
});

test('fails when Layout cannot be located from App dynamic imports', () => {
  const manifest = baseManifest();
  manifest['_App.js'].dynamicImports = ['src/pages/LazyPage.tsx'];
  const result = runFixture({ manifest });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Layout dynamic entry could not be located/);
});

test('locates Vite internal Layout records by name through App dynamic imports', () => {
  const manifest = baseManifest();
  const layout = manifest['src/components/layout/index.ts'];
  delete manifest['src/components/layout/index.ts'];
  manifest['_Layout-hash.js'] = { ...layout, name: 'Layout', src: undefined };
  manifest['_App.js'].dynamicImports = ['_Layout-hash.js'];
  const result = runFixture({ manifest });
  assert.equal(result.status, 0, result.stderr);
});

test('fails cleanly for invalid manifest JSON', () => {
  const result = runFixture({ rawManifest: '{not-json' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /manifest is malformed/);
});

test('fails cleanly for an unresolved manifest import', () => {
  const manifest = baseManifest();
  manifest['_App.js'].imports = ['_missing.js'];
  const result = runFixture({ manifest });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /manifest is malformed: unresolved import _missing\.js/);
});
