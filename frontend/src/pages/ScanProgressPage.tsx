import { ArrowRight, Bug, Check, Info, Loader2, RotateCcw, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getScan } from '../api/client'
import GitHubIcon from '../components/GitHubIcon'
import SampleBadge from '../components/SampleBadge'
import { ErrorState, Skeleton } from '../components/States'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { formatDuration, repoName } from '../lib/repo'
import { SCAN_STEPS, currentStepIndex } from '../lib/scanSteps'
import type { Scan } from '../types'

const POLL_MS = 1000
const REDIRECT_MS = 1200

type StepState = 'done' | 'active' | 'failed' | 'pending'

export default function ScanProgressPage() {
  const { scanId = '' } = useParams()
  const navigate = useNavigate()
  const [scan, setScan] = useState<Scan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  useDocumentTitle(
    !scan
      ? 'Scanning'
      : scan.status === 'completed'
        ? 'Scan complete'
        : scan.status === 'failed'
          ? 'Scan failed'
          : `Scanning ${scan.progress}%`,
  )

  useEffect(() => {
    let stopped = false
    let timer: number | undefined

    async function poll() {
      try {
        const next = await getScan(scanId)
        if (stopped) return
        setError(null)
        setScan(next)
        if (next.status === 'completed') {
          timer = window.setTimeout(() => navigate(`/scan/${scanId}/findings`, { replace: true }), REDIRECT_MS)
        } else if (next.status !== 'failed') {
          timer = window.setTimeout(poll, POLL_MS)
        }
      } catch (err) {
        if (!stopped) setError((err as Error).message)
      }
    }

    poll()
    return () => {
      stopped = true
      window.clearTimeout(timer)
    }
  }, [scanId, navigate, attempt])

  // Tick the elapsed timer while the scan runs.
  const running = !!scan && scan.status !== 'completed' && scan.status !== 'failed'
  useEffect(() => {
    if (!running) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [running])

  const retry = useCallback(() => {
    setError(null)
    setAttempt((a) => a + 1)
  }, [])

  if (error && !scan) {
    return (
      <div className="card mx-auto mt-6 max-w-xl">
        <ErrorState
          message={error}
          onRetry={retry}
          extra={
            <Link to="/" className="btn-ghost">
              Back to scanner
            </Link>
          }
        />
      </div>
    )
  }

  if (!scan) return <ProgressSkeleton />

  const failed = scan.status === 'failed'
  const done = scan.status === 'completed'
  const stepIdx = currentStepIndex(scan)
  const end = scan.finishedAt ? Date.parse(scan.finishedAt) : now
  const elapsed = formatDuration(end - Date.parse(scan.startedAt))

  return (
    <div className="mx-auto max-w-lg animate-fade-in pt-2 sm:pt-6">
      {/* Ring + title */}
      <div className="flex flex-col items-center text-center">
        <ProgressRing progress={scan.progress} failed={failed} done={done} />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">
          {done ? 'Scan complete' : failed ? 'Scan failed' : 'Scanning repository'}
        </h1>
        <p className="mt-2 text-sm text-muted" aria-live="polite">
          {done
            ? 'Opening your findings…'
            : failed
              ? (scan.error ?? 'Something went wrong while scanning.')
              : 'Analyzing the code to find potential bugs…'}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 font-mono text-xs text-muted">
            <GitHubIcon className="size-3.5 shrink-0" />
            <span className="truncate">{repoName(scan.repoUrl)}</span>
          </span>
          <SampleBadge label="Sample scan" />
        </div>
      </div>

      {/* Timeline */}
      <ol className="mx-auto mt-10 max-w-sm" aria-label="Scan steps">
        {SCAN_STEPS.map((step, i) => {
          const state: StepState = i < stepIdx ? 'done' : i === stepIdx ? (failed ? 'failed' : 'active') : 'pending'
          const last = i === SCAN_STEPS.length - 1
          return (
            <li key={step.label} className="relative flex gap-4 pb-6 last:pb-0" aria-current={state === 'active' ? 'step' : undefined}>
              {!last && (
                <span
                  className={`absolute top-7 bottom-1 left-[11px] w-px ${i < stepIdx ? 'bg-accent/40' : 'bg-line-strong'}`}
                  aria-hidden
                />
              )}
              <StepIcon state={state} />
              <div className="min-w-0 pt-0.5">
                <p
                  className={`text-sm font-medium ${
                    state === 'active' ? 'text-accent' : state === 'failed' ? 'text-sev-critical' : state === 'done' ? 'text-fg' : 'text-muted'
                  }`}
                >
                  {step.label}
                </p>
                <p className={`mt-0.5 text-xs ${state === 'pending' ? 'text-faint' : 'text-muted'}`}>{step.detail}</p>
              </div>
            </li>
          )
        })}
      </ol>

      {/* Stats */}
      <dl className="mt-10 grid grid-cols-3 divide-x divide-line rounded-xl border border-line bg-surface text-center">
        <Stat label="Progress" value={`${scan.progress}%`} />
        <Stat label="Files" value={`${scan.filesScanned}/${scan.totalFiles}`} />
        <Stat label="Elapsed" value={elapsed} />
      </dl>

      {running && (
        <>
          <p className="mt-4 flex items-start gap-2.5 rounded-xl border border-accent/20 bg-accent-soft px-4 py-3 text-sm text-muted">
            <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            This may take a few moments depending on the repository size. You can leave this page.
          </p>
          <div className="mt-4 flex justify-center">
            <Link to="/" className="btn-ghost text-xs">
              <X className="size-3.5" aria-hidden />
              Cancel
            </Link>
          </div>
        </>
      )}

      {failed && (
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link to={`/?repo=${encodeURIComponent(scan.repoUrl)}`} className="btn-primary">
            <RotateCcw className="size-4" aria-hidden />
            Try again
          </Link>
          <Link to="/" className="btn-secondary">
            Scan another repo
          </Link>
        </div>
      )}

      {done && (
        <div className="mt-6 flex justify-center">
          <Link to={`/scan/${scanId}/findings`} className="btn-primary">
            View findings
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      )}

      {error && <p className="mt-4 text-center text-sm text-sev-high">Connection issue: {error}. Showing the last update.</p>}
    </div>
  )
}

function ProgressRing({ progress, failed, done }: { progress: number; failed: boolean; done: boolean }) {
  const r = 52
  const c = 2 * Math.PI * r
  const color = failed ? 'var(--color-sev-critical)' : 'var(--color-accent)'
  return (
    <div
      className="relative grid size-32 place-items-center"
      role="progressbar"
      aria-valuenow={progress}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Scan progress"
    >
      <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--color-line)" strokeWidth="3" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - progress / 100)}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <span
        className={`grid size-20 place-items-center rounded-full border ${
          failed ? 'border-sev-critical/25 bg-sev-critical/5 text-sev-critical' : 'border-accent/20 bg-accent-soft text-accent'
        }`}
      >
        {done ? <Check className="size-8" aria-hidden /> : <Bug className={`size-8 ${failed ? '' : 'animate-pulse'}`} aria-hidden />}
      </span>
    </div>
  )
}

