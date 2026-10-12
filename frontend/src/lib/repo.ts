/**
 * Turn user input into a canonical GitHub URL.
 * Accepts "https://github.com/owner/repo", "github.com/owner/repo", or "owner/repo".
 * Returns null when the input is not a repo.
 */
export function normalizeRepoUrl(input: string): string | null {
  const trimmed = input.trim().replace(/\.git$/, '').replace(/\/+$/, '')
  const match =
    trimmed.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)$/i) ??
    trimmed.match(/^([\w.-]+)\/([\w.-]+)$/)
  if (!match) return null
  return `https://github.com/${match[1]}/${match[2]}`
}

/** "https://github.com/owner/repo" -> "owner/repo" */
export function repoName(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?github\.com\//i, '')
}

/** "just now", "5 min ago", "3 h ago", or a date. */
export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.round((now - Date.parse(iso)) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' })
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
