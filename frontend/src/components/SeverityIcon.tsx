import { SEVERITY_ICON, SEVERITY_STYLES } from '../severity'
import type { Severity } from '../types'

const SIZES = {
  sm: { box: 'size-7 rounded-md', icon: 'size-3.5' },
  md: { box: 'size-9 rounded-lg', icon: 'size-[18px]' },
  lg: { box: 'size-12 rounded-xl', icon: 'size-6' },
}

/** Tinted square with the severity icon. Decorative: pair it with a text label. */
export default function SeverityIcon({ severity, size = 'md' }: { severity: Severity; size?: keyof typeof SIZES }) {
  const Icon = SEVERITY_ICON[severity]
  const s = SEVERITY_STYLES[severity]
  return (
    <span className={`grid shrink-0 place-items-center border ${SIZES[size].box} ${s.bg} ${s.border} ${s.text}`} aria-hidden>
      <Icon className={SIZES[size].icon} />
    </span>
  )
}
