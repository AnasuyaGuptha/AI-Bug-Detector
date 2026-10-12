import { Bug, FlaskConical } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { IS_MOCK } from '../api/client'
import GitHubIcon from './GitHubIcon'

const PROJECT_REPO = 'https://github.com/AnasuyaGuptha/AI-Bug-Detector'

const NAV = [
  { to: '/', label: 'Scanner', hash: '' },
  { to: '/#how', label: 'How it works', hash: '#how' },
  { to: '/#about', label: 'About', hash: '#about' },
]

export default function Layout() {
  const { pathname, hash } = useLocation()

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5 rounded-lg text-[15px] font-semibold tracking-tight">
            <span className="grid size-7 place-items-center rounded-lg border border-accent/20 bg-accent-soft text-accent">
              <Bug className="size-4" aria-hidden />
            </span>
            RepoBug <span className="-ml-1 font-medium text-accent">AI</span>
          </Link>

          <nav className="hidden items-center gap-1 sm:flex" aria-label="Main">
            {NAV.map((item) => {
              // "Scanner" is active on every scan page; anchors only when their hash is open.
              const active = item.hash ? pathname === '/' && hash === item.hash : pathname === '/' ? !hash : true
              return (
                <NavLink
                  key={item.label}
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  className={`rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                    active ? 'text-fg' : 'text-muted hover:text-fg'
                  }`}
                >
                  {item.label}
                </NavLink>
              )
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {IS_MOCK && (
              <span
                className="hidden items-center gap-1.5 rounded-full border border-dashed border-line-strong px-2.5 py-1 text-xs text-muted sm:inline-flex"
                title="Showing demo data. Set VITE_USE_MOCK=false to use the backend."
              >
                <FlaskConical className="size-3.5" aria-hidden />
                Sample mode
              </span>
            )}
            <a
              href={PROJECT_REPO}
              target="_blank"
              rel="noreferrer"
              className="btn-ghost size-9 p-0"
              aria-label="RepoBug AI on GitHub (opens in a new tab)"
              title="RepoBug AI on GitHub"
            >
              <GitHubIcon className="size-[18px]" />
            </a>
          </div>
        </div>
      </header>

      {IS_MOCK && (
        <div className="border-b border-line bg-surface/60 sm:hidden">
          <p className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2 text-xs text-muted">
            <FlaskConical className="size-3.5 shrink-0" aria-hidden />
            Sample mode: results are demo data, not a real analysis.
          </p>
        </div>
      )}

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <Outlet />
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-6 text-xs text-faint sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>RepoBug AI · Built for open-source contributors, students, and developers.</span>
          <span>{IS_MOCK ? 'Sample mode · findings are demo data' : 'Connected to backend'}</span>
        </div>
      </footer>
    </div>
  )
}
