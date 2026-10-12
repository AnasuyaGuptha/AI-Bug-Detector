import { splitLines } from './addLineNumbers.js';

// Converts an /api/analyze finding into the `Finding` shape the frontend
// displays (frontend/src/types.ts), so the frontend needs no changes.

const CONTEXT_LINES = 2; // lines shown above and below the bug

/** "First sentence. Rest." -> "First sentence." */
function firstSentence(text) {
  const match = text.match(/^[\s\S]*?[.!?](?=\s|$)/);
  return (match ? match[0] : text).trim();
}

/**
 * @param {object} finding a validated finding from analyzeRepositoryFiles()
 * @param {string} fileContent the full content of finding.filePath
 */
export function toFrontendFinding(finding, fileContent) {
  const lines = splitLines(fileContent);
  const first = Math.max(1, finding.startLine - CONTEXT_LINES);
  const last = Math.min(lines.length, finding.endLine + CONTEXT_LINES);
  const slice = (from, to) => lines.slice(from - 1, to); // 1-based, inclusive

  const evidence = slice(first, last).join('\n');
  // The fix is the same snippet with the buggy lines replaced, so the frontend can diff them.
  const suggestedFix = finding.fixedCode
    ? [...slice(first, finding.startLine - 1), ...splitLines(finding.fixedCode), ...slice(finding.endLine + 1, last)].join('\n')
    : evidence;

  return {
    id: finding.id,
    title: finding.title,
    severity: finding.severity,
    category: finding.category,
    file: finding.filePath,
    line: finding.startLine,
    summary: firstSentence(finding.explanation),
    explanation: finding.explanation,
    fixExplanation: finding.suggestedFix,
    evidence,
    evidenceStartLine: first,
    suggestedFix,
    confidence: finding.confidence,
  };
}
