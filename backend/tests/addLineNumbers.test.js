import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addLineNumbers, countLines } from '../src/utils/addLineNumbers.js';

test('numbers each line', () => {
  assert.equal(addLineNumbers('const value = 10;\nconsole.log(value);'), '1: const value = 10;\n2: console.log(value);');
  assert.equal(countLines('const value = 10;\nconsole.log(value);'), 2);
});

test('ignores a single trailing newline but keeps blank lines', () => {
  assert.equal(addLineNumbers('a\n\nb\n'), '1: a\n2: \n3: b');
  assert.equal(countLines('a\n\nb\n'), 3);
});

test('handles CRLF and empty files', () => {
  assert.equal(addLineNumbers('a\r\nb\r\n'), '1: a\n2: b');
  assert.equal(addLineNumbers(''), '');
  assert.equal(countLines(''), 0);
  assert.equal(countLines('\n'), 1);
});
