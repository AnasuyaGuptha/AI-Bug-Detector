import { AppError } from './AppError.js';
import { addLineNumbers, splitLines } from './addLineNumbers.js';
import { MAX_ANALYZE_FILES, MAX_FILE_CHARS, MAX_TOTAL_CHARS } from '../config/analysisConfig.js';

const invalid = (message) => new AppError(400, 'INVALID_ANALYSIS_REQUEST', message);

const cleanString = (value, max = 300) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/**
 * Validates the POST /api/analyze body (the POST /api/scan response format).
 *
 * Line numbers are recomputed from `content`, so the numbering sent to the model
 * and the numbering used for validation can never disagree.
 *
 * @returns {{ repository: object | null, files: import('./validateFindings.js').SourceFile[], warnings: string[] }}
 * @throws {AppError} 400 / 413 for invalid or oversized requests
 */
export function validateAnalyzeRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw invalid('The request body must be a JSON object with a "files" array.');
  }
  if (!Array.isArray(body.files)) {
    throw invalid('"files" must be an array of source files, as returned by POST /api/scan.');
  }
  if (body.files.length === 0) {
    throw new AppError(400, 'NO_FILES_TO_ANALYZE', 'There are no source files to analyze.');
  }
  if (body.files.length > MAX_ANALYZE_FILES) {
    throw new AppError(413, 'TOO_MANY_FILES', `At most ${MAX_ANALYZE_FILES} files can be analyzed per request.`);
  }

  const warnings = [];
  const files = [];
  const seen = new Set();
  let totalChars = 0;

  body.files.forEach((file, index) => {
    if (!file || typeof file !== 'object') throw invalid(`files[${index}] must be an object.`);
    const path = typeof file.path === 'string' ? file.path.trim() : '';
    if (!path || path.length > 500) throw invalid(`files[${index}].path must be a non-empty string.`);
    if (typeof file.content !== 'string') throw invalid(`files[${index}].content must be a string.`);
    if (seen.has(path)) throw invalid(`The file "${path}" is listed more than once.`);
    seen.add(path);

    totalChars += file.content.length;
    if (totalChars > MAX_TOTAL_CHARS) {
      throw new AppError(413, 'PAYLOAD_TOO_LARGE', `The files are too large to analyze in one request (limit ${MAX_TOTAL_CHARS.toLocaleString('en-US')} characters).`);
    }

    if (file.content.trim() === '') {
      warnings.push(`Skipped "${path}" because it is empty.`);
      return;
    }
    if (file.content.length > MAX_FILE_CHARS) {
      warnings.push(`Skipped "${path}" because it is larger than ${MAX_FILE_CHARS.toLocaleString('en-US')} characters.`);
      return;
    }

    const lines = splitLines(file.content);
    files.push({
      path,
      language: cleanString(file.language, 40) || 'unknown',
      content: file.content,
      lines,
      lineCount: lines.length,
      numberedContent: addLineNumbers(file.content),
    });
  });

  if (files.length === 0) {
    throw new AppError(400, 'NO_FILES_TO_ANALYZE', 'None of the submitted files contain code that can be analyzed.');
  }

  const repo = body.repository;
  const repository = repo && typeof repo === 'object'
    ? { owner: cleanString(repo.owner), name: cleanString(repo.name), branch: cleanString(repo.branch), url: cleanString(repo.url, 500) }
    : null;

  return { repository, files, warnings };
}
