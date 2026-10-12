import { AppError } from '../utils/AppError.js';
import { validateAnalyzeRequest } from '../utils/validateAnalyzeRequest.js';
import { parseModelOutput } from '../utils/parseModelOutput.js';
import { compareFindings, dedupeFindings, summarizeFindings, validateFindings } from '../utils/validateFindings.js';
import { mapWithConcurrency } from '../utils/mapWithConcurrency.js';
import { TokenRateLimiter } from '../utils/tokenRateLimiter.js';
import { buildBugAnalysisPrompt } from '../prompts/bugAnalysisPrompt.js';
import { assertAiConfigured, generateBugReport, getModelId } from './gemmaService.js';
import {
  BATCH_BUDGET_SHARE, BATCH_TOKEN_TARGET, CHARS_PER_TOKEN, batchConcurrency, MAX_FINDINGS_PER_BATCH, MAX_FINDINGS_TOTAL,
  MAX_RATE_LIMIT_RETRIES, MAX_RATE_LIMIT_WAIT_MS, MODEL_PROVIDER, PROMPT_OVERHEAD_TOKENS, estimateTokens, inputTokensPerMinute, maxBatches,
} from '../config/analysisConfig.js';

// Shared by all analyses: the Gemini quota is per API key and model, not per request.
const sharedLimiter = new TokenRateLimiter(inputTokensPerMinute);

/** Max characters of numbered code per request, so a request fits the per-minute token budget. */
export function batchCharBudget(tokensPerMinute = inputTokensPerMinute()) {
  const tokens = Math.min(BATCH_TOKEN_TARGET, Math.floor(tokensPerMinute * BATCH_BUDGET_SHARE) - PROMPT_OVERHEAD_TOKENS);
  return Math.floor(tokens * CHARS_PER_TOKEN);
}

/**
 * Splits a file into pieces of at most `maxChars` of numbered code.
 * Small files stay whole. Large files are cut at a natural boundary where possible
 * (before a top-level line such as `def`/`class`/`function`, or at a blank line),
 * and every piece keeps the file's original line numbers.
 */
export function splitFile(file, maxChars) {
  const whole = { path: file.path, language: file.language, lineCount: file.lineCount };
  if (file.numberedContent.length <= maxChars) {
    return [{ ...whole, startLine: 1, endLine: file.lineCount, text: file.numberedContent }];
  }

  const numbered = file.numberedContent.split('\n');
  const pieces = [];
  let start = 0;
  while (start < numbered.length) {
    let size = 0;
    let end = start;
    let goodCut = -1;
    while (end < numbered.length && (end === start || size + numbered[end].length + 1 <= maxChars)) {
      const code = file.lines[end] ?? '';
      // Remember the last natural boundary after the piece is reasonably full.
      if (end > start && size >= maxChars * 0.5 && (code.trim() === '' || /^\S/.test(code))) goodCut = end;
      size += numbered[end].length + 1;
      end++;
    }
    const cut = end < numbered.length && goodCut > start ? goodCut : end;
    pieces.push({ ...whole, startLine: start + 1, endLine: cut, text: numbered.slice(start, cut).join('\n') });
    start = cut;
  }
  return pieces;
}

/**
 * Splits files into pieces and packs them into batches of at most `maxChars`.
 * Pieces that do not fit in maxBatches() batches are returned in `skipped`.
 */
export function buildBatches(files, maxChars = batchCharBudget()) {
  const batches = [];
  let current = [];
  let size = 0;
  for (const piece of files.flatMap((f) => splitFile(f, maxChars))) {
    if (current.length > 0 && size + piece.text.length > maxChars) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(piece);
    size += piece.text.length;
  }
  if (current.length > 0) batches.push(current);

  const limit = maxBatches();
  return {
    batches: batches.slice(0, limit),
    skipped: batches.slice(limit).flat(),
  };
}

