import { SEVERITY_ORDER } from '../severity'
import type { Finding, Severity } from '../types'

export type SortKey = 'severity' | 'file' | 'category'

export interface Filters {
  query: string
  severity: Severity | null
  category: string
  sort: SortKey
}

/** Read list filters from the URL. Unknown values fall back to defaults. */
export function readFilters(params: URLSearchParams): Filters {
  const sev = params.get('severity') as Severity | null
  const sort = params.get('sort') as SortKey | null
  return {
    query: params.get('q') ?? '',
    severity: sev && SEVERITY_ORDER.includes(sev) ? sev : null,
    category: params.get('category') ?? '',
    sort: sort && sort in SORT_LABELS ? sort : 'severity',
  }
}

export function applyFilters(list: Finding[], { query, severity, category, sort }: Filters): Finding[] {
  return sortFindings(
    list.filter(
      (f) => (!severity || f.severity === severity) && (!category || f.category === category) && matchesQuery(f, query),
    ),
    sort,
  )
}

export const SORT_LABELS: Record<SortKey, string> = {
  severity: 'Severity',
  file: 'File path',
  category: 'Category',
}

const bySeverity = (a: Finding, b: Finding) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
const byFile = (a: Finding, b: Finding) => a.file.localeCompare(b.file) || a.line - b.line

export function sortFindings(list: Finding[], key: SortKey = 'severity'): Finding[] {
  const copy = [...list]
  if (key === 'file') return copy.sort((a, b) => byFile(a, b) || bySeverity(a, b))
  if (key === 'category') return copy.sort((a, b) => a.category.localeCompare(b.category) || bySeverity(a, b))
  return copy.sort((a, b) => bySeverity(a, b) || byFile(a, b))
}

export function matchesQuery(f: Finding, q: string): boolean {
  if (!q) return true
  const hay = `${f.title} ${f.file} ${f.category} ${f.summary}`.toLowerCase()
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => hay.includes(word))
}
