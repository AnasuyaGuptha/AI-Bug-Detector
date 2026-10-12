import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dedupeFindings, summarizeFindings, validateFinding, validateFindings } from '../src/utils/validateFindings.js';
import { splitLines } from '../src/utils/addLineNumbers.js';

const SOURCE = [
  'function divide(a, b) {',   // 1
  '  return a / b;',           // 2
  '}',                         // 3
  'console.log(divide(10, 0));', // 4
  '',                          // 5
  'function first(items) {',   // 6
  '  return items[0].name;',   // 7
  '}',                         // 8
].join('\n');

function files() {
  const lines = splitLines(SOURCE);
  return new Map([['src/example.js', { path: 'src/example.js', language: 'javascript', content: SOURCE, lines, lineCount: lines.length }]]);
}

const base = {
  filePath: 'src/example.js',
  startLine: 2,
  endLine: 2,
  title: 'Division by zero',
  severity: 'medium',
  confidence: 0.9,
  category: 'runtime-error',
  evidence: 'return a / b;',
  explanation: 'b can be 0.',
  suggestedFix: 'Check b first.',
  fixedCode: '  if (b === 0) throw new Error();\n  return a / b;',
};

test('accepts a correct finding and returns the exact source as evidence', () => {
  const r = validateFinding(base, files());
  assert.equal(r.ok, true);
  assert.equal(r.lineAdjusted, false);
  assert.deepEqual(r.finding, {
    title: 'Division by zero',
    severity: 'medium',
    confidence: 0.9,
    filePath: 'src/example.js',
    startLine: 2,
    endLine: 2,
    evidence: '  return a / b;',
    explanation: 'b can be 0.',
    suggestedFix: 'Check b first.',
    fixedCode: '  if (b === 0) throw new Error();\n  return a / b;',
    category: 'runtime-error',
    status: 'potential',
  });
});

test('never marks a finding as verified, even if the model says so', () => {
  assert.equal(validateFinding({ ...base, status: 'verified' }, files()).finding.status, 'potential');
});

test('normalizes severity, confidence, category and line-number strings', () => {
  const r = validateFinding({ ...base, severity: 'MAJOR', confidence: '85%', category: 'Null Reference', startLine: '2', endLine: '2' }, files());
  assert.equal(r.ok, true);
  assert.equal(r.finding.severity, 'high');
  assert.equal(r.finding.confidence, 0.85);
  assert.equal(r.finding.category, 'null-reference');
  assert.equal(validateFinding({ ...base, category: 'weird' }, files()).finding.category, 'other');
});

test('rejects invalid severity and confidence', () => {
  assert.equal(validateFinding({ ...base, severity: 'urgent' }, files()).reason, 'invalid severity');
  assert.equal(validateFinding({ ...base, severity: undefined }, files()).reason, 'invalid severity');
  assert.equal(validateFinding({ ...base, confidence: -0.1 }, files()).reason, 'invalid confidence');
  assert.equal(validateFinding({ ...base, confidence: 250 }, files()).reason, 'invalid confidence');
  assert.equal(validateFinding({ ...base, confidence: 'high' }, files()).reason, 'invalid confidence');
  assert.equal(validateFinding({ ...base, confidence: undefined }, files()).reason, 'invalid confidence');
});

test('resolves equivalent paths but rejects unknown files', () => {
  assert.equal(validateFinding({ ...base, filePath: './src/example.js' }, files()).ok, true);
  assert.equal(validateFinding({ ...base, filePath: 'SRC\\Example.js' }, files()).ok, true);
  assert.equal(validateFinding({ ...base, filePath: 'src/other.js' }, files()).reason, 'unknown file path');
  assert.equal(validateFinding({ ...base, filePath: undefined }, files()).reason, 'unknown file path');
});

test('rejects invalid or out-of-range line numbers', () => {
  for (const startLine of [0, -1, 9, 100, 2.5, 'two', null]) {
    assert.equal(validateFinding({ ...base, startLine }, files()).reason, 'line number outside the file', String(startLine));
  }
});

test('rejects evidence that is not in the file', () => {
  assert.equal(validateFinding({ ...base, evidence: 'return a * b;' }, files()).reason, 'evidence not found in the file');
  assert.equal(validateFinding({ ...base, evidence: '' }, files()).reason, 'missing evidence');
});

