import type { Finding, Scan } from '../types'
import { mockFindings, mockGetScan, mockStartScan } from './mock'

// Mock data is on by default until the backend is ready.
// Set VITE_USE_MOCK=false in frontend/.env to call the real backend.
export const IS_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'
const BASE = '/api'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    })
  } catch {
    throw new ApiError('Could not reach the server. Check that the backend is running.', 0)
  }
  if (!res.ok) {
    const fallback = res.status === 404 ? 'Not found.' : `Request failed (${res.status}).`
    const body = await res.json().catch(() => null)
    throw new ApiError(body?.detail ?? body?.message ?? fallback, res.status)
  }
  return res.json() as Promise<T>
}

const delay = (ms = 350) => new Promise((r) => setTimeout(r, ms))

export async function startScan(repoUrl: string): Promise<Scan> {
  if (IS_MOCK) return delay().then(() => mockStartScan(repoUrl))
  return request<Scan>('/scans', { method: 'POST', body: JSON.stringify({ repoUrl }) })
}

export async function getScan(id: string): Promise<Scan> {
  if (IS_MOCK) return delay(120).then(() => mockGetScan(id))
  return request<Scan>(`/scans/${id}`)
}

export async function getFindings(scanId: string): Promise<Finding[]> {
  if (IS_MOCK) return delay(500).then(() => mockFindings)
  return request<Finding[]>(`/scans/${scanId}/findings`)
}

export async function getFinding(scanId: string, findingId: string): Promise<Finding> {
  if (IS_MOCK) {
    await delay()
    const found = mockFindings.find((f) => f.id === findingId)
    if (!found) throw new ApiError('This finding does not exist.', 404)
    return found
  }
  return request<Finding>(`/scans/${scanId}/findings/${findingId}`)
}
