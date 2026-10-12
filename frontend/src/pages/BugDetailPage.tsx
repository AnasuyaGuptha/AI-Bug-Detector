import { ArrowLeft, ChevronLeft, ChevronRight, CircleAlert, FileCode2, FileQuestion, Lightbulb, Wrench } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ApiError, getFinding, getFindings } from '../api/client'
import CodeBlock, { type LineMark } from '../components/CodeBlock'
import CopyButton from '../components/CopyButton'
import SampleBadge from '../components/SampleBadge'
import SeverityBadge from '../components/SeverityBadge'
import SeverityIcon from '../components/SeverityIcon'
import { EmptyState, ErrorState, Skeleton } from '../components/States'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { diffLines, languageFor, languageLabel } from '../lib/code'
import { applyFilters, readFilters } from '../lib/findings'
import { SEVERITY_INFO, SEVERITY_STYLES, confidenceLevel } from '../severity'
import type { Finding } from '../types'

type FixView = 'diff' | 'fixed'

export default function BugDetailPage() {
  const { scanId = '', findingId = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [finding, setFinding] = useState<Finding | null>(null)
  const [all, setAll] = useState<Finding[] | null>(null)
  const [error, setError] = useState<{ message: string; notFound: boolean } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [view, setView] = useState<FixView>('diff')

  useDocumentTitle(finding?.title)

  const listSearch = params.toString() ? `?${params.toString()}` : ''
  const listUrl = `/scan/${scanId}/findings${listSearch}`

  useEffect(() => {
    let stopped = false
    setFinding(null)
    setError(null)
    getFinding(scanId, findingId).then(
      (f) => !stopped && setFinding(f),
      (err: Error) =>
        !stopped && setError({ message: err.message, notFound: err instanceof ApiError && err.status === 404 }),
    )
    window.scrollTo({ top: 0 })
    return () => {
      stopped = true
    }
  }, [scanId, findingId, attempt])

  // The full list powers previous/next. It follows the same filters as the dashboard.
  useEffect(() => {
    let stopped = false
    getFindings(scanId).then((f) => !stopped && setAll(f), () => {})
    return () => {
      stopped = true
    }
  }, [scanId])

  const ordered = useMemo(() => (all ? applyFilters(all, readFilters(params)) : []), [all, params])
  const index = ordered.findIndex((f) => f.id === findingId)
  const prev = index > 0 ? ordered[index - 1] : null
  const next = index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : null

  // Keyboard: ← / → (or k / j) to move between findings.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || e.metaKey || e.ctrlKey || e.altKey) return
      const go = (f: Finding | null) => f && navigate(`/scan/${scanId}/findings/${f.id}${listSearch}`)
      if (e.key === 'ArrowLeft' || e.key === 'k') go(prev)
      if (e.key === 'ArrowRight' || e.key === 'j') go(next)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prev, next, navigate, scanId, listSearch])

  const topBar = (
    <div className="flex items-center justify-between gap-3">
      <Link to={listUrl} className="btn-ghost -ml-2.5">
        <ArrowLeft className="size-4" aria-hidden />
        All findings
      </Link>
      {index >= 0 && (
        <nav className="flex items-center gap-1" aria-label="Finding navigation">
          <NavButton to={prev && `/scan/${scanId}/findings/${prev.id}${listSearch}`} label="Previous finding">
            <ChevronLeft className="size-4" />
          </NavButton>
          <span className="min-w-14 text-center font-mono text-xs text-muted tabular-nums">
            {index + 1} / {ordered.length}
          </span>
          <NavButton to={next && `/scan/${scanId}/findings/${next.id}${listSearch}`} label="Next finding">
            <ChevronRight className="size-4" />
          </NavButton>
        </nav>
      )}
    </div>
  )

  if (error) {
    return (
      <div>
        {topBar}
        <div className="card mx-auto mt-8 max-w-xl">
          {error.notFound ? (
            <EmptyState
              icon={FileQuestion}
              title="Finding not found"
              action={
                <Link to={listUrl} className="btn-secondary">
                  Back to findings
                </Link>
              }
            >
              It may have been removed, or the link is wrong.
            </EmptyState>
          ) : (
            <ErrorState message={error.message} onRetry={() => setAttempt((a) => a + 1)} />
          )}
        </div>
      </div>
    )
  }

  if (!finding) return <DetailSkeleton topBar={topBar} />

  const language = languageFor(finding.file, finding.language)
  const ops = diffLines(finding.evidence, finding.suggestedFix, finding.evidenceStartLine)
  const evidenceLines = finding.evidence.split('\n')
  const hitIndex = finding.line - finding.evidenceStartLine
  const evidenceMarks: LineMark[] = evidenceLines.map((_, i) => (i === hitIndex ? 'hit' : undefined))
  const addedNew = new Set(ops.filter((o) => o.kind === 'add').map((o) => o.newNo))
  const fixedLines = finding.suggestedFix.split('\n')
  const fixedMarks: LineMark[] = fixedLines.map((_, i) => (addedNew.has(finding.evidenceStartLine + i) ? 'add' : undefined))
  const added = ops.filter((o) => o.kind === 'add').length
  const removed = ops.filter((o) => o.kind === 'del').length

  return (
    <article className="animate-fade-in" key={finding.id}>
      {topBar}

      <header className="card mt-6 flex items-start gap-4 p-5 sm:p-6">
        <SeverityIcon severity={finding.severity} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">{finding.title}</h1>
            <SeverityBadge severity={finding.severity} size="md" />
          </div>
          <p className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-mono text-sm text-muted">
            <FileCode2 className="size-4 shrink-0 text-faint" aria-hidden />
            <span className="min-w-0 break-all">{finding.file}</span>
            <span className="text-faint" aria-hidden>
              ·
            </span>
            <span>Line {finding.line}</span>
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-line px-2.5 py-0.5 text-xs text-muted">{finding.category}</span>
            <SampleBadge label="Sample finding" />
          </div>
        </div>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        {/* Left: plain-English explanation and details */}
        <div className="flex min-w-0 flex-col gap-4">
          <section className="card divide-y divide-line" aria-label="Explanation">
            <Explain icon={CircleAlert} title="What's wrong" iconClass={SEVERITY_STYLES[finding.severity].text}>
              {finding.summary}
            </Explain>
            <Explain icon={Lightbulb} title="Why it matters" iconClass="text-accent">
              {finding.explanation}
            </Explain>
            {finding.fixExplanation && (
              <Explain icon={Wrench} title="How to fix it" iconClass="text-sev-low">
                {finding.fixExplanation}
              </Explain>
            )}
          </section>

          {typeof finding.confidence === 'number' && <Confidence value={finding.confidence} />}

          <section className="card p-5" aria-label="Details">
            <h2 className="eyebrow">Details</h2>
            <dl className="mt-4 space-y-4 text-sm">
              <Detail label="Severity">
                <span className={`capitalize ${SEVERITY_STYLES[finding.severity].text}`}>{finding.severity}</span>
                <p className="mt-1 text-xs leading-5 text-muted">{SEVERITY_INFO[finding.severity]}</p>
              </Detail>
              <Detail label="Category">{finding.category}</Detail>
              <Detail label="Language">{languageLabel(language)}</Detail>
            </dl>
            {index >= 0 && (
              <p className="mt-5 hidden items-center justify-between border-t border-line pt-4 text-xs text-muted lg:flex">
                <span>Previous / next finding</span>
                <span className="flex gap-1">
                  <kbd>←</kbd>
                  <kbd>→</kbd>
                </span>
              </p>
            )}
          </section>
        </div>

        {/* Right: code */}
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-label="Code evidence">
            <CodeBlock
              code={finding.evidence}
              language={language}
              startLine={finding.evidenceStartLine}
              marks={evidenceMarks}
              severity={finding.severity}
              header={
                <>
                  <span className="flex min-w-0 items-center gap-2">
                    <FileCode2 className="size-4 shrink-0 text-accent" aria-hidden />
                    <span className="text-sm font-medium text-fg">Code evidence</span>
                    <span className="hidden truncate text-faint sm:inline">· line {finding.line} highlighted</span>
                  </span>
                  <CopyButton text={finding.evidence} />
                </>
              }
            />
          </section>

          <section aria-label="Suggested fix">
            {view === 'diff' ? (
              <CodeBlock
                code={ops.map((o) => o.text).join('\n')}
                language={language}
                numbers={ops.map((o) => o.newNo ?? o.oldNo ?? null)}
                marks={ops.map((o) => (o.kind === 'same' ? undefined : o.kind))}
                header={<FixHeader view={view} setView={setView} copyText={finding.suggestedFix} added={added} removed={removed} />}
              />
            ) : (
              <CodeBlock
                code={finding.suggestedFix}
                language={language}
                startLine={finding.evidenceStartLine}
                marks={fixedMarks}
                showSigns={false}
                header={<FixHeader view={view} setView={setView} copyText={finding.suggestedFix} added={added} removed={removed} />}
              />
            )}
            <p className="mt-3 text-xs leading-5 text-faint">
              AI suggestions can be wrong. Read the change and run your tests before you apply it.
            </p>
          </section>
        </div>
      </div>
    </article>
  )
}

