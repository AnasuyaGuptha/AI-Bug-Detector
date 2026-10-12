import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseModelOutput } from '../src/utils/parseModelOutput.js';

const finding = { filePath: 'a.js', startLine: 1, title: 't' };

test('parses plain JSON', () => {
  const r = parseModelOutput(JSON.stringify({ findings: [finding] }));
  assert.deepEqual(r, { ok: true, findings: [finding], recovered: false });
});

test('parses JSON inside Markdown fences', () => {
  const r = parseModelOutput('```json\n{"findings": [{"filePath": "a.js", "startLine": 1, "title": "t"}]}\n```');
  assert.equal(r.ok, true);
  assert.deepEqual(r.findings, [finding]);
});

test('parses JSON with text before and after it', () => {
  const r = parseModelOutput('Here is my review:\n{"findings": []}\nLet me know if you need more.');
  assert.deepEqual(r, { ok: true, findings: [], recovered: false });
});

test('ignores braces inside strings', () => {
  const r = parseModelOutput('Note {not json}. {"findings":[{"filePath":"a.js","startLine":1,"title":"uses } and { in a string"}]}');
  assert.equal(r.ok, true);
  assert.equal(r.findings[0].title, 'uses } and { in a string');
});

test('accepts a bare array of findings', () => {
  assert.deepEqual(parseModelOutput('[]').findings, []);
});

test('recovers complete findings from truncated output', () => {
  const text = '{"findings":[{"filePath":"a.js","startLine":1,"title":"one"},{"filePath":"a.js","startLine":2,"title":"tw';
  const r = parseModelOutput(text);
  assert.equal(r.ok, true);
  assert.equal(r.recovered, true);
  assert.deepEqual(r.findings.map((f) => f.title), ['one']);

  const spaced = parseModelOutput('{\n  "findings" : [\n    {"filePath": "a.js", "startLine": 1, "title": "one"},\n    {"filePath": "a.js", "sta');
  assert.equal(spaced.recovered, true);
  assert.equal(spaced.findings.length, 1);
});

test('rejects empty, non-JSON and wrongly shaped output', () => {
  assert.equal(parseModelOutput('').ok, false);
  assert.equal(parseModelOutput(undefined).ok, false);
  assert.equal(parseModelOutput('I could not find any bugs.').ok, false);
  assert.equal(parseModelOutput('{"result": "ok"}').ok, false);
  assert.equal(parseModelOutput('{"findings": [').ok, false);
});