const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`;
// Server-side progress log (never includes code or keys). Silenced during tests.
const log = (message) => { if (!process.env.NODE_TEST_CONTEXT) console.log(message); };

const pieceName = (p) => (p.startLine > 1 || p.endLine < p.lineCount ? `"${p.path}" (lines ${p.startLine}-${p.endLine})` : `"${p.path}"`);
const pieceList = (pieces) => pieces.map(pieceName).join(', ');

/**
 * Sends one batch to the model and parses the answer. Waits for the token budget first,
 * and retries when the API asks to wait a short time. Never throws: returns raw findings or an error.
 */
async function analyzeBatch(batch, { generate, limiter }) {
  const prompt = buildBugAnalysisPrompt(batch);
  const tokens = estimateTokens(prompt) + PROMPT_OVERHEAD_TOKENS;

  const label = `[ai] ${batch.length} file part(s), ~${tokens.toLocaleString('en-US')} tokens`;
  let answer;
  for (let attempt = 0; ; attempt++) {
    const waited = await limiter.acquire(tokens);
    const started = Date.now();
    try {
      answer = await generate(prompt);
      const u = answer.usage ?? {};
      log(`${label}: answered in ${seconds(Date.now() - started)}${waited ? ` after waiting ${seconds(waited)} for quota` : ''}` +
        ` (prompt ${u.promptTokens ?? '?'}, output ${u.outputTokens ?? '?'}, thinking ${u.thinkingTokens ?? 0} tokens)`);
      break;
    } catch (error) {
      const wait = error.retryAfterMs ?? 60_000;
      const retryable = error.code === 'AI_RATE_LIMITED' && attempt < MAX_RATE_LIMIT_RETRIES && wait <= MAX_RATE_LIMIT_WAIT_MS;
      log(`${label}: ${error.code ?? 'error'} after ${seconds(Date.now() - started)}${retryable ? `, retrying in ${seconds(wait + 1_000)}` : ''}`);
      if (!retryable) return { ok: false, error };
      limiter.pause(wait + 1_000);
    }
  }

  const parsed = parseModelOutput(answer.text);
  if (!parsed.ok) {
    return {
      ok: false,
      error: new AppError(502, 'AI_INVALID_OUTPUT', `The AI model returned output that could not be used (${parsed.reason}).`),
    };
  }

  return {
    ok: true,
    rawFindings: parsed.findings.slice(0, MAX_FINDINGS_PER_BATCH * 2),
    truncated: parsed.recovered || answer.finishReason === 'MAX_TOKENS',
  };
}

/**
 * Runs Gemma 4 bug analysis on the scanner's files and returns the API response.
 *
 * @param {unknown} body the POST /api/analyze request body
 * @param {{
 *   generate?: (prompt: string) => Promise<{ text: string, finishReason?: string }>,
 *   onProgress?: (update: { stage: 'batch', done: number, total: number } | { stage: 'checking' }) => void,
 *   limiter?: TokenRateLimiter,
 * }} [options]
 *   `generate` and `limiter` are injectable so tests can replace the real model and clock.
 *   `onProgress` reports each finished batch, then the checking stage.
 */
export async function analyzeRepositoryFiles(body, { generate = generateBugReport, onProgress = () => {}, limiter = sharedLimiter } = {}) {
  const { repository, files, warnings } = validateAnalyzeRequest(body);
  const model = getModelId(); // fails early if GEMMA_MODEL is not a Gemma 4 model
  if (generate === generateBugReport) assertAiConfigured(); // fails early if GEMINI_API_KEY is missing

  const filesByPath = new Map(files.map((f) => [f.path, f]));
  const { batches, skipped } = buildBatches(files);
  if (skipped.length > 0) {
    warnings.push(`Not analyzed (only the ${maxBatches()} most relevant batch(es) are analyzed per scan; raise GEMMA_MAX_BATCHES to analyze more): ${pieceList(skipped)}.`);
  }

  let done = 0;
  const results = await mapWithConcurrency(batches, batchConcurrency(), async (batch) => {
    const result = await analyzeBatch(batch, { generate, limiter });
    onProgress({ stage: 'batch', done: ++done, total: batches.length });
    return result;
  });
  // Only move on to "checking" if the model answered at least once; otherwise the failure belongs to the AI step.
  if (results.some((r) => r.ok)) onProgress({ stage: 'checking' });

  const findings = [];
  const rejected = {};
  let adjusted = 0;
  const failures = [];
  // A file counts as analyzed only if every piece of it was analyzed.
  const skippedPaths = new Set(skipped.map((p) => p.path)); // left out by the batch limit
  const failedPaths = new Set(); // in a batch the model could not analyze

  results.forEach((result, i) => {
    if (!result.ok) {
      failures.push(result.error);
      batches[i].forEach((p) => failedPaths.add(p.path));
      warnings.push(`Not analyzed: ${pieceList(batches[i])}. ${result.error.message}`);
      return;
    }
    // Check every finding against the submitted source (file, lines, evidence).
    const checked = validateFindings(result.rawFindings, filesByPath);
    findings.push(...checked.accepted);
    adjusted += checked.adjusted;
    for (const [reason, count] of Object.entries(checked.rejected)) rejected[reason] = (rejected[reason] ?? 0) + count;
    if (result.truncated) {
      warnings.push(`The AI answer for ${pieceList(batches[i])} was cut off, so some findings may be missing.`);
    }
  });

  // Nothing could be analyzed: report a clear error instead of an empty result.
  if (results.every((r) => !r.ok)) {
    const first = failures[0];
    throw first instanceof AppError ? first : new AppError(502, 'AI_ANALYSIS_FAILED', 'The repository could not be analyzed right now.');
  }
  const filesFailed = files.filter((f) => failedPaths.has(f.path)).length;
  const filesSkipped = files.filter((f) => skippedPaths.has(f.path) && !failedPaths.has(f.path)).length;
  const filesAnalyzed = files.length - filesFailed - filesSkipped;
  const filesSubmitted = Array.isArray(body.files) ? body.files.length : files.length;

  const rejectedCount = Object.values(rejected).reduce((a, b) => a + b, 0);
  if (rejectedCount > 0) {
    const reasons = Object.entries(rejected).map(([reason, count]) => `${count} × ${reason}`).join(', ');
    warnings.push(`Discarded ${rejectedCount} AI finding(s) that could not be matched to the submitted code (${reasons}).`);
  }
  if (adjusted > 0) {
    warnings.push(`Corrected the line numbers of ${adjusted} finding(s) to where their evidence appears in the file.`);
  }

  let unique = dedupeFindings(findings).sort(compareFindings);
  if (findings.length > unique.length) {
    warnings.push(`Merged ${findings.length - unique.length} duplicate finding(s).`);
  }
  if (unique.length > MAX_FINDINGS_TOTAL) {
    warnings.push(`Showing the ${MAX_FINDINGS_TOTAL} most important of ${unique.length} findings.`);
    unique = unique.slice(0, MAX_FINDINGS_TOTAL);
  }

  const numbered = unique.map((finding, i) => ({ id: `finding-${i + 1}`, ...finding }));

  return {
    success: true,
    repository,
    model: { provider: MODEL_PROVIDER, name: model },
    summary: summarizeFindings(numbered, filesAnalyzed),
    // How much of the submitted code was reviewed. Skipped = empty, too large, or over the batch limit.
    coverage: { filesSubmitted, filesAnalyzed, filesSkipped: filesSubmitted - filesAnalyzed - filesFailed, filesFailed },
    findings: numbered,
    warnings,
  };
}

