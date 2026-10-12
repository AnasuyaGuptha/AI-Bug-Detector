import { SEVERITY_STYLES } from '../severity'
import type { Severity } from '../types'

export default function SeverityBadge({ severity, size = 'sm' }: { severity: Severity; size?: 'sm' | 'md' }) {
  const s = SEVERITY_STYLES[severity]
  const pad = size === 'md' ? 'px-3 py-1 text-[13px]' : 'px-2.5 py-0.5 text-xs'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium capitalize ${pad} ${s.bg} ${s.text}`}>
      <span className={`size-1.5 rounded-full ${s.dot}`} aria-hidden />
      {severity}
    </span>
  )
}