function FixHeader({
  view,
  setView,
  copyText,
  added,
  removed,
}: {
  view: FixView
  setView: (v: FixView) => void
  copyText: string
  added: number
  removed: number
}) {
  const tab = (v: FixView, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={view === v}
      onClick={() => setView(v)}
      className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
        view === v ? 'bg-raised text-fg shadow-[inset_0_0_0_1px_var(--color-line-strong)]' : 'text-muted hover:text-fg'
      }`}
    >
      {label}
    </button>
  )
  return (
    <>
      <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="flex items-center gap-2">
          <Wrench className="size-4 shrink-0 text-sev-low" aria-hidden />
          <span className="text-sm font-medium text-fg">Suggested fix</span>
        </span>
        <span role="tablist" aria-label="Fix view" className="flex gap-1">
          {tab('diff', 'Changes')}
          {tab('fixed', 'Fixed code')}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="hidden font-mono sm:inline" aria-label={`${added} lines added, ${removed} removed`}>
          <span className="text-add">+{added}</span> <span className="text-del">−{removed}</span>
        </span>
        <CopyButton text={copyText} label="Copy fix" />
      </span>
    </>
  )
}

function Confidence({ value }: { value: number }) {
  const level = confidenceLevel(value)
  const pct = Math.round(value * 100)
  return (
    <section className="card p-5" aria-label="AI confidence">
      <h2 className="eyebrow">AI confidence</h2>
      <div className="mt-3 flex items-center gap-3">
        <span className="flex h-5 items-end gap-0.5" aria-hidden>
          {[1, 2, 3, 4].map((b) => (
            <span
              key={b}
              className={`w-1 rounded-sm ${b <= level.bars ? 'bg-accent' : 'bg-line-strong'}`}
              style={{ height: `${b * 25}%` }}
            />
          ))}
        </span>
        <span className="rounded-full border border-accent/30 bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent">
          {level.label}
        </span>
        <span className="ml-auto font-mono text-xs text-muted tabular-nums">{pct}%</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted">{level.text}</p>
    </section>
  )
}

function Explain({
  icon: Icon,
  title,
  iconClass,
  children,
}: {
  icon: typeof Lightbulb
  title: string
  iconClass: string
  children: ReactNode
}) {
  return (
    <div className="flex gap-3.5 p-5">
      <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-raised ${iconClass}`}>
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-muted">{children}</p>
      </div>
    </div>
  )
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-faint">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  )
}

function NavButton({ to, label, children }: { to: string | null; label: string; children: ReactNode }) {
  if (!to)
    return (
      <button type="button" disabled className="btn-ghost size-8 p-0" aria-label={label}>
        {children}
      </button>
    )
  return (
    <Link to={to} className="btn-ghost size-8 p-0" aria-label={label} title={label}>
      {children}
    </Link>
  )
}

function DetailSkeleton({ topBar }: { topBar: ReactNode }) {
  return (
    <div aria-busy="true" aria-label="Loading finding">
      {topBar}
      <div className="mt-6 flex gap-2">
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
      <Skeleton className="mt-4 h-8 w-2/3" />
      <Skeleton className="mt-3 h-4 w-60" />
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8">
        <div className="space-y-6">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    </div>
  )
}
