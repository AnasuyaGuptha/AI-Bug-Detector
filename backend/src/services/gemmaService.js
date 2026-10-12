import { GoogleGenAI, ApiError, ThinkingLevel } from '@google/genai';
import { AppError } from '../utils/AppError.js';
import {
  DEFAULT_GEMMA_MODEL, MODEL_MAX_OUTPUT_TOKENS, MODEL_TEMPERATURE, MODEL_TIMEOUT_MS, SUPPORTED_GEMMA_MODELS,
} from '../config/analysisConfig.js';
import { BUG_ANALYSIS_SYSTEM_INSTRUCTION } from '../prompts/bugAnalysisPrompt.js';

// Two settings below come from testing gemma-4-26b-a4b-it on 2026-10-12 with a file of planted bugs:
// - No schema-constrained output (responseMimeType + responseJsonSchema). The API accepts it,
//   but the model then always answered {"findings":[]} (4 output tokens, 0/5 bugs found).
//   Prompt-only JSON found 4/5, and parseModelOutput.js handles whatever the model returns.
// - Thinking set to MINIMAL. With default or HIGH thinking, the model sometimes spent its whole
//   output budget thinking (8,189 tokens, ~175s) and returned no answer at all.

/** The configured Gemma 4 model ID. Throws if it is not a verified Gemma 4 ID. */
export function getModelId() {
  const model = process.env.GEMMA_MODEL?.trim() || DEFAULT_GEMMA_MODEL;
  if (!SUPPORTED_GEMMA_MODELS.includes(model)) {
    throw new AppError(500, 'AI_MODEL_NOT_SUPPORTED',
      `GEMMA_MODEL must be one of: ${SUPPORTED_GEMMA_MODELS.join(', ')}.`);
  }
  return model;
}

let cachedClient = null;
let cachedKey = null;

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'your_api_key_here') {
    throw new AppError(503, 'AI_NOT_CONFIGURED', 'AI analysis is not configured. Add GEMINI_API_KEY to the backend .env file.');
  }
  if (!cachedClient || cachedKey !== apiKey) {
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        timeout: MODEL_TIMEOUT_MS,
        // Gemma on the Gemini API returns occasional "500 Internal error" responses, so temporary
        // server errors are retried twice (after about 5s and 15s). 429 is handled by analysisService.
        retryOptions: { attempts: 3, initialDelay: 5, expBase: 3, maxDelay: 15, httpStatusCodes: [500, 502, 503] },
      },
    });
    cachedKey = apiKey;
  }
  return cachedClient;
}

/** Throws AI_NOT_CONFIGURED right away if GEMINI_API_KEY is missing, before any work is queued. */
export function assertAiConfigured() {
  getClient();
}

/**
 * The retry delay from a 429 message, in ms, or null.
 * Google sends it as `"retryDelay":"45s"` and as "Please retry in 45.42s".
 */
export function retryDelayMs(message) {
  const match = /"retryDelay"\s*:\s*"([\d.]+)s"/.exec(message) ?? /retry in ([\d.]+)\s*s/i.exec(message);
  return match ? Math.ceil(Number(match[1]) * 1000) : null;
}

/**
 * Converts any error from the SDK into a safe AppError for clients.
 * The original message is logged on the server only (it never contains the API key).
 */
export function toAiError(error) {
  if (error instanceof AppError) return error;

  if (error?.name === 'AbortError' || error?.name === 'TimeoutError' || /timed? ?out/i.test(error?.message ?? '')) {
    return new AppError(504, 'AI_TIMEOUT', 'The AI model took too long to respond. Try again, or scan fewer files.');
  }

  if (error instanceof ApiError) {
    const message = error.message ?? '';
    if (error.status === 401 || error.status === 403 || /api key/i.test(message)) {
      return new AppError(502, 'AI_AUTH_FAILED', 'The Gemini API rejected the API key. Check GEMINI_API_KEY in the backend .env file.');
    }
    if (error.status === 404) {
      return new AppError(502, 'AI_MODEL_UNAVAILABLE', `The Gemma 4 model "${getModelId()}" is not available to this API key.`);
    }
    if (error.status === 429) {
      const aiError = new AppError(429, 'AI_RATE_LIMITED', 'The Gemini API quota or rate limit was reached. Wait a minute and try again.');
      aiError.retryAfterMs = retryDelayMs(message);
      return aiError;
    }
    if (error.status >= 500) {
      return new AppError(503, 'AI_SERVICE_UNAVAILABLE', 'The Gemini API is temporarily unavailable. Please try again shortly.');
    }
    console.error(`Gemini API error ${error.status}:`, message.slice(0, 300));
    return new AppError(502, 'AI_ANALYSIS_FAILED', 'The repository could not be analyzed right now.');
  }

  if (error instanceof TypeError) {
    return new AppError(502, 'AI_SERVICE_UNREACHABLE', 'Could not connect to the Gemini API. Check your internet connection.');
  }

  console.error('Unexpected AI error:', error?.message ?? error);
  return new AppError(502, 'AI_ANALYSIS_FAILED', 'The repository could not be analyzed right now.');
}

/**
 * Sends one prompt to Gemma 4 and returns the raw text answer.
 *
 * @param {string} prompt
 * @param {{ client?: object }} [options] client is injectable for tests
 * @returns {Promise<{ text: string, finishReason: string | undefined, usage: object }>}
 */
export async function generateBugReport(prompt, { client } = {}) {
  const model = getModelId();
  const ai = client ?? getClient();

  let response;
  try {
    response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction: BUG_ANALYSIS_SYSTEM_INSTRUCTION,
        temperature: MODEL_TEMPERATURE,
        maxOutputTokens: MODEL_MAX_OUTPUT_TOKENS,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        abortSignal: AbortSignal.timeout(MODEL_TIMEOUT_MS * 3 + 30_000), // covers the retries too
      },
    });
  } catch (error) {
    throw toAiError(error);
  }

  const candidate = response?.candidates?.[0];
  const usage = response?.usageMetadata ?? {};
  return {
    text: response?.text ?? '',
    finishReason: candidate?.finishReason,
    usage: {
      promptTokens: usage.promptTokenCount,
      outputTokens: usage.candidatesTokenCount,
      thinkingTokens: usage.thoughtsTokenCount,
    },
  };
}
