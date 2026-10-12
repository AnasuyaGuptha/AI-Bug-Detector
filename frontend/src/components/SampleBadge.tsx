import { FlaskConical } from 'lucide-react'
import { IS_MOCK } from '../api/client'

/** Marks data as sample data. Renders nothing when connected to the real backend. */
export default function SampleBadge({ label = 'Sample data' }: { label?: string }) {
  if (!IS_MOCK) return null
  return (
    <span
      title="Demo data, not a real analysis"
      className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-line-strong px-2.5 py-0.5 text-xs text-muted"
    >
      <FlaskConical className="size-3" aria-hidden />
      {label}
    </span>
  )
}
