import { AppError } from '../utils/AppError.js';
import { MAX_FILE_SIZE_BYTES, REQUEST_TIMEOUT_MS } from '../config/limits.js';

// Every request goes to one of these two fixed GitHub hosts. Users only
// control the owner/repo, which are validated before reaching this file.
const API_BASE = 'https://api.github.com';
const RAW_BASE = 'https://raw.githubusercontent.com';

function apiHeaders() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'RepoBug-AI-Scanner',
  };
  // Optional: a token raises the rate limit from 60 to 5,000 requests/hour.
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/** Encodes each part of a path but keeps the "/" separators. */
function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function isTimeout(error) {
  return error?.name === 'TimeoutError' || error?.name === 'AbortError';
}

/** fetch() with a timeout. Turns network failures into AppErrors. */
async function fetchWithTimeout(url, headers) {
  try {
    return await fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    if (isTimeout(error)) {
      throw new AppError(504, 'GITHUB_TIMEOUT', 'GitHub took too long to respond. Please try again.');
    }
    throw new AppError(502, 'GITHUB_UNREACHABLE', 'Could not connect to GitHub. Check your internet connection and try again.');
  }
}

function isRateLimited(response) {
  if (response.status === 429) return true;
  return response.status === 403 &&
    (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after'));
}

function rateLimitError(response) {
  let message = 'GitHub API rate limit exceeded.';
  const reset = Number(response.headers.get('x-ratelimit-reset'));
  if (reset) message += ` Try again after ${new Date(reset * 1000).toISOString()}.`;
  if (!process.env.GITHUB_TOKEN?.trim()) message += ' Adding a GITHUB_TOKEN to the backend .env file raises the limit.';
  return new AppError(429, 'GITHUB_RATE_LIMITED', message);
}

/**
 * GET a GitHub REST API path and return the parsed JSON.
 * @param {string} path            e.g. "/repos/expressjs/express"
 * @param {AppError} notFoundError error to throw on 404
 * @param {{ emptyOn409?: boolean }} [options] return null on 409 (GitHub's answer for an empty repository)
 */
async function githubApiGet(path, notFoundError, options = {}) {
  const response = await fetchWithTimeout(`${API_BASE}${path}`, apiHeaders());

  if (response.ok) {
    try {
      return await response.json();
    } catch (error) {
      if (isTimeout(error)) throw new AppError(504, 'GITHUB_TIMEOUT', 'GitHub took too long to respond. Please try again.');
      throw new AppError(502, 'GITHUB_API_ERROR', 'GitHub returned an unexpected response.');
    }
  }

  if (isRateLimited(response)) throw rateLimitError(response);
  if (response.status === 404) throw notFoundError;
  if (response.status === 409 && options.emptyOn409) return null;
  if (response.status === 401) {
    throw new AppError(502, 'GITHUB_AUTH_FAILED', 'GitHub rejected the server\'s access token. Check GITHUB_TOKEN in the backend .env file, or remove it.');
  }
  if (response.status === 403 || response.status === 451) {
    throw new AppError(403, 'REPOSITORY_ACCESS_DENIED', 'GitHub denied access to this repository.');
  }
  throw new AppError(502, 'GITHUB_API_ERROR', `GitHub API request failed (HTTP ${response.status}). Please try again later.`);
}

/**
 * Fetches repository metadata. The default branch comes from GitHub, never assumed.
 * @returns {Promise<{ owner: string, name: string, branch: string, url: string }>}
 */
export async function getRepositoryMetadata(owner, repo) {
  const data = await githubApiGet(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    new AppError(404, 'REPOSITORY_NOT_FOUND', `Repository "${owner}/${repo}" was not found. Check the URL and make sure the repository is public.`),
  );

  if (data.private) {
    throw new AppError(403, 'PRIVATE_REPOSITORY', 'Only public repositories can be scanned.');
  }
  if (!data.default_branch) {
    throw new AppError(404, 'BRANCH_NOT_FOUND', 'Could not determine the repository\'s default branch.');
  }

  // Use GitHub's canonical names (handles renamed repos and different letter case).
  return {
    owner: data.owner?.login ?? owner,
    name: data.name ?? repo,
    branch: data.default_branch,
    url: data.html_url ?? `https://github.com/${owner}/${repo}`,
  };
}

/**
 * Fetches the full recursive file tree of a branch.
 * @returns {Promise<{ entries: Array<{ path: string, type: string, mode: string, size?: number }>, truncated: boolean, empty: boolean }>}
 */
export async function getRepositoryTree(owner, repo, branch) {
  const data = await githubApiGet(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodePath(branch)}?recursive=1`,
    new AppError(404, 'BRANCH_NOT_FOUND', `Branch "${branch}" was not found in ${owner}/${repo}.`),
    { emptyOn409: true },
  );

  if (data === null) return { entries: [], truncated: false, empty: true };
  return { entries: Array.isArray(data.tree) ? data.tree : [], truncated: Boolean(data.truncated), empty: false };
}

/**
 * Downloads one file's text. Never throws: a failure for one file must not
 * fail the whole scan, so it returns { ok: false, reason } instead.
 * @returns {Promise<{ ok: true, content: string } | { ok: false, reason: string }>}
 */
export async function fetchFileContent(owner, repo, branch, path) {
  const url = `${RAW_BASE}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodePath(branch)}/${encodePath(path)}`;

  let response;
  try {
    response = await fetchWithTimeout(url, { 'User-Agent': 'RepoBug-AI-Scanner' });
  } catch (error) {
    return { ok: false, reason: error.code === 'GITHUB_TIMEOUT' ? 'request timed out' : 'network error' };
  }

  if (!response.ok) {
    return { ok: false, reason: response.status === 429 ? 'rate limited by GitHub' : `HTTP ${response.status}` };
  }

  let bytes;
  try {
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    return { ok: false, reason: isTimeout(error) ? 'request timed out' : 'download interrupted' };
  }

  // Double-check limits on the actual bytes (the tree's size could be stale).
  if (bytes.length > MAX_FILE_SIZE_BYTES) return { ok: false, reason: 'file is larger than 100 KB' };
  if (bytes.includes(0)) return { ok: false, reason: 'file appears to be binary' };

  return { ok: true, content: new TextDecoder('utf-8').decode(bytes) };
}
