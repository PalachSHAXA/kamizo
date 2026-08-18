import assert from 'node:assert/strict';
import test from 'node:test';

import { apiProxyHeaders, localApiUrl } from './network.mjs';

test('localApiUrl preserves path and query while replacing only the production API origin', () => {
  assert.equal(
    localApiUrl('https://api.kamizo.uz/api/requests?page=2'),
    'http://127.0.0.1:8787/api/requests?page=2',
  );
});

test('localApiUrl refuses unrelated origins', () => {
  assert.throws(() => localApiUrl('https://example.com/api/requests'), /Unexpected API origin/);
});

test('apiProxyHeaders applies only an allowlisted tenant origin and removes host', () => {
  assert.deepEqual(
    apiProxyHeaders({ host: 'api.kamizo.uz', accept: 'application/json' }, 'https://demo.kamizo.uz'),
    { accept: 'application/json', origin: 'https://demo.kamizo.uz' },
  );
  assert.throws(
    () => apiProxyHeaders({}, 'https://example.com'),
    /Unexpected tenant origin/,
  );
});
