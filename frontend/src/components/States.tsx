import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import type { ReactNode } from 'react'

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-raised ${className}`} aria-hidden />
}

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  children?: ReactNode
  action?: ReactNode
  tone?: 'default' | 'error'
}

export function EmptyState({ icon: Icon, title, children, action, tone = 'default' }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center animate-fade-in">
      <div
        className={`grid size-11 place-items-center rounded-xl border ${
          tone === 'error' ? 'border-sev-critical/25 bg-sev-critical/5 text-sev-critical' : 'border-line bg-raised text-muted'
        }`}
      >
        <Icon className="size-5" aria-hidden />
      </div>
      <h3 className="mt-4 text-[15px] font-medium">{title}</h3>
      {children && <p className="mt-1.5 max-w-sm text-sm leading-6 text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry, extra }: { message: string; onRetry?: () => void; extra?: ReactNode }) {
  return (
    <EmptyState
      icon={AlertTriangle}
      title="Something went wrong"
      tone="error"
      action={
        <div className="flex flex-wrap items-center justify-center gap-2">
          {onRetry && (
            <button type="button" onClick={onRetry} className="btn-secondary">
              <RotateCcw className="size-4" aria-hidden />
              Try again
            </button>
          )}
          {extra}
        </div>
      }
    >
      {message}
    </EmptyState>
  )
}
