// Sample data for demo mode. None of this comes from a real analysis.
import { SCAN_STEPS } from '../lib/scanSteps'
import type { Finding, Scan } from '../types'

type MockScan = { repoUrl: string; startedAt: number }

const STORAGE_KEY = 'repobug.mockScans'
// A mock scan takes this long to finish.
const DURATION_MS = 9000
// Repo URLs containing this word fail at 40%, so the error state can be demoed.
const FAIL_WORD = 'fail'

function load(): Record<string, MockScan> {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function save(scans: Record<string, MockScan>) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(scans))
  } catch {
    // Storage blocked: scans still work until reload.
  }
}

const scans = load()

export function mockStartScan(repoUrl: string): Scan {
  const id = Math.random().toString(36).slice(2, 10)
  scans[id] = { repoUrl, startedAt: Date.now() }
  save(scans)
  return mockGetScan(id)
}

export function mockGetScan(id: string): Scan {
  // Unknown ids (e.g. a shared link) count as finished scans.
  const entry = scans[id] ?? {
    repoUrl: 'https://github.com/sample/demo-app',
    startedAt: Date.now() - DURATION_MS - 60_000,
  }
  const elapsed = Date.now() - entry.startedAt
  const totalFiles = 148
  const willFail = entry.repoUrl.toLowerCase().includes(FAIL_WORD)
  const raw = Math.min(100, Math.round((elapsed / DURATION_MS) * 100))
  const progress = willFail ? Math.min(raw, 40) : raw
  const stepIndex = Math.min(SCAN_STEPS.length - 1, Math.floor(progress / (100 / SCAN_STEPS.length)))
  const base = {
    id,
    repoUrl: entry.repoUrl,
    progress,
    stepIndex,
    filesScanned: Math.round((Math.min(progress, 60) / 60) * totalFiles),
    totalFiles,
    startedAt: new Date(entry.startedAt).toISOString(),
  }

  if (willFail && raw >= 40) {
    return {
      ...base,
      status: 'failed',
      currentStep: SCAN_STEPS[stepIndex].label,
      finishedAt: new Date(entry.startedAt + DURATION_MS * 0.4).toISOString(),
      error: 'The repository could not be analysed. It may be private, empty, or too large.',
    }
  }
  if (progress >= 100) {
    return {
      ...base,
      status: 'completed',
      stepIndex: SCAN_STEPS.length,
      currentStep: 'Scan complete',
      finishedAt: new Date(entry.startedAt + DURATION_MS).toISOString(),
    }
  }
  return {
    ...base,
    status: progress < 20 ? 'cloning' : 'analyzing',
    currentStep: SCAN_STEPS[stepIndex].label,
  }
}

const lines = (...l: string[]) => l.join('\n')

