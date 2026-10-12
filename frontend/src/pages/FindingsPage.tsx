import { ArrowLeft, ChevronDown, ChevronRight, Clock, ExternalLink, Search, SearchX, ShieldCheck, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { getFindings, getScan } from '../api/client'
import GitHubIcon from '../components/GitHubIcon'
import SampleBadge from '../components/SampleBadge'
import SeverityBadge from '../components/SeverityBadge'
import SeverityIcon from '../components/SeverityIcon'
import { EmptyState, ErrorState, Skeleton } from '../components/States'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { SORT_LABELS, applyFilters, readFilters } from '../lib/findings'
import { formatDate, repoName, timeAgo } from '../lib/repo'
import { SEVERITY_ICON, SEVERITY_ORDER, SEVERITY_STYLES } from '../severity'
import type { Finding, Scan, Severity } from '../types'

export default function FindingsPage() {
  const { scanId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const [findings, setFindings] = useState<Finding[] | null>(null)
  const [scan, setScan] = useState<Scan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)

  // Filters live in the URL so they survive reloads and the back button.
  const { query, severity, category, sort } = readFilters(params)

  const setParam = useCallback(
    (key: string, value: string | null) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (value) next.set(key, value)
          else next.delete(key)
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const clearFilters = () => setParams({}, { replace: true })

  useDocumentTitle(scan ? `Findings · ${repoName(scan.repoUrl)}` : 'Findings')

  useEffect(() => {
    let stopped = false
    setFindings(null)
    setError(null)
    getFindings(scanId).then(
      (f) => !stopped && setFindings(f),
      (err: Error) => !stopped && setError(err.message),
    )
    // Header details are nice to have. Ignore failures here.
    getScan(scanId).then((s) => !stopped && setScan(s), () => {})
    return () => {
      stopped = true
    }
  }, [scanId, attempt])

  // Press "/" to jump to search.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const counts = useMemo(() => {
    const c = Object.fromEntries(SEVERITY_ORDER.map((s) => [s, 0])) as Record<Severity, number>
    findings?.forEach((f) => c[f.severity]++)
    return c
  }, [findings])

  const categories = useMemo(() => [...new Set((findings ?? []).map((f) => f.category))].sort(), [findings])

  const visible = useMemo(
    () => applyFilters(findings ?? [], { query, severity, category, sort }),
    [findings, severity, category, query, sort],
  )

  const filtered = !!(query || severity || category)
  // Keep the active filters when opening a finding, so "back" returns to the same list.
  const listSearch = params.toString() ? `?${params.toString()}` : ''

  const backLink = (
    <Link to="/" className="btn-ghost -ml-2.5">
      <ArrowLeft className="size-4" aria-hidden />
      Scan another repository
    </Link>
  )

  if (error) {
    return (
      <div>
        {backLink}
        <div className="card mx-auto mt-6 max-w-xl">
          <ErrorState message={error} onRetry={() => setAttempt((a) => a + 1)} />
        </div>
      </div>
    )
  }

  if (!findings) return <FindingsSkeleton backLink={backLink} />

  const total = findings.length
  const present = SEVERITY_ORDER.filter((s) => counts[s] > 0)

  return (
    <div className="animate-fade-in">
      {backLink}

      {/* Header */}
      <div className="mt-6 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <RepoAvatar url={scan?.repoUrl} />
          <div className="min-w-0">
            <h1 className="flex min-w-0 items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
              <span className="truncate">{scan ? repoName(scan.repoUrl) : 'Scan results'}</span>
              {scan && (
                <a
                  href={scan.repoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 rounded text-faint transition-colors hover:text-accent"
                  aria-label="Open repository on GitHub (opens in a new tab)"
                >
                  <ExternalLink className="size-4" />
                </a>
              )}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted">
              {scan && (
                <span className="inline-flex items-center gap-1.5" title={formatDate(scan.finishedAt ?? scan.startedAt)}>
                  <Clock className="size-3.5 text-faint" aria-hidden />
                  Scanned {timeAgo(scan.finishedAt ?? scan.startedAt)}
                </span>
              )}
              {scan && <span className="text-faint">{scan.totalFiles} files analysed</span>}
              <SampleBadge />
            </div>
          </div>
        </div>

        {total > 0 && (
          <ul className="flex shrink-0 divide-x divide-line overflow-x-auto rounded-xl border border-line bg-surface" aria-label="Summary">
            <StatItem icon={<span className="grid size-7 place-items-center rounded-md border border-line bg-raised text-muted"><ShieldCheck className="size-3.5" /></span>} value={total} label="Findings" />
            {present.map((s) => (
              <StatItem key={s} icon={<SeverityIcon severity={s} size="sm" />} value={counts[s]} label={s} />
            ))}
          </ul>
        )}
      </div>

      {total === 0 ? (
        <div className="card mt-8">
          <EmptyState
            icon={ShieldCheck}
            title="No bugs found"
            action={
              <Link to="/" className="btn-secondary">
                Scan another repository
              </Link>
            }
          >
            RepoBug AI did not find any issues in this repository. Nice work.
          </EmptyState>
        </div>
      ) : (
        <>
          {/* Toolbar */}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" aria-hidden />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setParam('q', e.target.value || null)}
                onKeyDown={(e) => e.key === 'Escape' && setParam('q', null)}
                placeholder="Search findings…"
                aria-label="Search findings by title, file, category, or summary"
                className="h-10 w-full rounded-lg border border-line bg-surface pr-10 pl-9 text-sm outline-none transition-colors placeholder:text-faint focus:border-accent/50 [&::-webkit-search-cancel-button]:hidden"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setParam('q', null)}
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-faint hover:text-fg"
                  aria-label="Clear search"
                >
                  <X className="size-4" />
                </button>
              ) : (
                <kbd className="absolute top-1/2 right-3 hidden -translate-y-1/2 sm:inline-flex">/</kbd>
              )}
            </div>

            <div className="order-last -mx-4 flex w-[calc(100%+2rem)] gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:w-full sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0" role="group" aria-label="Filter by severity">
              <Chip active={!severity} onClick={() => setParam('severity', null)}>
                All <span className="text-faint">({total})</span>
              </Chip>
              {present.map((s) => {
                const Icon = SEVERITY_ICON[s]
                return (
                  <Chip key={s} active={severity === s} onClick={() => setParam('severity', severity === s ? null : s)} severity={s}>
                    <Icon className={`size-3.5 ${SEVERITY_STYLES[s].text}`} aria-hidden />
                    <span className="capitalize">{s}</span> <span className="text-faint">({counts[s]})</span>
                  </Chip>
                )
              })}
            </div>

            <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
              <Select
                label="Category"
                value={category}
                onChange={(v) => setParam('category', v || null)}
                options={[['', 'All categories'], ...categories.map((c) => [c, c] as [string, string])]}
              />
              <Select
                label="Sort by"
                value={sort}
                onChange={(v) => setParam('sort', v === 'severity' ? null : v)}
                options={Object.entries(SORT_LABELS).map(([k, v]) => [k, `Sort: ${v}`] as [string, string])}
              />
            </div>
          </div>

          <div className="mt-4 flex min-h-7 items-center justify-between text-xs text-muted">
            <span aria-live="polite">{filtered ? `Showing ${visible.length} of ${total}` : `${total} findings`}</span>
            {filtered && (
              <button type="button" onClick={clearFilters} className="btn-ghost text-xs">
                <X className="size-3.5" aria-hidden />
                Clear filters
              </button>
            )}
          </div>

          {/* List */}
          {visible.length === 0 ? (
            <div className="card mt-2">
              <EmptyState
                icon={SearchX}
                title="No findings match"
                action={
                  <button type="button" onClick={clearFilters} className="btn-secondary">
                    Clear filters
                  </button>
                }
              >
                Try a different search word or remove a filter.
              </EmptyState>
            </div>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {visible.map((f) => (
                <li key={f.id}>
                  <Link
                    to={`/scan/${scanId}/findings/${f.id}${listSearch}`}
                    className="group flex items-center gap-4 rounded-xl border border-line bg-surface px-4 py-3.5 transition-colors hover:border-accent/40 hover:bg-raised sm:px-5"
                  >
                    <SeverityIcon severity={f.severity} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <p className="font-medium leading-snug text-fg">{f.title}</p>
                        <span className="md:hidden">
                          <SeverityBadge severity={f.severity} />
                        </span>
                      </div>
                      <p className="mt-1 truncate font-mono text-xs text-accent/75">
                        {f.file}
                        <span className="text-faint md:hidden">:{f.line}</span>
                      </p>
                    </div>
                    <div className="hidden w-24 shrink-0 md:block">
                      <SeverityBadge severity={f.severity} />
                    </div>
                    <span className="hidden w-20 shrink-0 text-right font-mono text-xs text-muted tabular-nums md:block">
                      Line {f.line}
                    </span>
                    <ChevronRight
                      className="size-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

function RepoAvatar({ url }: { url?: string }) {
  const [failed, setFailed] = useState(false)
  const owner = url ? repoName(url).split('/')[0] : null
  if (!owner || failed)
    return (
      <span className="grid size-12 shrink-0 place-items-center rounded-full border border-line-strong bg-raised text-fg">
        <GitHubIcon className="size-6" />
      </span>
    )
  return (
    <img
      src={`https://github.com/${owner}.png?size=96`}
      alt=""
      onError={() => setFailed(true)}
      className="size-12 shrink-0 rounded-full border border-line-strong bg-raised object-cover"
    />
  )
}

function StatItem({ icon, value, label }: { icon: ReactNode; value: number; label: string }) {
  return (
    <li className="flex shrink-0 items-center gap-2.5 px-4 py-2.5">
      {icon}
      <div>
        <p className="font-mono text-base leading-tight font-medium tabular-nums">{value}</p>
        <p className="text-[11px] capitalize text-muted">{label}</p>
      </div>
    </li>
  )
}

function Chip({
  active,
  onClick,
  severity,
  children,
}: {
  active: boolean
  onClick: () => void
  severity?: Severity
  children: ReactNode
}) {
  const activeCls = severity
    ? `${SEVERITY_STYLES[severity].border} ${SEVERITY_STYLES[severity].bg} text-fg`
    : 'border-accent/50 bg-accent-soft text-fg'
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors ${
        active ? activeCls : 'border-line bg-surface text-muted hover:border-line-strong hover:text-fg'
      }`}
    >
      {children}
    </button>
  )
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: [string, string][]
}) {
  return (
    <label className="relative flex-1 sm:flex-none">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full cursor-pointer appearance-none rounded-lg border border-line bg-surface pr-8 pl-3 text-sm text-fg outline-none transition-colors hover:border-line-strong focus:border-accent/50"
      >
        {options.map(([v, text]) => (
          <option key={v} value={v} className="bg-surface">
            {text}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-faint" aria-hidden />
    </label>
  )
}

function FindingsSkeleton({ backLink }: { backLink: ReactNode }) {
  return (
    <div aria-busy="true" aria-label="Loading findings">
      {backLink}
      <div className="mt-6 flex items-center gap-4">
        <Skeleton className="size-12 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <div className="mt-8 flex gap-2">
        <Skeleton className="h-10 w-72 rounded-lg" />
        <Skeleton className="h-9 w-20 rounded-lg" />
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>
      <div className="mt-6 space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-4 rounded-xl border border-line bg-surface px-5 py-3.5">
            <Skeleton className="size-9 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
