// Settings for the Gemma 4 bug-analysis engine.

// Gemma 4 model IDs that the Gemini API supports, as listed in the official guide
// https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api (checked 2026-10-12).
// Only these are accepted, so the engine can never silently switch to another model.
export const SUPPORTED_GEMMA_MODELS = ['gemma-4-26b-a4b-it', 'gemma-4-31b-it'];
// The model used in the official guide's examples. A Mixture-of-Experts model (4B active parameters), so it responds faster.
export const DEFAULT_GEMMA_MODEL = 'gemma-4-26b-a4b-it';

export const MODEL_PROVIDER = 'Google Gemini API';

// Request limits for POST /api/analyze.
export const ANALYZE_BODY_LIMIT = '5mb';
export const MAX_ANALYZE_FILES = 30;
export const MAX_FILE_CHARS = 100_000; // larger files are skipped with a warning
export const MAX_TOTAL_CHARS = 1_000_000; // whole request; larger requests are rejected

// Rate limit. The Gemini API free tier allows 16,000 input tokens per minute for
// Gemma 4 26B (measured from a 429 response on 2026-10-12: quota
// "GenerateContentInputTokensPerModelPerMinute-FreeTier", value 16000).
// Paid tiers allow more: set GEMINI_INPUT_TOKENS_PER_MINUTE to your limit.
export const DEFAULT_INPUT_TOKENS_PER_MINUTE = 16_000;
export function inputTokensPerMinute() {
  const value = Number(process.env.GEMINI_INPUT_TOKENS_PER_MINUTE);
  return Number.isFinite(value) && value >= 4_000 ? value : DEFAULT_INPUT_TOKENS_PER_MINUTE;
}

// Token estimate. Measured with the Gemini countTokens API on 2026-10-12: Gemma's tokenizer
// gives about 2.35-2.55 characters per token for line-numbered JavaScript and Python.
// 2.2 slightly over-counts, so the estimate is never too low.
export const CHARS_PER_TOKEN = 2.2;
export const estimateTokens = (text) => Math.ceil(text.length / CHARS_PER_TOKEN);

// Batching. Gemma 4 has a 256K-token context window, but each request must also fit
// comfortably in the per-minute token budget, and smaller batches keep the model focused.
export const BATCH_TOKEN_TARGET = 9_000; // max code tokens per request
export const BATCH_BUDGET_SHARE = 0.65; // a request uses at most this share of the per-minute budget
export const PROMPT_OVERHEAD_TOKENS = 1_500; // system instruction (~740 tokens) + JSON schema + wrapper text
// Max requests per analysis. On the free tier each batch uses about 10,500 of the 16,000
// tokens per minute, so 4 batches take about 2-3 minutes. Files are already sorted by
// relevance by the scanner, so the most important code is analyzed first; the rest is
// skipped with a warning. Raise GEMMA_MAX_BATCHES (up to 20) on a paid tier.
export const DEFAULT_MAX_BATCHES = 4;
export function maxBatches() {
  const value = Number(process.env.GEMMA_MAX_BATCHES);
  return Number.isInteger(value) && value >= 1 && value <= 20 ? value : DEFAULT_MAX_BATCHES;
}
// Requests at the same time. On a small (free-tier) budget, parallel batches compete for the
// same quota and the largest one can be starved, so they are sent one after another.
export const batchConcurrency = (tokensPerMinute = inputTokensPerMinute()) => (tokensPerMinute >= 64_000 ? 2 : 1);

// When the API answers 429 with a short retry delay, wait and retry.
export const MAX_RATE_LIMIT_RETRIES = 3;
export const MAX_RATE_LIMIT_WAIT_MS = 90_000; // longer waits (e.g. daily quota) fail instead

// Model call settings.
export const MODEL_TIMEOUT_MS = 90_000; // per attempt (answers usually take 2-20s with minimal thinking)
export const MODEL_MAX_OUTPUT_TOKENS = 8192;
export const MODEL_TEMPERATURE = 0.2; // low: we want careful, repeatable review, not creativity
export const MAX_FINDINGS_PER_BATCH = 10; // asked of the model, and enforced
export const MAX_FINDINGS_TOTAL = 50;

export const SEVERITIES = ['critical', 'high', 'medium', 'low'];
export const CATEGORIES = [
  'logic', 'null-reference', 'runtime-error', 'error-handling', 'type-error',
  'resource-leak', 'security', 'edge-case', 'control-flow', 'concurrency', 'other',
];
