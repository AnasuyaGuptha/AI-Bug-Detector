import type { Scan } from '../types'

// These match the backend's real pipeline. The backend sets Scan.stepIndex to one of these indexes.
export const SCAN_STEPS = [
  { label: 'Fetching repository', detail: 'Reading the default branch from GitHub' },
  { label: 'Indexing files', detail: 'Picking and downloading the source files' },
  { label: 'AI code review', detail: 'Gemma 4 reads the code for logic and security issues' },
  { label: 'Checking findings', detail: 'Matching each finding to the real code and ranking by severity' },
] as const

/** Which step is running. Uses the backend value when present. */
export function currentStepIndex(scan: Scan): number {
  if (scan.status === 'completed') return SCAN_STEPS.length
  if (typeof scan.stepIndex === 'number') return scan.stepIndex
  return Math.min(SCAN_STEPS.length - 1, Math.floor(scan.progress / (100 / SCAN_STEPS.length)))
}
