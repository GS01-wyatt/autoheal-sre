import type { Check } from './api'

export interface LatencyPoint { t: number; ms: number | null; failed: number | null }
export interface Bucket { t: number; ok: number; failed: number }
export interface CheckSummary {
  total: number
  ok: number
  failed: number
  successRate: number | null
  avg: number | null
  p50: number | null
  p95: number | null
  max: number | null
}

const ts = (c: Check) => new Date(c.checked_at).getTime()

export const chronological = (checks: Check[]): Check[] => [...checks].sort((a, b) => ts(a) - ts(b) || a.id - b.id)

export function percentile(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null
  const idx = Math.ceil((p / 100) * sortedAsc.length) - 1
  return sortedAsc[Math.min(sortedAsc.length - 1, Math.max(0, idx))]
}

/** Latency stats use successful checks only: a refused connection answers in 2ms and would flatter the numbers. */
export function summarizeChecks(checks: Check[]): CheckSummary {
  const upMs = checks.filter((c) => c.status === 'up').map((c) => c.response_time_ms).sort((a, b) => a - b)
  const ok = upMs.length
  const total = checks.length
  return {
    total,
    ok,
    failed: total - ok,
    successRate: total ? (ok / total) * 100 : null,
    avg: ok ? upMs.reduce((a, b) => a + b, 0) / ok : null,
    p50: percentile(upMs, 50),
    p95: percentile(upMs, 95),
    max: ok ? upMs[ok - 1] : null,
  }
}

/**
 * Points in time order. When two checks are far apart (backend was off, service paused) a gap marker
 * is inserted so the chart shows a break instead of a misleading straight line.
 */
export function buildLatencySeries(checks: Check[]): LatencyPoint[] {
  const c = chronological(checks)
  if (c.length === 0) return []
  const gaps = c.slice(1).map((x, i) => ts(x) - ts(c[i])).sort((a, b) => a - b)
  const median = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0
  const threshold = Math.max(10_000, median * 4)
  const out: LatencyPoint[] = []
  c.forEach((x, i) => {
    if (i > 0) {
      const g = ts(x) - ts(c[i - 1])
      if (g > threshold) out.push({ t: ts(c[i - 1]) + g / 2, ms: null, failed: null })
    }
    out.push({ t: ts(x), ms: x.status === 'up' ? x.response_time_ms : null, failed: x.status === 'down' ? 0 : null })
  })
  return out
}

const NICE = [10_000, 30_000, 60_000, 300_000, 900_000, 3_600_000]

/** Successes and failures per time bucket (empty buckets included, so outages and gaps are visible). */
export function bucketErrors(checks: Check[], targetBuckets = 24): Bucket[] {
  const c = chronological(checks)
  if (c.length === 0) return []
  const span = ts(c[c.length - 1]) - ts(c[0])
  const size = NICE.find((n) => span / n <= targetBuckets) ?? NICE[NICE.length - 1]
  const first = Math.floor(ts(c[0]) / size) * size
  const last = Math.floor(ts(c[c.length - 1]) / size) * size
  const map = new Map<number, Bucket>()
  for (let t = first; t <= last; t += size) map.set(t, { t, ok: 0, failed: 0 })
  for (const x of c) {
    const b = map.get(Math.floor(ts(x) / size) * size)!
    if (x.status === 'up') b.ok++
    else b.failed++
  }
  return [...map.values()]
}