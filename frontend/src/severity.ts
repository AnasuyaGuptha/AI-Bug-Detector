import { CircleAlert, CircleDot, Info, OctagonAlert, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { Severity } from './types'

export const SEVERITY_ICON: Record<Severity, LucideIcon> = {
  critical: OctagonAlert,
  high: TriangleAlert,
  medium: CircleAlert,
  low: CircleDot,
  info: Info,
}

/** Confidence in words, for beginners. */
export function confidenceLevel(c: number): { label: 'High' | 'Medium' | 'Low'; bars: number; text: string } {
  if (c >= 0.85) return { label: 'High', bars: 4, text: 'Strong signal. This is very likely a real issue.' }
  if (c >= 0.6) return { label: 'Medium', bars: 3, text: 'Likely a real issue. Check the code to confirm.' }
  return { label: 'Low', bars: 1, text: 'Possible issue. Review it carefully before changing anything.' }
}

export const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info']

// Full class names so Tailwind can find them at build time.
export const SEVERITY_STYLES: Record<Severity, { text: string; bg: string; dot: string; border: string }> = {
  critical: { text: 'text-sev-critical', bg: 'bg-sev-critical/10', dot: 'bg-sev-critical', border: 'border-sev-critical/40' },
  high: { text: 'text-sev-high', bg: 'bg-sev-high/10', dot: 'bg-sev-high', border: 'border-sev-high/40' },
  medium: { text: 'text-sev-medium', bg: 'bg-sev-medium/10', dot: 'bg-sev-medium', border: 'border-sev-medium/40' },
  low: { text: 'text-sev-low', bg: 'bg-sev-low/10', dot: 'bg-sev-low', border: 'border-sev-low/40' },
  info: { text: 'text-sev-info', bg: 'bg-sev-info/10', dot: 'bg-sev-info', border: 'border-sev-info/40' },
}

/** Short, beginner-friendly meaning of each level. */
export const SEVERITY_INFO: Record<Severity, string> = {
  critical: 'Can be exploited or can lose data. Fix before you ship.',
  high: 'Likely to break things in normal use. Fix soon.',
  medium: 'Wrong behaviour in some cases. Worth fixing.',
  low: 'Small issue or code smell. Fix when convenient.',
  info: 'A suggestion. Nothing is broken.',
}

/** CSS colour for a severity, for inline styles. */
export const severityVar = (s: Severity) => `var(--color-sev-${s})`
