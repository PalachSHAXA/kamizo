import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const ENTRY_LIMIT = 60 * 1024;
const PUBLIC_LIMIT = 120 * 1024;
const AUTHENTICATED_LIMIT = 180 * 1024;
const forbiddenChunkNames = /^(charts|exceljs(?:\.min)?|xlsx|docx-gen)-/;
const forbiddenSources = /(?:^|\/)(?:recharts|exceljs|xlsx|docxtemplater|pizzip|docx)(?:\/|$)/;
const layoutSource = /(?:^|\/)src\/components\/layout\/(?:index\.ts|Layout\.tsx)$/;

function fail(message) {
  throw new Error(message);
}

function readManifest(manifestPath) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    fail(`manifest is malformed: cannot parse ${manifestPath}`);
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    fail('manifest is malformed: root must be an object');
  }
  return manifest;
}

function parseModulePreloads(html) {
  const hrefs = [];
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = tag.match(/\brel\s*=\s*["']([^"']+)["']/i)?.[1] || '';
    if (!rel.split(/\s+/).includes('modulepreload')) continue;
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href) fail('index.html is malformed: modulepreload has no href');
    hrefs.push(basename(href.split(/[?#]/, 1)[0]));
  }
  return hrefs;
}

function verify(distDir) {
  const manifestPath = resolve(distDir, '.vite/manifest.json');
  const manifest = readManifest(manifestPath);
  const recordsByKey = Object.fromEntries(
    Object.entries(manifest).map(([key, record]) => {
      if (!record || typeof record !== 'object' || typeof record.file !== 'string') {
        fail(`manifest is malformed: record ${key} has no file`);
      }
      return [key, { key, ...record }];
    }),
  );
  const records = Object.values(recordsByKey);
  const entryRecord = records.find((record) => record.isEntry);
  if (!entryRecord) fail('manifest is malformed: no entry record');

  function resolveEdges(record, field) {
    const keys = record[field] || [];
    if (!Array.isArray(keys)) fail(`manifest is malformed: ${record.key}.${field} must be an array`);
    return keys.map((key) => {
      const target = recordsByKey[key];
      if (!target) fail(`manifest is malformed: unresolved import ${key} from ${record.key}`);
      return target;
    });
  }

  function collectStaticClosure(startRecords) {
    const closure = [];
    const seen = new Set();
    const pending = [...startRecords];
    while (pending.length > 0) {
      const record = pending.pop();
      if (seen.has(record.file)) continue;
      seen.add(record.file);
      closure.push(record);
      pending.push(...resolveEdges(record, 'imports'));
    }
    return closure;
  }

  const html = readFileSync(resolve(distDir, 'index.html'), 'utf8');
  const preloadNames = parseModulePreloads(html);
  const preloadRecords = preloadNames.map((name) => {
    const record = records.find((candidate) => basename(candidate.file) === name);
    if (!record) fail(`manifest is malformed: unresolved modulepreload ${name}`);
    return record;
  });
  const appRecords = resolveEdges(entryRecord, 'dynamicImports');
  if (appRecords.length === 0) fail('manifest is malformed: entry has no App dynamic import');

  const publicClosure = collectStaticClosure([entryRecord, ...appRecords, ...preloadRecords]);
  const layoutCandidates = appRecords.flatMap((record) => resolveEdges(record, 'dynamicImports'));
  const layoutRecord = layoutCandidates.find((record) =>
    record.name === 'Layout'
    || layoutSource.test(record.key)
    || (typeof record.src === 'string' && layoutSource.test(record.src))
  );
  if (!layoutRecord) fail('Layout dynamic entry could not be located from App dynamic imports');
  const authenticatedClosure = collectStaticClosure([...publicClosure, layoutRecord]);

  function gzipBytes(closure) {
    return closure
      .filter((record) => record.file.endsWith('.js'))
      .reduce((total, record) => (
        total + gzipSync(readFileSync(resolve(distDir, record.file))).byteLength
      ), 0);
  }

  function heavyChunks(closure) {
    return closure
      .filter((record) => (
        forbiddenSources.test(record.key)
        || (typeof record.src === 'string' && forbiddenSources.test(record.src))
        || forbiddenChunkNames.test(basename(record.file))
      ))
      .map((record) => basename(record.file));
  }

  const entryGzip = gzipBytes([entryRecord]);
  const publicGzip = gzipBytes(publicClosure);
  const authenticatedGzip = gzipBytes(authenticatedClosure);
  const publicHeavy = heavyChunks(publicClosure);
  const authenticatedHeavy = heavyChunks(authenticatedClosure);
  const preloadHeavy = heavyChunks(preloadRecords);
  const failures = [];
  const formatKiB = (bytes) => `${(bytes / 1024).toFixed(2)} KiB`;

  if (entryGzip > ENTRY_LIMIT) failures.push(`entry gzip ${formatKiB(entryGzip)} exceeds 60.00 KiB`);
  if (publicGzip > PUBLIC_LIMIT) failures.push(`public/login gzip ${formatKiB(publicGzip)} exceeds 120.00 KiB`);
  if (authenticatedGzip > AUTHENTICATED_LIMIT) failures.push(`authenticated shell gzip ${formatKiB(authenticatedGzip)} exceeds 180.00 KiB`);
  if (publicHeavy.length > 0) failures.push(`heavy chunks in public/login closure: ${publicHeavy.join(', ')}`);
  if (authenticatedHeavy.length > 0) failures.push(`heavy chunks in authenticated shell closure: ${authenticatedHeavy.join(', ')}`);
  if (preloadHeavy.length > 0) failures.push(`heavy modulepreloads in index.html: ${preloadHeavy.join(', ')}`);

  console.log(`entry gzip: ${formatKiB(entryGzip)}`);
  console.log(`public/login gzip: ${formatKiB(publicGzip)}`);
  console.log(`authenticated shell gzip: ${formatKiB(authenticatedGzip)}`);
  console.log(`public/login JS: ${publicClosure.filter((record) => record.file.endsWith('.js')).map((record) => record.file).join(', ')}`);
  console.log(`authenticated shell JS: ${authenticatedClosure.filter((record) => record.file.endsWith('.js')).map((record) => record.file).join(', ')}`);

  if (failures.length > 0) {
    for (const failure of failures) console.error(`bundle budget failed: ${failure}`);
    return 1;
  }
  console.log('bundle budget passed');
  return 0;
}

try {
  process.exitCode = verify(resolve(process.argv[2] || 'dist'));
} catch (error) {
  console.error(`bundle budget failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
