import { MAX_FILES_PER_SCAN, MAX_FILE_SIZE_BYTES } from '../config/limits.js';

// File extension -> language reported to the AI module and frontend.
export const LANGUAGE_BY_EXTENSION = {
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.py': 'python',
  '.java': 'java',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.hpp': 'cpp',
  '.go': 'go',
  '.dart': 'dart',
};

// Folders that hold dependencies, build output or tooling, never app code.
// (Any folder starting with "." such as .git, .next or .venv is also excluded.)
const EXCLUDED_DIRECTORIES = new Set([
  'node_modules', 'bower_components', 'jspm_packages', 'vendor', 'third_party', 'third-party',
  'dist', 'build', 'out', 'coverage', 'target', 'bin', 'obj',
  '__pycache__', 'venv', 'site-packages', 'pods', 'generated', '__generated__',
]);

const LOCK_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'poetry.lock', 'pipfile.lock',
  'composer.lock', 'gemfile.lock', 'cargo.lock', 'go.sum', 'pubspec.lock',
]);

// Minified files, bundles and code produced by generators.
const GENERATED_FILE_PATTERNS = [
  /\.min\.[cm]?js$/,
  /[.-](bundle|chunk)\.[cm]?js$/,
  /\.d\.ts$/,
  /\.pb\.go$/,
  /_pb2(_grpc)?\.py$/,
  /\.(g|freezed|gr|mocks)\.dart$/,
  /[._]generated\.\w+$/,
];

// Lower priority: tests, examples, docs, scripts and config files.
const TEST_DIRECTORIES = new Set(['test', 'tests', '__tests__', '__mocks__', 'spec', 'specs', 'e2e', 'testdata', 'fixtures']);
const TEST_FILE_PATTERN = /(^test_|[._-](test|spec)s?\.\w+$)/;
const SECONDARY_DIRECTORIES = new Set(['example', 'examples', 'demo', 'demos', 'doc', 'docs', 'benchmark', 'benchmarks', 'bench', 'scripts', 'tools', 'support']);
const CONFIG_FILE_PATTERN = /(\.config\.[cm]?[jt]s$|^\.?[\w-]+rc\.[cm]?js$|^(gulpfile|gruntfile|setup|conftest|noxfile|fabfile)\.\w+$)/;
// Higher priority: folders that usually contain the application code.
const SOURCE_DIRECTORIES = new Set(['src', 'lib', 'app', 'apps', 'pkg', 'cmd', 'internal', 'server', 'api', 'core', 'packages']);

const SYMLINK_MODE = '120000';

function getExtension(fileName) {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(dot).toLowerCase() : '';
}

/** Returns the language for a path, or null if the extension is not supported. */
export function getLanguage(path) {
  const fileName = path.split('/').pop();
  return LANGUAGE_BY_EXTENSION[getExtension(fileName)] ?? null;
}

/** True if the path is in an excluded folder, a lock file, or a minified/generated file. */
export function isExcludedPath(path) {
  const segments = path.toLowerCase().split('/');
  const fileName = segments.pop();
  if (segments.some((dir) => dir.startsWith('.') || EXCLUDED_DIRECTORIES.has(dir))) return true;
  if (LOCK_FILES.has(fileName)) return true;
  return GENERATED_FILE_PATTERNS.some((pattern) => pattern.test(fileName));
}

/**
 * Relevance score for a source file. Lower is better.
 * Application code in src/, lib/ etc. comes first; tests, examples and config come last.
 */
export function relevanceScore(path) {
  const segments = path.toLowerCase().split('/');
  const fileName = segments.pop();
  let score = 0;

  if (segments.some((dir) => TEST_DIRECTORIES.has(dir)) || TEST_FILE_PATTERN.test(fileName)) score += 30;
  if (CONFIG_FILE_PATTERN.test(fileName)) score += 25;
  if (segments.some((dir) => SECONDARY_DIRECTORIES.has(dir))) score += 20;
  if (segments.some((dir) => SOURCE_DIRECTORIES.has(dir))) score -= 10;
  score += Math.min(segments.length, 5); // slightly prefer shallower files

  return score;
}

/**
 * Picks the source files to scan from a GitHub git tree.
 *
 * @param {Array<{ path: string, type: string, mode?: string, size?: number }>} treeEntries
 * @param {{ maxFiles?: number, maxFileSize?: number }} [options]
 * @returns {{
 *   selected: Array<{ path: string, language: string, size: number }>,
 *   supportedCount: number,   // supported files after exclusions (before the size and count limits)
 *   tooLarge: string[],       // paths skipped because of the size limit
 *   notSelectedCount: number, // eligible files left out because of the file-count limit
 * }}
 */
export function selectSourceFiles(treeEntries, options = {}) {
  const maxFiles = options.maxFiles ?? MAX_FILES_PER_SCAN;
  const maxFileSize = options.maxFileSize ?? MAX_FILE_SIZE_BYTES;

  const candidates = [];
  const tooLarge = [];

  for (const entry of treeEntries) {
    // Only regular files: skip folders, submodules and symlinks.
    if (entry.type !== 'blob' || entry.mode === SYMLINK_MODE) continue;

    const language = getLanguage(entry.path);
    if (!language || isExcludedPath(entry.path)) continue;

    const size = entry.size ?? 0;
    if (size > maxFileSize) {
      tooLarge.push(entry.path);
      continue;
    }

    candidates.push({ path: entry.path, language, size, score: relevanceScore(entry.path) });
  }

  candidates.sort((a, b) => a.score - b.score || a.path.localeCompare(b.path));

  const selected = candidates.slice(0, maxFiles).map(({ path, language, size }) => ({ path, language, size }));

  return {
    selected,
    supportedCount: candidates.length + tooLarge.length,
    tooLarge,
    notSelectedCount: Math.max(candidates.length - maxFiles, 0),
  };
}
