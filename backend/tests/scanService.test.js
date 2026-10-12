// Error-handling tests for the scanner. GitHub cannot be made to rate-limit or
// drop connections on demand, so these tests replace global fetch with a stub.
// The real scanner never uses mock data.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { scanRepository } from '../src/services/scanService.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

/** Stub fetch with a function of the URL. Records requested URLs and headers. */
function stubFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), headers: options?.headers ?? {} });
    return handler(String(url));
  };
  return calls;
}

const META = { name: 'repo', owner: { login: 'owner' }, default_branch: 'develop', html_url: 'https://github.com/owner/repo', private: false };

test('builds the response from metadata, tree and raw files', async () => {
  const calls = stubFetch((url) => {
    if (url.endsWith('/repos/owner/repo')) return json(200, META);
    if (url.includes('/git/trees/develop')) {
      return json(200, { truncated: true, tree: [
        { path: 'src/a.js', type: 'blob', mode: '100644', size: 20 },
        { path: 'src/bin.js', type: 'blob', mode: '100644', size: 20 },
        { path: 'src/missing.py', type: 'blob', mode: '100644', size: 20 },
        { path: 'README.md', type: 'blob', mode: '100644', size: 20 },
      ] });
    }
    if (url.endsWith('/develop/src/a.js')) return new Response('const a = 1;\nexport default a;\n');
    if (url.endsWith('/develop/src/bin.js')) return new Response(new Uint8Array([1, 0, 2]));
    return new Response('not found', { status: 404 });
  });

  const result = await scanRepository('https://github.com/owner/repo.git');

  assert.deepEqual(result.repository, { owner: 'owner', name: 'repo', branch: 'develop', url: 'https://github.com/owner/repo' });
  assert.equal(result.filesScanned, 1);
  assert.deepEqual(result.files[0], {
    path: 'src/a.js',
    language: 'javascript',
    lineCount: 2,
    content: 'const a = 1;\nexport default a;\n',
    numberedContent: '1: const a = 1;\n2: export default a;',
  });
  assert.ok(result.warnings.some((w) => w.includes('only part of its file tree')));
  assert.ok(result.warnings.some((w) => w.includes('src/bin.js') && w.includes('binary')));
  assert.ok(result.warnings.some((w) => w.includes('src/missing.py') && w.includes('HTTP 404')));
  assert.ok(calls.every((c) => c.url.startsWith('https://api.github.com/') || c.url.startsWith('https://raw.githubusercontent.com/')));
});

test('sends GITHUB_TOKEN to the API but not to raw downloads, and never returns it', async () => {
  process.env.GITHUB_TOKEN = 'test-token';
  try {
    const calls = stubFetch((url) => {
      if (url.endsWith('/repos/owner/repo')) return json(200, META);
      if (url.includes('/git/trees/')) return json(200, { tree: [{ path: 'a.go', type: 'blob', mode: '100644', size: 5 }] });
      return new Response('package main\n');
    });
    const result = await scanRepository('https://github.com/owner/repo');
    assert.doesNotMatch(JSON.stringify(result), /test-token/);
    assert.equal(calls[0].headers.Authorization, 'Bearer test-token');
    assert.equal(calls[2].headers.Authorization, undefined);
  } finally {
    delete process.env.GITHUB_TOKEN;
  }
});

test('nonexistent repository -> 404 REPOSITORY_NOT_FOUND', async () => {
  stubFetch(() => json(404, { message: 'Not Found' }));
  await assert.rejects(scanRepository('https://github.com/owner/repo'), { status: 404, code: 'REPOSITORY_NOT_FOUND' });
});

test('rate limit -> 429 GITHUB_RATE_LIMITED', async () => {
  stubFetch(() => json(403, { message: 'API rate limit exceeded' }, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1900000000' }));
  await assert.rejects(scanRepository('https://github.com/owner/repo'), (err) => {
    assert.equal(err.status, 429);
    assert.equal(err.code, 'GITHUB_RATE_LIMITED');
    assert.match(err.message, /Try again after/);
    return true;
  });
});

test('network failure -> 502 GITHUB_UNREACHABLE', async () => {
  globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
  await assert.rejects(scanRepository('https://github.com/owner/repo'), { status: 502, code: 'GITHUB_UNREACHABLE' });
});

test('timeout -> 504 GITHUB_TIMEOUT', async () => {
  globalThis.fetch = async () => { throw new DOMException('timed out', 'TimeoutError'); };
  await assert.rejects(scanRepository('https://github.com/owner/repo'), { status: 504, code: 'GITHUB_TIMEOUT' });
});

test('missing branch -> 404 BRANCH_NOT_FOUND', async () => {
  stubFetch((url) => (url.endsWith('/repos/owner/repo') ? json(200, META) : json(404, { message: 'Not Found' })));
  await assert.rejects(scanRepository('https://github.com/owner/repo'), { status: 404, code: 'BRANCH_NOT_FOUND' });
});

test('private repository is rejected', async () => {
  stubFetch(() => json(200, { ...META, private: true }));
  await assert.rejects(scanRepository('https://github.com/owner/repo'), { status: 403, code: 'PRIVATE_REPOSITORY' });
});

test('empty repository returns no files with a warning', async () => {
  stubFetch((url) => (url.endsWith('/repos/owner/repo') ? json(200, META) : json(409, { message: 'Git Repository is empty.' })));
  const result = await scanRepository('https://github.com/owner/repo');
  assert.equal(result.filesScanned, 0);
  assert.deepEqual(result.warnings, ['This repository is empty.']);
});

test('invalid URL fails before any network request', async () => {
  const calls = stubFetch(() => json(200, META));
  await assert.rejects(scanRepository('https://example.com/a/b'), { status: 400, code: 'INVALID_REPOSITORY_URL' });
  assert.equal(calls.length, 0);
});
