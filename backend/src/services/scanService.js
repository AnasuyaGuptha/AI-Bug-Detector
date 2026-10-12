import { validateRepoUrl } from '../utils/validateRepoUrl.js';
import { selectSourceFiles } from '../utils/filterFiles.js';
import { addLineNumbers, countLines } from '../utils/addLineNumbers.js';
import { mapWithConcurrency } from '../utils/mapWithConcurrency.js';
import { getRepositoryMetadata, getRepositoryTree, fetchFileContent } from './githubService.js';
import { FILE_FETCH_CONCURRENCY, MAX_FILES_PER_SCAN } from '../config/limits.js';

/**
 * Scans a public GitHub repository and returns its source files with line numbers.
 * This only downloads text; repository code is never executed or installed.
 *
 * @param {string} repoUrl
 * @param {{ onProgress?: (update: object) => void }} [options]
 *   onProgress is called as the scan moves along (used by the scan-job routes):
 *   { stage: 'metadata', repository } -> { stage: 'download', total } -> { stage: 'file', done, total }
 * @returns {Promise<object>} the POST /api/scan response body
 */
export async function scanRepository(repoUrl, { onProgress = () => {} } = {}) {
  const { owner, repo } = validateRepoUrl(repoUrl);
  const repository = await getRepositoryMetadata(owner, repo);
  onProgress({ stage: 'metadata', repository });
  const tree = await getRepositoryTree(repository.owner, repository.name, repository.branch);

  const warnings = [];
  if (tree.empty) {
    warnings.push('This repository is empty.');
  }
  if (tree.truncated) {
    warnings.push('This repository is very large, so GitHub returned only part of its file tree. Some files were not considered.');
  }

  const { selected, supportedCount, tooLarge, notSelectedCount } = selectSourceFiles(tree.entries);

  if (tooLarge.length > 0) {
    warnings.push(`Skipped ${tooLarge.length} file(s) larger than 100 KB: ${tooLarge.slice(0, 5).join(', ')}${tooLarge.length > 5 ? ', ...' : ''}`);
  }
  if (notSelectedCount > 0) {
    warnings.push(`Found ${supportedCount} supported source files; only the ${MAX_FILES_PER_SCAN} most relevant were scanned.`);
  }
  if (!tree.empty && supportedCount === 0) {
    warnings.push('No supported source files were found (supported: JavaScript, TypeScript, Python, Java, C/C++, Go, Dart).');
  }

  onProgress({ stage: 'download', total: selected.length });
  let done = 0;
  const downloads = await mapWithConcurrency(selected, FILE_FETCH_CONCURRENCY, async (file) => {
    const result = await fetchFileContent(repository.owner, repository.name, repository.branch, file.path);
    onProgress({ stage: 'file', done: ++done, total: selected.length });
    return result;
  });

  const files = [];
  selected.forEach((file, index) => {
    const result = downloads[index];
    if (!result.ok) {
      warnings.push(`Could not fetch "${file.path}": ${result.reason}.`);
      return;
    }
    files.push({
      path: file.path,
      language: file.language,
      lineCount: countLines(result.content),
      content: result.content,
      numberedContent: addLineNumbers(result.content),
    });
  });

  return {
    success: true,
    repository,
    filesScanned: files.length,
    files,
    warnings,
  };
}
