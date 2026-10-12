const EXTENSIONS: Record<string, string> = {
  py: 'python',
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  go: 'go',
  rs: 'rust',
  cpp: 'cpp',
  cc: 'cpp',
  c: 'c',
  h: 'c',
  json: 'json',
  yml: 'yaml',
  yaml: 'yaml',
  md: 'markdown',
  swift: 'swift',
  kt: 'kotlin',
}

const LABELS: Record<string, string> = {
  python: 'Python',
  typescript: 'TypeScript',
  tsx: 'TypeScript (TSX)',
  javascript: 'JavaScript',
  jsx: 'JavaScript (JSX)',
  go: 'Go',
  rust: 'Rust',
  cpp: 'C++',
  c: 'C',
  json: 'JSON',
  yaml: 'YAML',
  markdown: 'Markdown',
  swift: 'Swift',
  kotlin: 'Kotlin',
}

export function languageFor(file: string, explicit?: string): string {
  if (explicit) return explicit
  const ext = file.split('.').pop()?.toLowerCase() ?? ''
  return EXTENSIONS[ext] ?? 'plain'
}

export function languageLabel(lang: string): string {
  return LABELS[lang] ?? 'Plain text'
}

export type DiffOp = { kind: 'same' | 'add' | 'del'; text: string; oldNo?: number; newNo?: number }

/** Line diff using longest common subsequence. Snippets are small, so O(n*m) is fine. */
export function diffLines(before: string, after: string, startLine = 1): DiffOp[] {
  const a = before.split('\n')
  const b = after.split('\n')
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])

  const ops: DiffOp[] = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      ops.push({ kind: 'same', text: a[i], oldNo: startLine + i, newNo: startLine + j })
      i++
      j++
    } else if (i < a.length && (j >= b.length || lcs[i + 1][j] >= lcs[i][j + 1])) {
      // Removed lines come before added lines, like git diff.
      ops.push({ kind: 'del', text: a[i], oldNo: startLine + i })
      i++
    } else {
      ops.push({ kind: 'add', text: b[j], newNo: startLine + j })
      j++
    }
  }
  return ops
}