function StepIcon({ state }: { state: StepState }) {
  const base = 'relative z-10 grid size-6 shrink-0 place-items-center rounded-full'
  if (state === 'done')
    return (
      <span className={`${base} bg-accent text-bg`}>
        <Check className="size-3.5" strokeWidth={3} aria-label="Done" />
      </span>
    )
  if (state === 'active')
    return (
      <span className={`${base} border border-accent bg-bg text-accent`}>
        <Loader2 className="size-3.5 animate-spin" aria-label="In progress" />
      </span>
    )
  if (state === 'failed')
    return (
      <span className={`${base} bg-sev-critical text-bg`}>
        <X className="size-3.5" strokeWidth={3} aria-label="Failed" />
      </span>
    )
  return <span className={`${base} border border-line-strong bg-bg`} aria-label="Pending" />
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-3">
      <dt className="text-xs text-faint">{label}</dt>
      <dd className="mt-1 font-mono text-sm tabular-nums">{value}</dd>
    </div>
  )
}

function ProgressSkeleton() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center pt-6" aria-busy="true" aria-label="Loading scan">
      <Skeleton className="size-32 rounded-full" />
      <Skeleton className="mt-6 h-7 w-56" />
      <Skeleton className="mt-3 h-4 w-72" />
      <div className="mt-10 w-full max-w-sm space-y-6">
        {SCAN_STEPS.map((s) => (
          <div key={s.label} className="flex gap-4">
            <Skeleton className="size-6 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
