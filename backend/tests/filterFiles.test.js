import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getLanguage, isExcludedPath, selectSourceFiles } from '../src/utils/filterFiles.js';

const blob = (path, size = 1000, mode = '100644') => ({ path, type: 'blob', mode, size });

test('maps extensions to languages', () => {
  assert.equal(getLanguage('a/b.js'), 'javascript');
  assert.equal(getLanguage('a/b.MJS'), 'javascript');
  assert.equal(getLanguage('a/b.tsx'), 'typescript');
  assert.equal(getLanguage('main.py'), 'python');
  assert.equal(getLanguage('Main.java'), 'java');
  assert.equal(getLanguage('x.c'), 'c');
  assert.equal(getLanguage('x.h'), 'c');
  assert.equal(getLanguage('x.cpp'), 'cpp');
  assert.equal(getLanguage('x.hpp'), 'cpp');
  assert.equal(getLanguage('main.go'), 'go');
  assert.equal(getLanguage('lib/main.dart'), 'dart');
  assert.equal(getLanguage('README.md'), null);
  assert.equal(getLanguage('image.png'), null);
  assert.equal(getLanguage('Makefile'), null);
  assert.equal(getLanguage('.js'), null);
});

test('excludes dependency, build and hidden folders', () => {
  for (const path of [
    'node_modules/x/index.js', 'vendor/lib.go', '.git/hooks/pre-commit.js', 'dist/app.js',
    'build/out.js', 'coverage/lcov.js', '.next/server/page.js', 'packages/a/node_modules/b.js',
    '__pycache__/x.py', 'venv/lib/site.py', '.venv/lib/x.py', 'Build/x.js',
  ]) {
    assert.equal(isExcludedPath(path), true, path);
  }
});

test('excludes minified, bundled and generated files', () => {
  for (const path of [
    'public/jquery.min.js', 'static/app.bundle.js', 'static/main-chunk.js', 'types/index.d.ts',
    'api/service.pb.go', 'proto/msg_pb2.py', 'lib/model.g.dart', 'lib/model.freezed.dart', 'src/schema.generated.ts',
  ]) {
    assert.equal(isExcludedPath(path), true, path);
  }
});

test('keeps normal source files', () => {
  for (const path of ['src/index.js', 'lib/router/index.js', 'app.py', 'cmd/server/main.go', 'src/builder.js']) {
    assert.equal(isExcludedPath(path), false, path);
  }
});

test('skips folders, symlinks, submodules, unsupported and oversized files', () => {
  const result = selectSourceFiles([
    { path: 'src', type: 'tree', mode: '040000' },
    { path: 'sub', type: 'commit', mode: '160000' },
    blob('src/link.js', 10, '120000'),
    blob('README.md'),
    blob('package-lock.json'),
    blob('src/big.js', 200 * 1024),
    blob('src/ok.js', 100 * 1024),
  ]);
  assert.deepEqual(result.selected.map((f) => f.path), ['src/ok.js']);
  assert.deepEqual(result.tooLarge, ['src/big.js']);
  assert.equal(result.supportedCount, 2);
  assert.equal(result.notSelectedCount, 0);
});

test('prefers application source over tests, examples and config', () => {
  const result = selectSourceFiles([
    blob('test/app.test.js'),
    blob('examples/demo.js'),
    blob('webpack.config.js'),
    blob('src/utils/helpers.test.js'),
    blob('src/index.js'),
    blob('lib/router.js'),
    blob('index.js'),
  ], { maxFiles: 3 });
  assert.deepEqual(result.selected.map((f) => f.path), ['lib/router.js', 'src/index.js', 'index.js']);
  assert.equal(result.notSelectedCount, 4);
});

test('limits the number of files', () => {
  const entries = Array.from({ length: 50 }, (_, i) => blob(`src/file${i}.js`));
  const result = selectSourceFiles(entries);
  assert.equal(result.selected.length, 20);
  assert.equal(result.supportedCount, 50);
  assert.equal(result.notSelectedCount, 30);
});
