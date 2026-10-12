// Tests for the background scan jobs used by the frontend. GitHub is replaced by a
// stubbed fetch and Gemma by a fake `analyze` function, so these run offline.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { startScanJob, getScanJob, getScanJobResult, getScanJobFindings, getScanJobAnalysis } from '../src/services/scanJobService.js';
import { AppError } from '../src/utils/AppError.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const META = { name: 'repo', owner: { login: 'owner' }, default_branch: 'main', html_url: 'https://github.com/owner/repo', private: false };
const CODE = 'let items = []\nlet first = items[0].name\nconsole.log(first)\n';

function stubGitHub() {
  globalThis.fetch = async (url) => {
    url = String(url);
    if (url.endsWith('/repos/owner/repo')) return json(200, META);
    if (url.includes('/git/trees/')) return json(200, { tree: [{ path: 'src/a.js', type: 'blob', mode: '100644', size: 9 }] });
    return new Response(CODE);
  };
}

async function waitUntilFinished(id) {
  for (let i = 0; i < 100; i++) {
    const scan = getScanJob(id);
    if (scan.finishedAt) return scan;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('scan job did not finish');
}

const analysisResult = {
  success: true,
  repository: { owner: 'owner', name: 'repo', branch: 'main', url: 'https://github.com/owner/repo' },
  model: { provider: 'Google Gemini API', name: 'gemma-4-26b-a4b-it' },
  summary: { filesAnalyzed: 1, findingsCount: 1, critical: 0, high: 1, medium: 0, low: 0 },
  coverage: { filesSubmitted: 1, filesAnalyzed: 1, filesSkipped: 0, filesFailed: 0 },
  findings: [{
    id: 'finding-1', title: 'Reading .name of undefined', severity: 'high', confidence: 0.95,
    filePath: 'src/a.js', startLine: 2, endLine: 2, evidence: 'let first = items[0].name',
    explanation: 'items is empty, so items[0] is undefined. Reading .name throws a TypeError.',
    suggestedFix: 'Check that the list is not empty.', fixedCode: 'let first = items[0]?.name',
    category: 'null-reference', status: 'potential',
  }],
  warnings: [],
};

test('a job scans GitHub, runs the analysis and exposes frontend findings', async () => {
  stubGitHub();
  let analyzedWith;
  const analyze = async (body) => { analyzedWith = body; return analysisResult; };

  const started = startScanJob('https://github.com/owner/repo', { analyze });
  assert.equal(started.status, 'cloning');
  for (const hidden of ['result', 'analysis', 'findings']) assert.equal(started[hidden], undefined);

  const scan = await waitUntilFinished(started.id);
  assert.equal(scan.status, 'completed');
  assert.equal(scan.progress, 100);
  assert.equal(scan.filesScanned, 1);
  assert.equal(analyzedWith.files[0].path, 'src/a.js');
  assert.equal(analyzedWith.repository.branch, 'main');

  assert.equal(getScanJobResult(started.id).files[0].content, CODE);
  assert.deepEqual(getScanJobAnalysis(started.id), analysisResult);
  const [finding] = getScanJobFindings(started.id);
  assert.equal(finding.file, 'src/a.js');
  assert.equal(finding.line, 2);
  assert.equal(finding.evidenceStartLine, 1);
  assert.equal(finding.evidence, 'let items = []\nlet first = items[0].name\nconsole.log(first)');
  assert.equal(finding.suggestedFix, 'let items = []\nlet first = items[0]?.name\nconsole.log(first)');
});

test('job steps follow the real pipeline: AI review (2), then checking findings (3)', async () => {
  stubGitHub();
  const seen = [];
  let id;
  const analyze = async (body, { onProgress }) => {
    seen.push(getScanJob(id).stepIndex); // while the model runs
    onProgress({ stage: 'checking' });
    seen.push(getScanJob(id).stepIndex); // while findings are checked
    return analysisResult;
  };
  id = startScanJob('https://github.com/owner/repo', { analyze }).id;
  assert.equal(getScanJob(id).stepIndex, 0);
  const scan = await waitUntilFinished(id);
  assert.deepEqual(seen, [2, 3]);
  assert.equal(scan.status, 'completed');
});

test('no findings: completed if files were only skipped by the limit, failed if a batch failed', async () => {
  const noFindings = (coverage, warnings = []) => async () => ({
    ...analysisResult, findings: [], warnings, coverage,
    summary: { ...analysisResult.summary, filesAnalyzed: coverage.filesAnalyzed, findingsCount: 0, high: 0 },
  });

  stubGitHub();
  const skippedOnly = startScanJob('https://github.com/owner/repo', { analyze: noFindings({ filesSubmitted: 1, filesAnalyzed: 1, filesSkipped: 0, filesFailed: 0 }) });
  assert.equal((await waitUntilFinished(skippedOnly.id)).status, 'completed');

  stubGitHub();
  const failedBatch = startScanJob('https://github.com/owner/repo', {
    analyze: noFindings({ filesSubmitted: 1, filesAnalyzed: 0, filesSkipped: 0, filesFailed: 1 }, ['Not analyzed: "src/a.js". The Gemini API is temporarily unavailable.']),
  });
  const scan = await waitUntilFinished(failedBatch.id);
  assert.equal(scan.status, 'failed');
  assert.match(scan.error, /could not analyze 1 of 1 files/);
});

test('a job fails with the AI error message when analysis fails', async () => {
  stubGitHub();
  const analyze = async () => { throw new AppError(503, 'AI_NOT_CONFIGURED', 'AI analysis is not configured. Add GEMINI_API_KEY to the backend .env file.'); };
  const started = startScanJob('https://github.com/owner/repo', { analyze });
  const scan = await waitUntilFinished(started.id);
  assert.equal(scan.status, 'failed');
  assert.match(scan.error, /GEMINI_API_KEY/);
  assert.equal(getScanJobFindings(started.id), null);
});

test('a job for a missing repository fails with the GitHub error message', async () => {
  globalThis.fetch = async () => json(404, { message: 'Not Found' });
  const started = startScanJob('https://github.com/owner/missing', { analyze: async () => assert.fail('should not analyze') });
  const scan = await waitUntilFinished(started.id);
  assert.equal(scan.status, 'failed');
  assert.match(scan.error, /was not found/);
});

test('an invalid URL is rejected before a job is created', () => {
  assert.throws(() => startScanJob('https://example.com/a/b'), { status: 400, code: 'INVALID_REPOSITORY_URL' });
});

test('unknown job ids return null', () => {
  assert.equal(getScanJob('nope'), null);
  assert.equal(getScanJobResult('nope'), null);
  assert.equal(getScanJobFindings('nope'), null);
});
