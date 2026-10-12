/**
 * Splits file content into lines. A trailing newline at the end of the file
 * does not create an extra empty line. Handles both \n and \r\n endings.
 */
export function splitLines(content) {
  if (content === '') return [];
  const lines = content.split(/\r?\n/);
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** Number of lines in the content. */
export function countLines(content) {
  return splitLines(content).length;
}

/**
 * Returns a copy of the content with "N: " prefixed to every line.
 * The original content is not modified.
 *
 * addLineNumbers('a\nb') === '1: a\n2: b'
 */
export function addLineNumbers(content) {
  return splitLines(content)
    .map((line, index) => `${index + 1}: ${line}`)
    .join('\n');
}
