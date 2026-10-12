import { randomUUID } from 'node:crypto';
import { validateRepoUrl } from '../utils/validateRepoUrl.js';
import { scanRepository } from './scanService.js';
import { analyzeRepositoryFiles } from './analysisService.js';
import { getModelId } from './gemmaService.js';
import { toFrontendFinding } from '../utils/toFrontendFinding.js';

// Background scan jobs for the frontend, which starts a scan and then polls
// for progress. Jobs live in memory only, so they disappear when the server restarts.
const jobs = new Map();
const MAX_JOBS_KEPT = 50;


function rememberJob(job) {
  jobs.set(job.id, job);
  if (jobs.size > MAX_JOBS_KEPT) {
    jobs.delete(jobs.keys().next().value); // drop the oldest job
  }
}

/** The job in the `Scan` shape from frontend/src/types.ts. */
function toScan(job) {
  const { result, analysis, findings, ...scan } = job;
  return scan;
}

async function runJob(job, repoUrl, analyze) {
  try {
    const result = await scanRepository(repoUrl, {
      onProgress(update) {
        if (update.stage === 'metadata') {
          job.repoUrl = update.repository.url;
          job.progress = 15;
          job.currentStep = `Reading the ${update.repository.branch} branch`;
        } else if (update.stage === 'download') {
          Object.assign(job, { status: 'analyzing', stepIndex: 1, progress: 20, totalFiles: update.total });
          job.currentStep = `Downloading ${update.total} source files`;
        } else if (update.stage === 'file') {
          job.filesScanned = update.done;
          job.progress = 20 + Math.round((update.done / update.total) * 40);
        }
      },
    });

    job.result = result;
    job.filesScanned = result.filesScanned;
    if (result.filesScanned === 0) {
      job.status = 'failed';
      job.error = result.warnings.at(-1) ?? 'No source files were found to analyze.';
      job.finishedAt = new Date().toISOString();
      return;
    }

    // Steps match frontend/src/lib/scanSteps.ts: 0 fetching, 1 indexing, 2 AI review, 3 checking findings.
    Object.assign(job, { stepIndex: 2, progress: 65, currentStep: `AI code review with ${getModelId()}` });
    const analysis = await analyze({ repository: result.repository, files: result.files }, {
      onProgress(update) {
        if (update.stage === 'batch') {
          // 65% -> 90% as batches finish (on the free tier each batch can wait up to a minute for quota).
          job.progress = 65 + Math.round((update.done / update.total) * 25);
          job.currentStep = `AI code review: ${update.done} of ${update.total} part(s) done`;
        } else if (update.stage === 'checking') {
          Object.assign(job, { stepIndex: 3, progress: 90, currentStep: 'Checking findings against the source code' });
        }
      },
    });

    const contentByPath = new Map(result.files.map((f) => [f.path, f.content]));
    job.analysis = analysis;
    job.findings = analysis.findings.map((f) => toFrontendFinding(f, contentByPath.get(f.filePath)));

    // The frontend has no place to show warnings. If some files FAILED to be analyzed and
    // nothing was found, "No bugs found" would be misleading, so report it as a failure.
    // (Files left out on purpose by the batch limit are shown by the "Files" counter instead.)
    const { filesAnalyzed } = analysis.summary;
    const { filesFailed } = analysis.coverage;
    // From now on the frontend's "Files" counter shows analyzed files (e.g. 11/20), not downloaded files.
    job.filesScanned = filesAnalyzed;
    if (filesFailed > 0 && analysis.findings.length === 0) {
      job.status = 'failed';
      job.error = `The AI could not analyze ${filesFailed} of ${result.filesScanned} files (${analysis.warnings.find((w) => w.startsWith('Not analyzed:')) ?? 'Gemini API error'}), and found no bugs in the ${filesAnalyzed} it did analyze. Please try again.`;
    } else {
      Object.assign(job, { status: 'completed', progress: 100, currentStep: `Found ${analysis.findings.length} potential bug(s) in ${filesAnalyzed} of ${result.filesScanned} files` });
    }
  } catch (error) {
    job.status = 'failed';
    job.error = error.code ? error.message : 'Something went wrong while scanning the repository.';
    if (!error.code) console.error('Unexpected scan job error:', error?.message ?? error);
  }
  job.finishedAt = new Date().toISOString();
}

/**
 * Starts a scan + Gemma 4 analysis in the background and returns the job right away.
 * `analyze` is injectable so tests can replace the real model.
 * Throws AppError 400 immediately if the URL is invalid.
 */
export function startScanJob(repoUrl, { analyze = analyzeRepositoryFiles } = {}) {
  const { owner, repo } = validateRepoUrl(repoUrl);
  const job = {
    id: randomUUID().slice(0, 8),
    repoUrl: `https://github.com/${owner}/${repo}`,
    status: 'cloning',
    progress: 5,
    currentStep: 'Fetching repository details',
    stepIndex: 0,
    filesScanned: 0,
    totalFiles: 0,
    startedAt: new Date().toISOString(),
    result: null,
  };
  rememberJob(job);
  runJob(job, repoUrl, analyze); // not awaited: the frontend polls getScanJob()
  return toScan(job);
}

/** Returns the job as a `Scan`, or null if the id is unknown. */
export function getScanJob(id) {
  const job = jobs.get(id);
  return job ? toScan(job) : null;
}

/** Returns the full POST /api/scan-style result for a finished job, or null. */
export function getScanJobResult(id) {
  return jobs.get(id)?.result ?? null;
}

/** Returns the POST /api/analyze-style result for a completed job, or null. */
export function getScanJobAnalysis(id) {
  return jobs.get(id)?.analysis ?? null;
}

/** Returns the findings in the frontend's `Finding` shape for a completed job, or null. */
export function getScanJobFindings(id) {
  return jobs.get(id)?.findings ?? null;
}
