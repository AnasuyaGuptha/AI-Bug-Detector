// HTTP tests: start the real Express app on a random port and call it.
// No request here reaches GitHub or the Gemini API.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

let server;
let base;
let savedKey;

before(async () => {
  savedKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  if (savedKey !== undefined) process.env.GEMINI_API_KEY = savedKey;
});

const post = (path, body, raw) => fetch(`${base}${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: raw ?? JSON.stringify(body),
}).then(async (res) => ({ status: res.status, body: await res.json() }));

const VALID = { files: [{ path: 'a.js', language: 'javascript', content: 'let x = 1\n' }] };

test('POST /api/analyze is registered and validates the body', async () => {
  assert.deepEqual(await post('/api/analyze', {}), {
    status: 400,
    body: { success: false, error: { code: 'INVALID_ANALYSIS_REQUEST', message: '"files" must be an array of source files, as returned by POST /api/scan.' } },
  });
  assert.equal((await post('/api/analyze', { files: [] })).body.error.code, 'NO_FILES_TO_ANALYZE');
  assert.equal((await post('/api/analyze', null, '{not json')).body.error.code, 'INVALID_JSON');
});

test('POST /api/analyze without GEMINI_API_KEY returns 503 AI_NOT_CONFIGURED', async () => {
  const r = await post('/api/analyze', VALID);
  assert.equal(r.status, 503);
  assert.equal(r.body.error.code, 'AI_NOT_CONFIGURED');
});

test('POST /api/analyze accepts bodies larger than the default 10 KB limit', async () => {
  const big = { files: [{ path: 'big.js', content: 'let x = 1\n'.repeat(5000) }] }; // ~50 KB
  const r = await post('/api/analyze', big);
  assert.equal(r.body.error.code, 'AI_NOT_CONFIGURED', 'got past the body parser');
});

test('other routes keep the 10 KB limit and their error format', async () => {
  const r = await post('/api/scan', { repoUrl: 'x'.repeat(20_000) });
  assert.equal(r.status, 413);
  assert.equal(r.body.error.code, 'PAYLOAD_TOO_LARGE');
  const invalid = await post('/api/scan', { repoUrl: 'not a url' });
  assert.deepEqual(Object.keys(invalid.body), ['success', 'error'], '/api/scan errors have no extra "message" field');
});

test('GET / lists the analyze endpoint', async () => {
  const body = await fetch(`${base}/`).then((r) => r.json());
  assert.match(body.endpoints.analyze, /POST \/api\/analyze/);
});
