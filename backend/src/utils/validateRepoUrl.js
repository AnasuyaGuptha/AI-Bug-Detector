import { AppError } from './AppError.js';
import { MAX_REPO_URL_LENGTH } from '../config/limits.js';

const ALLOWED_HOSTS = new Set(['github.com', 'www.github.com']);

// GitHub usernames/org names: letters, digits and single hyphens, max 39 chars.
const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
// Repository names: letters, digits, '.', '_' and '-', max 100 chars.
const REPO_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

function invalid(message = 'Please provide a valid public GitHub repository URL, for example https://github.com/owner/repo.') {
  return new AppError(400, 'INVALID_REPOSITORY_URL', message);
}

/**
 * Validates a GitHub repository URL and extracts the owner and repository name.
 *
 * Accepted:  https://github.com/owner/repo
 *            https://github.com/owner/repo/
 *            https://github.com/owner/repo.git
 * Rejected:  other hosts, http://, extra path segments (e.g. /tree/main), credentials, ports.
 *
 * @param {unknown} input
 * @returns {{ owner: string, repo: string }}
 * @throws {AppError} 400 INVALID_REPOSITORY_URL
 */
export function validateRepoUrl(input) {
  if (typeof input !== 'string' || input.trim() === '') {
    throw invalid('The "repoUrl" field is required and must be a GitHub repository URL.');
  }

  const raw = input.trim();
  if (raw.length > MAX_REPO_URL_LENGTH) {
    throw invalid('The repository URL is too long.');
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw invalid();
  }

  if (url.protocol !== 'https:') {
    throw invalid('Only HTTPS GitHub URLs are supported (https://github.com/owner/repo).');
  }
  if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase()) || url.port !== '') {
    throw invalid('Only repositories hosted on github.com are supported.');
  }
  if (url.username || url.password) {
    throw invalid('Repository URLs must not contain credentials.');
  }

  // "/owner/repo/" -> "owner/repo"
  let path = url.pathname.slice(1);
  if (path.endsWith('/')) path = path.slice(0, -1);
  const segments = path.split('/');

  if (segments.length !== 2) {
    throw invalid('The URL must point to a repository root, for example https://github.com/owner/repo.');
  }

  const owner = segments[0];
  let repo = segments[1];
  if (repo.toLowerCase().endsWith('.git')) repo = repo.slice(0, -4);

  if (!OWNER_PATTERN.test(owner) || !REPO_PATTERN.test(repo) || repo === '.' || repo === '..') {
    throw invalid('The URL is missing a valid repository owner or name.');
  }

  return { owner, repo };
}
