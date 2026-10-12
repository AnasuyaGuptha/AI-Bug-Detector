import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRepoUrl } from '../src/utils/validateRepoUrl.js';

test('accepts standard repository URLs', () => {
  assert.deepEqual(validateRepoUrl('https://github.com/expressjs/express'), { owner: 'expressjs', repo: 'express' });
  assert.deepEqual(validateRepoUrl('https://github.com/expressjs/express/'), { owner: 'expressjs', repo: 'express' });
  assert.deepEqual(validateRepoUrl('https://github.com/expressjs/express.git'), { owner: 'expressjs', repo: 'express' });
  assert.deepEqual(validateRepoUrl('  https://www.github.com/psf/requests  '), { owner: 'psf', repo: 'requests' });
  assert.deepEqual(validateRepoUrl('https://github.com/my-org/repo.name_v2'), { owner: 'my-org', repo: 'repo.name_v2' });
});

const rejected = [
  ['missing value', undefined],
  ['non-string', 42],
  ['empty string', '   '],
  ['not a URL', 'expressjs/express'],
  ['no protocol', 'github.com/expressjs/express'],
  ['http', 'http://github.com/expressjs/express'],
  ['other host', 'https://gitlab.com/owner/repo'],
  ['lookalike host', 'https://github.com.evil.com/owner/repo'],
  ['subdomain', 'https://api.github.com/owner/repo'],
  ['custom port', 'https://github.com:8443/owner/repo'],
  ['credentials', 'https://user:pass@github.com/owner/repo'],
  ['owner only', 'https://github.com/expressjs'],
  ['host only', 'https://github.com/'],
  ['extra path', 'https://github.com/expressjs/express/tree/main'],
  ['empty segment', 'https://github.com//express'],
  ['bad owner chars', 'https://github.com/bad_owner!/repo'],
  ['owner trailing hyphen', 'https://github.com/owner-/repo'],
  ['dot repo', 'https://github.com/owner/..'],
  ['only .git', 'https://github.com/owner/.git'],
  ['encoded traversal', 'https://github.com/owner/%2e%2e'],
  ['too long', `https://github.com/owner/${'a'.repeat(400)}`],
];

for (const [name, input] of rejected) {
  test(`rejects ${name}`, () => {
    assert.throws(() => validateRepoUrl(input), { code: 'INVALID_REPOSITORY_URL', status: 400 });
  });
}
