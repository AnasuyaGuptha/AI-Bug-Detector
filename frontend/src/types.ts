// Shared data shapes. This is the contract between the frontend and the backend.

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'

export type ScanStatus = 'queued' | 'cloning' | 'analyzing' | 'completed' | 'failed'

export interface Scan {
  id: string
  repoUrl: string
  status: ScanStatus
  /** 0 to 100 */
  progress: number
  /** Human-readable label for the step that is running now. */
  currentStep: string
  /** Index into SCAN_STEPS (src/lib/scanSteps.ts). Optional: derived from progress when missing. */
  stepIndex?: number
  filesScanned: number
  totalFiles: number
  /** ISO 8601 timestamp. */
  startedAt: string
  /** ISO 8601 timestamp, set when the scan ends. */
  finishedAt?: string
  /** Set when status is "failed". */
  error?: string
}

export interface Finding {
  id: string
  title: string
  severity: Severity
  category: string
  file: string
  /** Line the bug is on, in file numbering. */
  line: number
  /** Plain-English "what is wrong". One or two sentences. */
  summary: string
  /** Plain-English "why it matters". */
  explanation: string
  /** Plain-English "how the fix works". Optional. */
  fixExplanation?: string
  /** Code snippet around the bug. */
  evidence: string
  /** First line number of the evidence snippet. */
  evidenceStartLine: number
  /** The evidence snippet rewritten with the fix applied. */
  suggestedFix: string
  /** Prism language id, e.g. "python" or "tsx". Guessed from the file name when missing. */
  language?: string
  /** Model confidence from 0 to 1. Optional. */
  confidence?: number
}
