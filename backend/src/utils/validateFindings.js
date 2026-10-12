import { CATEGORIES, SEVERITIES } from '../config/analysisConfig.js';

// Checks every finding the model returned against the files that were actually
// submitted. A finding is only accepted if its file exists, its line numbers are
// inside that file, and its evidence quote really appears in the source.

const SEVERITY_ALIASES = { blocker: 'critical', major: 'high', moderate: 'medium', minor: 'low' };
const SEVERITY_RANK = Object.fromEntries(SEVERITIES.map((s, i) => [s, i]));
const SEARCH_WINDOW = 3; // lines the evidence may be away from the reported line
const MAX_EVIDENCE_LINES = 12;
const TEXT_LIMITS = { title: 150, explanation: 2000, suggestedFix: 1500, fixedCode: 5000 };
const NO_FIX_PATTERN = /^\W*(none|n\/a|no (code )?(fix|change|action)s? (is |are )?(needed|required|necessary))\b/i;

const normalizeLine = (line) => line.trim().replace(/\s+/g, ' ');

/**
 * @typedef {{ path: string, language: string, content: string, lines: string[], lineCount: number }} SourceFile
 */

/** Finds the submitted file for a model-reported path (exact, then normalized, then case-insensitive). */
function resolveFile(rawPath, filesByPath) {
  if (typeof rawPath !== 'string' || rawPath.trim() === '') return null;
  const exact = filesByPath.get(rawPath);
  if (exact) return exact;

  const normalized = rawPath.trim().replace(/\\/g, '/').replace(/^(\.\/|\/)+/, '');
  if (filesByPath.has(normalized)) return filesByPath.get(normalized);

  const matches = [...filesByPath.values()].filter((f) => f.path.toLowerCase() === normalized.toLowerCase());
  return matches.length === 1 ? matches[0] : null;
}

/** Accepts integers and integer strings ("12"); returns null otherwise. */
function toLineNumber(value) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return Number.isInteger(n) ? n : null;
}

function toSeverity(value) {
  if (typeof value !== 'string') return null;
  const s = value.trim().toLowerCase();
  if (SEVERITIES.includes(s)) return s;
  return SEVERITY_ALIASES[s] ?? null;
}

/** 0..1, or a percentage 1..100 converted to 0..1. Anything else is invalid. */
function toConfidence(value) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value.replace('%', '')) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return null;
  if (n <= 1) return Math.round(n * 100) / 100;
  if (n <= 100) return Math.round(n) / 100;
  return null;
}

function toCategory(value) {
  if (typeof value !== 'string') return 'other';
  const c = value.trim().toLowerCase().replace(/[\s_]+/g, '-');
  return CATEGORIES.includes(c) ? c : 'other';
}

function toText(value, limit) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

/** Evidence lines without "12: " prefixes, normalized, empty lines removed. */
function evidenceLines(evidence) {
  if (typeof evidence !== 'string') return [];
  let lines = evidence.replace(/\r\n/g, '\n').split('\n');
  const nonEmpty = lines.filter((l) => l.trim() !== '');
  // The model sometimes copies the line-number prefix; strip it only if every line has one.
  if (nonEmpty.length > 0 && nonEmpty.every((l) => /^\s*\d+: ?/.test(l))) {
    lines = lines.map((l) => l.replace(/^\s*\d+: ?/, ''));
  }
  return lines.map(normalizeLine).filter((l) => l !== '');
}

/** 0-based indexes where the evidence lines appear in the file, in order. */
function findEvidence(normalizedFile, evidence) {
  const positions = [];
  for (let i = 0; i + evidence.length <= normalizedFile.length; i++) {
    if (evidence.every((line, k) => normalizedFile[i + k].includes(line))) positions.push(i);
  }
  return positions;
}

/**
 * Validates one raw finding. Returns the cleaned finding, or the reason it was rejected.
 * @param {unknown} raw
 * @param {Map<string, SourceFile & { normalized?: string[] }>} filesByPath
 */