test('accepts evidence with different whitespace or copied line-number prefixes', () => {
  assert.equal(validateFinding({ ...base, evidence: 'return   a / b;' }, files()).ok, true);
  assert.equal(validateFinding({ ...base, evidence: '2:   return a / b;' }, files()).ok, true);
  const multi = validateFinding({ ...base, startLine: 1, endLine: 2, evidence: 'function divide(a, b) {\n  return a / b;' }, files());
  assert.equal(multi.ok, true);
  assert.equal(multi.finding.evidence, 'function divide(a, b) {\n  return a / b;');
});

test('moves a finding to where its evidence actually is', () => {
  const r = validateFinding({ ...base, startLine: 4, endLine: 4, evidence: 'return items[0].name;' }, files());
  assert.equal(r.ok, true);
  assert.equal(r.lineAdjusted, true);
  assert.equal(r.finding.startLine, 7);
  assert.equal(r.finding.endLine, 7);
});

test('uses the nearest match when the evidence appears more than once', () => {
  // "return" is on lines 2 and 7; reported line 6 is closest to line 7.
  const r = validateFinding({ ...base, startLine: 6, endLine: 6, evidence: 'return' }, files());
  assert.equal(r.ok, true);
  assert.equal(r.finding.startLine, 7);
});

test('rejects evidence that matches several places far from the reported line', () => {
  const content = ['x = 1', ...Array(10).fill('pass'), 'x = 1', ...Array(10).fill('pass'), 'x = 1'].join('\n');
  const lines = splitLines(content);
  const map = new Map([['a.py', { path: 'a.py', language: 'python', content, lines, lineCount: lines.length }]]);
  const r = validateFinding({ ...base, filePath: 'a.py', startLine: 6, endLine: 6, evidence: 'x = 1' }, map);
  assert.equal(r.reason, 'evidence does not match the reported lines');
});

test('rejects findings that need no fix', () => {
  for (const suggestedFix of ['No fix needed.', 'No change is required', 'None', 'N/A', 'no fix necessary']) {
    assert.equal(validateFinding({ ...base, suggestedFix }, files()).reason, 'not actionable (no fix needed)', suggestedFix);
  }
  assert.equal(validateFinding({ ...base, suggestedFix: 'Nonetheless, check b before dividing.' }, files()).ok, true);
  assert.equal(validateFinding({ ...base, suggestedFix: 'No fix is safe unless b is checked first: add a guard.' }, files()).ok, true);
});

test('rejects findings with missing text fields', () => {
  assert.equal(validateFinding({ ...base, title: '' }, files()).ok, false);
  assert.equal(validateFinding({ ...base, explanation: undefined }, files()).ok, false);
  assert.equal(validateFinding('not an object', files()).reason, 'not an object');
});

test('validateFindings counts rejections by reason', () => {
  const r = validateFindings([base, { ...base, severity: 'x' }, { ...base, severity: 'y' }, { ...base, filePath: 'nope.js' }], files());
  assert.equal(r.accepted.length, 1);
  assert.deepEqual(r.rejected, { 'invalid severity': 2, 'unknown file path': 1 });
  assert.deepEqual(validateFindings('garbage', files()), { accepted: [], rejected: {}, adjusted: 0 });
});

test('dedupes findings about the same problem and keeps the most severe', () => {
  const a = validateFinding(base, files()).finding;
  const b = { ...a, title: 'Possible division by zero in divide', severity: 'high', category: 'logic' };
  const c = { ...a, startLine: 7, endLine: 7, title: 'Crash on empty list', category: 'null-reference' };
  const result = dedupeFindings([a, b, c]);
  assert.equal(result.length, 2);
  assert.equal(result[0].severity, 'high');
  assert.equal(result[1].title, 'Crash on empty list');
});

test('summary counts are computed from findings', () => {
  const findings = [{ severity: 'high' }, { severity: 'high' }, { severity: 'low' }];
  assert.deepEqual(summarizeFindings(findings, 3), { filesAnalyzed: 3, findingsCount: 3, critical: 0, high: 2, medium: 0, low: 1 });
  assert.deepEqual(summarizeFindings([], 1), { filesAnalyzed: 1, findingsCount: 0, critical: 0, high: 0, medium: 0, low: 0 });
});