export const mockFindings: Finding[] = [
  {
    id: 'f1',
    title: 'SQL query built from user input',
    severity: 'critical',
    category: 'Security',
    file: 'server/routes/users.py',
    line: 42,
    confidence: 0.96,
    summary:
      'The name from the request is pasted straight into a SQL string. Anyone can change what the query does by sending special text.',
    explanation:
      'This is called SQL injection. An attacker can send a name like  \' OR 1=1 --  to read every user, or worse, delete tables. It is one of the most common ways real apps get hacked.',
    fixExplanation:
      'Use a parameterized query. You write a placeholder (%s) in the SQL and pass the value separately. The database driver then treats the value as plain data, never as SQL.',
    evidenceStartLine: 40,
    evidence: lines(
      'def get_user(request):',
      '    name = request.args.get("name")',
      `    query = f"SELECT * FROM users WHERE name = '{name}'"`,
      '    return db.execute(query).fetchone()',
    ),
    suggestedFix: lines(
      'def get_user(request):',
      '    name = request.args.get("name")',
      '    query = "SELECT * FROM users WHERE name = %s"',
      '    return db.execute(query, (name,)).fetchone()',
    ),
  },
  {
    id: 'f2',
    title: 'Secret API key committed to source',
    severity: 'critical',
    category: 'Security',
    file: 'server/config.py',
    line: 8,
    confidence: 0.93,
    summary: 'A payment API key is written directly in the code, so anyone who can see the repo can use it.',
    explanation:
      'Keys in source code end up in git history, forks, and logs. Bots scan GitHub for keys within minutes. A leaked payment key can cost real money.',
    fixExplanation:
      'Read the key from an environment variable instead, and rotate the old key in the provider dashboard because it is already exposed.',
    evidenceStartLine: 6,
    evidence: lines(
      'import os',
      '',
      'PAYMENTS_KEY = "pay_live_EXAMPLE_NOT_A_REAL_KEY"',
      'DEBUG = os.getenv("DEBUG") == "1"',
    ),
    suggestedFix: lines(
      'import os',
      '',
      'PAYMENTS_KEY = os.environ["PAYMENTS_KEY"]',
      'DEBUG = os.getenv("DEBUG") == "1"',
    ),
  },
  {
    id: 'f3',
    title: 'Unhandled promise rejection',
    severity: 'high',
    category: 'Reliability',
    file: 'web/src/api/profile.ts',
    line: 18,
    confidence: 0.88,
    summary: 'If the network request fails, the error is never caught and the page spins forever.',
    explanation:
      'With async/await, a failed fetch throws an error. Nothing here catches it, so setLoading(false) never runs and the user is stuck on a loading spinner.',
    fixExplanation:
      'Wrap the request in try/catch/finally. Check res.ok, store the error so the UI can show it, and always turn loading off in finally.',
    evidenceStartLine: 16,
    evidence: lines(
      'export async function loadProfile(id: string) {',
      '  setLoading(true)',
      '  const res = await fetch(`/api/profile/${id}`)',
      '  setProfile(await res.json())',
      '  setLoading(false)',
      '}',
    ),
    suggestedFix: lines(
      'export async function loadProfile(id: string) {',
      '  setLoading(true)',
      '  try {',
      '    const res = await fetch(`/api/profile/${id}`)',
      '    if (!res.ok) throw new Error(`HTTP ${res.status}`)',
      '    setProfile(await res.json())',
      '  } catch (err) {',
      '    setError(err as Error)',
      '  } finally {',
      '    setLoading(false)',
      '  }',
      '}',
    ),
  },
  {
    id: 'f4',
    title: 'File handle is never closed',
    severity: 'high',
    category: 'Reliability',
    file: 'server/services/export.py',
    line: 15,
    confidence: 0.84,
    summary: 'The CSV file is opened but not closed if writing fails.',
    explanation:
      'Every open file uses a system resource. If an exception happens before close(), the file stays open. Under load the server can run out of file handles and crash.',
    fixExplanation:
      'Use a "with" block. Python closes the file automatically when the block ends, even if an error happens inside it.',
    evidenceStartLine: 14,
    evidence: lines(
      'def export_rows(rows, path):',
      '    f = open(path, "w")',
      '    for row in rows:',
      '        f.write(",".join(row) + "\\n")',
      '    f.close()',
    ),
    suggestedFix: lines(
      'def export_rows(rows, path):',
      '    with open(path, "w") as f:',
      '        for row in rows:',
      '            f.write(",".join(row) + "\\n")',
    ),
  },
  {
    id: 'f5',
    title: 'Off-by-one error in pagination',
    severity: 'medium',
    category: 'Logic',
    file: 'server/utils/paging.py',
    line: 9,
    confidence: 0.91,
    summary: 'The last item of every page is skipped.',
    explanation:
      'Python slices already stop before the end index. Subtracting 1 again drops one more item, so users never see some records.',
    fixExplanation: 'Remove the "- 1". The slice items[start:start + size] returns exactly size items.',
    evidenceStartLine: 7,
    evidence: lines(
      'def page(items, n, size):',
      '    start = n * size',
      '    return items[start:start + size - 1]',
    ),
    suggestedFix: lines(
      'def page(items, n, size):',
      '    start = n * size',
      '    return items[start:start + size]',
    ),
  },
  {
    id: 'f6',
    title: 'Missing dependency in useEffect',
    severity: 'medium',
    category: 'Logic',
    file: 'web/src/pages/Dashboard.tsx',
    line: 23,
    confidence: 0.79,
    summary: 'The effect uses teamId but does not list it, so data does not reload when the team changes.',
    explanation:
      'React only re-runs an effect when a value in its dependency list changes. With an empty list, it runs once. Switching teams keeps showing the old team’s data.',
    fixExplanation: 'Add teamId to the dependency array so the effect runs again whenever it changes.',
    evidenceStartLine: 21,
    evidence: lines(
      'useEffect(() => {',
      '  fetchStats(teamId).then(setStats)',
      '}, [])',
    ),
    suggestedFix: lines(
      'useEffect(() => {',
      '  fetchStats(teamId).then(setStats)',
      '}, [teamId])',
    ),
  },
  {
    id: 'f7',
    title: 'Loose equality compares different types',
    severity: 'medium',
    category: 'Logic',
    file: 'web/src/utils/auth.js',
    line: 4,
    confidence: 0.72,
    summary: 'Using == lets "0" equal 0, so a string role can pass a number check.',
    explanation:
      'In JavaScript, == converts types before comparing. That can make different values look equal and lead to surprising access checks.',
    fixExplanation: 'Use === which compares both value and type, so "0" and 0 are different.',
    evidenceStartLine: 3,
    evidence: lines('export function isAdmin(user) {', '  return user.role == 0', '}'),
    suggestedFix: lines('export function isAdmin(user) {', '  return user.role === 0', '}'),
  },
  {
    id: 'f8',
    title: 'Query runs inside a loop',
    severity: 'low',
    category: 'Performance',
    file: 'server/routes/orders.py',
    line: 31,
    confidence: 0.81,
    summary: 'One database query runs for every order, which gets slow as orders grow.',
    explanation:
      'This is the "N+1 query" problem. 500 orders means 501 round trips to the database. It works in testing but slows down in production.',
    fixExplanation: 'Load all customers in one query, then look them up from a dictionary inside the loop.',
    evidenceStartLine: 30,
    evidence: lines(
      'for order in orders:',
      '    order.customer = Customer.get(order.customer_id)',
    ),
    suggestedFix: lines(
      'ids = {o.customer_id for o in orders}',
      'customers = {c.id: c for c in Customer.where_in(ids)}',
      'for order in orders:',
      '    order.customer = customers[order.customer_id]',
    ),
  },
  {
    id: 'f9',
    title: 'Unused import',
    severity: 'low',
    category: 'Code quality',
    file: 'web/src/pages/Home.tsx',
    line: 3,
    confidence: 0.99,
    summary: 'useMemo is imported but never used.',
    explanation: 'Unused imports add noise for readers and can hide real lint warnings in a long list.',
    fixExplanation: 'Delete the import line.',
    evidenceStartLine: 1,
    evidence: lines(
      "import { useState } from 'react'",
      "import { Card } from '../components/Card'",
      "import { useMemo } from 'react'",
    ),
    suggestedFix: lines("import { useState } from 'react'", "import { Card } from '../components/Card'"),
  },
  {
    id: 'f10',
    title: 'Public function has no docstring',
    severity: 'info',
    category: 'Documentation',
    file: 'server/services/billing.py',
    line: 27,
    confidence: 0.9,
    summary: 'calculate_invoice has no description of what it returns.',
    explanation: 'Other developers have to read the body to know what the function does and what tax_rate means.',
    fixExplanation: 'Add a one-line docstring that says what the function returns and what tax_rate is.',
    evidenceStartLine: 27,
    evidence: lines('def calculate_invoice(order, tax_rate):', '    return order.subtotal * (1 + tax_rate)'),
    suggestedFix: lines(
      'def calculate_invoice(order, tax_rate):',
      '    """Return the order total including tax. tax_rate is a fraction, e.g. 0.18."""',
      '    return order.subtotal * (1 + tax_rate)',
    ),
  },
]