export function validateFinding(raw, filesByPath) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'not an object' };

  const file = resolveFile(raw.filePath ?? raw.file ?? raw.path, filesByPath);
  if (!file) return { ok: false, reason: 'unknown file path' };

  let startLine = toLineNumber(raw.startLine ?? raw.line);
  let endLine = toLineNumber(raw.endLine) ?? startLine;
  if (startLine === null || startLine < 1 || startLine > file.lineCount) {
    return { ok: false, reason: 'line number outside the file' };
  }
  if (endLine === null || endLine < startLine || endLine > file.lineCount) endLine = startLine;

  const severity = toSeverity(raw.severity);
  if (!severity) return { ok: false, reason: 'invalid severity' };

  const confidence = toConfidence(raw.confidence);
  if (confidence === null) return { ok: false, reason: 'invalid confidence' };

  const title = toText(raw.title, TEXT_LIMITS.title);
  const explanation = toText(raw.explanation, TEXT_LIMITS.explanation);
  const suggestedFix = toText(raw.suggestedFix, TEXT_LIMITS.suggestedFix);
  if (!title || !explanation || !suggestedFix) return { ok: false, reason: 'missing title, explanation or fix' };
  // A "bug" whose fix is "no fix needed" is not actionable (the model sometimes reports style remarks this way).
  if (NO_FIX_PATTERN.test(suggestedFix)) return { ok: false, reason: 'not actionable (no fix needed)' };

  // The evidence must really be in the file, at or near the reported lines.
  const evidence = evidenceLines(raw.evidence);
  if (evidence.join('').length < 3) return { ok: false, reason: 'missing evidence' };

  file.normalized ??= file.lines.map(normalizeLine);
  const positions = findEvidence(file.normalized, evidence);
  if (positions.length === 0) return { ok: false, reason: 'evidence not found in the file' };

  const reported = startLine - 1;
  const inRange = positions.find((p) => p >= reported && p + evidence.length - 1 <= endLine - 1);
  let lineAdjusted = false;
  let match = inRange;
  if (match === undefined) {
    // Evidence is elsewhere: move the finding to it if the location is unambiguous.
    const nearby = positions.filter((p) => Math.abs(p - reported) <= SEARCH_WINDOW);
    if (nearby.length > 0) match = nearby.reduce((a, b) => (Math.abs(b - reported) < Math.abs(a - reported) ? b : a));
    else if (positions.length === 1) match = positions[0];
    else return { ok: false, reason: 'evidence does not match the reported lines' };

    const span = endLine - startLine;
    lineAdjusted = match + 1 !== startLine;
    startLine = match + 1;
    endLine = Math.min(file.lineCount, Math.max(match + evidence.length, startLine + span));
  }

  // Return the exact source text as evidence, not the model's copy of it.
  const evidenceEnd = Math.min(match + evidence.length, match + MAX_EVIDENCE_LINES);
  const sourceEvidence = file.lines.slice(match, evidenceEnd).join('\n');

  return {
    ok: true,
    lineAdjusted,
    finding: {
      title,
      severity,
      confidence,
      filePath: file.path,
      startLine,
      endLine,
      evidence: sourceEvidence,
      explanation,
      suggestedFix,
      fixedCode: typeof raw.fixedCode === 'string' ? raw.fixedCode.replace(/\r\n/g, '\n').slice(0, TEXT_LIMITS.fixedCode) : '',
      category: toCategory(raw.category),
      // The AI has not executed or tested anything, so findings are never "verified" here.
      status: 'potential',
    },
  };
}

const words = (text) => new Set(text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);

function titleSimilarity(a, b) {
  const wa = words(a);
  const wb = words(b);
  if (wa.size === 0 || wb.size === 0) return 0;
  const shared = [...wa].filter((w) => wb.has(w)).length;
  return shared / (wa.size + wb.size - shared);
}

function isDuplicate(a, b) {
  if (a.filePath !== b.filePath) return false;
  const overlaps = a.startLine <= b.endLine + 1 && b.startLine <= a.endLine + 1;
  if (!overlaps) return false;
  return a.category === b.category || a.evidence === b.evidence || titleSimilarity(a.title, b.title) >= 0.5;
}

/** Most severe first, then most confident, then by file and line. */
export function compareFindings(a, b) {
  return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
    b.confidence - a.confidence ||
    a.filePath.localeCompare(b.filePath) ||
    a.startLine - b.startLine;
}

/** Removes findings that describe the same problem, keeping the most severe/confident one. */
export function dedupeFindings(findings) {
  const kept = [];
  for (const finding of [...findings].sort(compareFindings)) {
    if (!kept.some((k) => isDuplicate(k, finding))) kept.push(finding);
  }
  return kept;
}

/**
 * Validates a list of raw findings.
 * @returns {{ accepted: object[], rejected: Record<string, number>, adjusted: number }}
 */
export function validateFindings(rawFindings, filesByPath) {
  const accepted = [];
  const rejected = {};
  let adjusted = 0;
  for (const raw of Array.isArray(rawFindings) ? rawFindings : []) {
    const result = validateFinding(raw, filesByPath);
    if (result.ok) {
      accepted.push(result.finding);
      if (result.lineAdjusted) adjusted++;
    } else {
      rejected[result.reason] = (rejected[result.reason] ?? 0) + 1;
    }
  }
  return { accepted, rejected, adjusted };
}

/** Summary counts, always computed from the accepted findings. */
export function summarizeFindings(findings, filesAnalyzed) {
  const summary = { filesAnalyzed, findingsCount: findings.length };
  for (const severity of SEVERITIES) summary[severity] = findings.filter((f) => f.severity === severity).length;
  return summary;
}
