import { ArrowRight, FileSearch, Link2, Loader2, Lock, ScanSearch, ShieldCheck, Sparkles, Wrench } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { IS_MOCK, startScan } from '../api/client'
import GitHubIcon from '../components/GitHubIcon'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { normalizeRepoUrl } from '../lib/repo'
import { SEVERITY_INFO, SEVERITY_ORDER, SEVERITY_STYLES } from '../severity'

const EXAMPLES = ['pallets/flask', 'expressjs/express', 'AnasuyaGuptha/AI-Bug-Detector']

const HOW_IT_WORKS = [
  { icon: Link2, title: 'Connect', text: 'Enter a public GitHub repository URL.' },
  { icon: ScanSearch, title: 'Analyze', text: 'We fetch the source code and look for likely bugs with AI.' },
  { icon: Wrench, title: 'Understand', text: 'Review the evidence, the root cause, the severity, and a suggested fix.' },
]

export default function ScannerPage() {
  useDocumentTitle()
  const navigate = useNavigate()
  const { hash } = useLocation()
  const [params] = useSearchParams()
  const [url, setUrl] = useState(params.get('repo') ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Header links point at #how and #about on this page.
  useEffect(() => {
    if (!hash) return
    document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hash])

  async function run(input: string) {
    const repoUrl = normalizeRepoUrl(input)
    if (!repoUrl) {
      setError('That does not look like a GitHub repository. Try owner/repo or https://github.com/owner/repo.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      const scan = await startScan(repoUrl)
      navigate(`/scan/${scan.id}`)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    run(url)
  }

  return (
    <div className="animate-fade-in">
      <section className="mx-auto flex max-w-2xl flex-col items-center pt-6 text-center sm:pt-14">
        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-muted">
          <Sparkles className="size-3.5 text-accent" aria-hidden />
          AI-powered code analysis
        </span>
        <h1 className="mt-6 text-[2.5rem] font-semibold leading-[1.08] tracking-[-0.025em] text-balance sm:text-6xl">
          Find the bugs
          <br /> <span className="text-accent">hiding in your code.</span>
        </h1>
        <p className="mt-5 max-w-lg text-[15px] leading-7 text-muted text-pretty sm:text-base">
          Scan a public GitHub repository to find likely bugs, understand the root cause, and get a fix you can apply.
        </p>

        <form onSubmit={onSubmit} className="mt-10 w-full" noValidate>
          <label htmlFor="repo" className="sr-only">
            GitHub repository
          </label>
          <div
            className={`flex flex-col gap-2 rounded-2xl border bg-surface p-2 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset,0_20px_40px_-24px_rgba(0,0,0,0.6)] transition-colors focus-within:border-accent/50 sm:flex-row ${
              error ? 'border-sev-critical/50' : 'border-line-strong'
            }`}
          >
            <div className="flex min-w-0 flex-1 items-center gap-3 px-3">
              <GitHubIcon className="size-5 shrink-0 text-muted" />
              <input
                id="repo"
                type="text"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                autoFocus={!hash}
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value)
                  if (error) setError(null)
                }}
                placeholder="https://github.com/owner/repository"
                aria-invalid={!!error}
                aria-describedby={error ? 'repo-error' : 'repo-hint'}
                className="min-w-0 flex-1 bg-transparent py-3 font-mono text-sm outline-none placeholder:text-faint"
              />
            </div>
            <button type="submit" disabled={busy} className="btn-primary h-11 px-5">
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Starting scan
                </>
              ) : (
                <>
                  Scan repository
                  <ArrowRight className="size-4" aria-hidden />
                </>
              )}
            </button>
          </div>
          {error ? (
            <p id="repo-error" role="alert" className="mt-3 text-left text-sm text-sev-critical">
              {error}
            </p>
          ) : (
            <p id="repo-hint" className="mt-3 inline-flex items-center gap-1.5 text-xs text-faint">
              <Lock className="size-3.5" aria-hidden />
              Supports public GitHub repositories only.
            </p>
          )}
        </form>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-faint">
          <span>Try</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              disabled={busy}
              onClick={() => {
                setUrl(ex)
                run(ex)
              }}
              className="rounded-md border border-line bg-surface px-2 py-1 font-mono text-muted transition-colors hover:border-line-strong hover:text-fg"
            >
              {ex}
            </button>
          ))}
        </div>

        {IS_MOCK && <p className="mt-5 text-xs text-faint">Sample mode is on. Any repo returns the same demo findings.</p>}
      </section>

      <section id="how" className="mx-auto mt-20 max-w-4xl scroll-mt-24 sm:mt-28" aria-labelledby="how-title">
        <h2 id="how-title" className="eyebrow text-center">
          How it works
        </h2>
        <ol className="mt-6 grid gap-6 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-line">
          {HOW_IT_WORKS.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="flex gap-4 sm:px-6 sm:first:pl-0 sm:last:pr-0">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line-strong bg-surface text-accent">
                <Icon className="size-[18px]" aria-hidden />
              </span>
              <div>
                <h3 className="text-[15px] font-medium">
                  <span className="text-faint">{i + 1}.</span> {title}
                </h3>
                <p className="mt-1 text-sm leading-6 text-muted">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section id="about" className="mx-auto mt-16 max-w-4xl scroll-mt-24" aria-labelledby="about-title">
        <h2 id="about-title" className="eyebrow text-center">
          About
        </h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-[1.4fr_1fr]">
          <div className="card p-5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileSearch className="size-4 text-accent" aria-hidden />
              Severity levels
            </div>
            <ul className="mt-4 space-y-2.5">
              {SEVERITY_ORDER.map((s) => (
                <li key={s} className="flex items-baseline gap-3 text-sm">
                  <span className={`inline-flex w-20 shrink-0 items-center gap-2 capitalize ${SEVERITY_STYLES[s].text}`}>
                    <span className={`size-2 shrink-0 rounded-full ${SEVERITY_STYLES[s].dot}`} aria-hidden />
                    {s}
                  </span>
                  <span className="text-muted">{SEVERITY_INFO[s]}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="card flex flex-col gap-4 p-5 text-sm leading-6 text-muted">
            <p>
              RepoBug AI is a hackathon project that helps open-source contributors, students, and developers find and
              understand bugs faster.
            </p>
            <p className="flex items-start gap-3">
              <ShieldCheck className="mt-1 size-4 shrink-0 text-accent" aria-hidden />
              Fixes are suggestions. Nothing changes in your repository until you apply them.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
