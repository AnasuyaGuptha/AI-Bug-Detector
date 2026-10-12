import type { Scan } from '../types'

export const SCAN_STEPS = [
  { label: 'Cloning repository', detail: 'Fetching the default branch' },
  { label: 'Indexing files', detail: 'Finding source files and languages' },
  { label: 'Running static checks', detail: 'Looking for common bug patterns' },
  { label: 'AI code review', detail: 'Reading code for logic and security issues' },
  { label: 'Ranking findings', detail: 'Sorting by severity and writing fixes' },
] as const

/** Which step is running. Uses the backend value when present. */
export function currentStepIndex(scan: Scan): number {
  if (scan.status === 'completed') return SCAN_STEPS.length
  if (typeof scan.stepIndex === 'number') return scan.stepIndex
  return Math.min(SCAN_STEPS.length - 1, Math.floor(scan.progress / (100 / SCAN_STEPS.length)))
}
