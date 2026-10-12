// Limits that keep a scan fast and safe for a hackathon demo.
export const MAX_FILES_PER_SCAN = 20;
export const MAX_FILE_SIZE_BYTES = 100 * 1024; // 100 KB
export const REQUEST_TIMEOUT_MS = 10_000; // per GitHub request
export const FILE_FETCH_CONCURRENCY = 5; // files downloaded in parallel
export const MAX_REPO_URL_LENGTH = 300;
