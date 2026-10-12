/**
 * Turns the model's text answer into an array of raw finding objects.
 * Model output is untrusted: this only extracts JSON, and validateFindings.js
 * checks every finding afterwards.
 *
 * Handles: plain JSON, JSON in ```json fences, text before/after the JSON,
 * a bare array instead of {"findings": [...]}, truncated output (complete
 * findings are recovered, the cut-off one is dropped), and two small slips
 * Gemma makes: unquoted enum values ("severity":high) and trailing commas.
 *
 * @param {string} text
 * @returns {{ ok: true, findings: unknown[], recovered: boolean } | { ok: false, reason: string }}
 */
export function parseModelOutput(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    return { ok: false, reason: 'the model returned an empty answer' };
  }

  const cleaned = text.replace(/^﻿/, '').trim();
  const result = parseCleaned(cleaned);
  if (result.ok) return result;

  // Only if normal parsing failed: repair the known slips and try again.
  const repaired = repairJson(cleaned);
  return repaired === cleaned ? result : parseCleaned(repaired);
}

/**
 * Fixes two mistakes seen in Gemma 4 answers:
 * - a bare word for an enum field: "severity":high  ->  "severity":"high"
 * - a trailing comma before } or ]:  {"a":1,}  ->  {"a":1}
 */
export function repairJson(text) {
  return text
    .replace(/("(?:severity|category|status)"\s*:\s*)([A-Za-z][\w-]*)(\s*[,}])/g, '$1"$2"$3')
    .replace(/,(\s*[}\]])/g, '$1');
}

function parseCleaned(cleaned) {
  // 1. Whole answer, or the inside of a Markdown code fence.
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  for (const candidate of [cleaned, fence?.[1]]) {
    const parsed = tryParse(candidate);
    if (parsed.ok) return fromParsed(parsed.value);
  }

  // 2. The first complete JSON object or array somewhere in the text.
  //    If the text has a "findings" key, a lone finding object found here is part of a
  //    cut-off array, so it is left to step 3 (which reports the answer as truncated).
  const hasFindingsKey = /"findings"\s*:/.test(cleaned);
  for (const start of startIndexes(cleaned)) {
    const end = findClosingIndex(cleaned, start);
    if (end === -1) continue;
    const parsed = tryParse(cleaned.slice(start, end + 1));
    if (!parsed.ok) continue;
    const result = fromParsed(parsed.value, { allowSingle: !hasFindingsKey });
    if (result.ok) return result;
  }

  // 3. Truncated output: recover each complete object inside "findings": [ ... ].
  const recovered = recoverFindings(cleaned);
  if (recovered.length > 0) return { ok: true, findings: recovered, recovered: true };

  return { ok: false, reason: 'the model did not return valid JSON' };
}

function tryParse(candidate) {
  if (!candidate) return { ok: false };
  try {
    return { ok: true, value: JSON.parse(candidate.trim()) };
  } catch {
    return { ok: false };
  }
}

function fromParsed(value, { allowSingle = true } = {}) {
  if (Array.isArray(value)) return { ok: true, findings: value, recovered: false };
  if (value && typeof value === 'object' && Array.isArray(value.findings)) {
    return { ok: true, findings: value.findings, recovered: false };
  }
  if (allowSingle && value && typeof value === 'object' && value.findings === undefined && value.filePath !== undefined) {
    return { ok: true, findings: [value], recovered: false }; // a single finding on its own
  }
  return { ok: false, reason: 'the model\'s JSON did not contain a "findings" array' };
}

// Only the first few brackets are tried, so a long garbled answer cannot make parsing slow.
const MAX_START_ATTEMPTS = 20;

function* startIndexes(text) {
  let attempts = 0;
  for (let i = 0; i < text.length && attempts < MAX_START_ATTEMPTS; i++) {
    if (text[i] === '{' || text[i] === '[') {
      attempts++;
      yield i;
    }
  }
}

/**
 * Index of the bracket that closes the one at `start`, or -1.
 * Brackets inside JSON strings are ignored.
 */
function findClosingIndex(text, start) {
  const stack = [];
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']');
    else if (ch === '}' || ch === ']') {
      if (stack.pop() !== ch) return -1;
      if (stack.length === 0) return i;
    }
  }
  return -1;
}

/** Parses each complete {...} object inside the "findings" array, ignoring a cut-off tail. */
function recoverFindings(text) {
  const key = text.search(/"findings"\s*:\s*\[/);
  if (key === -1) return [];
  const findings = [];
  let i = text.indexOf('[', key) + 1;
  while (i < text.length) {
    const start = text.indexOf('{', i);
    if (start === -1) break;
    const end = findClosingIndex(text, start);
    if (end === -1) break; // truncated object
    const parsed = tryParse(text.slice(start, end + 1));
    if (parsed.ok) findings.push(parsed.value);
    i = end + 1;
  }
  return findings;
}
