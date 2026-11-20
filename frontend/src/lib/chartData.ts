import type { Check } from './api'

export interface ChartPoint {
  i: number
  t: number | null // check time (ms since epoch); null for a gap marker
  ms: number | null // response time, only for successful checks
  failed: 0 | null // plotted at 0 for failed checks
  gapMs: number | null // size of the pause, only on a gap marker
  error: string | null
}

/**
 * Oldest first. When the monitor was not running (a long pause between checks) a blank point is
 * inserted, so the line breaks there instead of joining two hours that are far apart in time.
 */
export function buildPoints(checks: Check[]): ChartPoint[] {
  const sorted = [...checks].sort((a, b) => a.id - b.id) // the API returns newest first
  const times = sorted.map((c) => new Date(c.checked_at).getTime())
  const deltas = times
    .slice(1)
    .map((t, k) => t - times[k])
    .filter((d) => d > 0)
    .sort((a, b) => a - b)
  const median = deltas.length ? deltas[Math.floor(deltas.length / 2)] : 0
  const gapLimit = Math.max(median * 5, 60_000)

  const out: ChartPoint[] = []
  sorted.forEach((c, k) => {
    if (k > 0 && times[k] - times[k - 1] > gapLimit) {
      out.push({ i: out.length, t: null, ms: null, failed: null, gapMs: times[k] - times[k - 1], error: null })
    }
    out.push({
      i: out.length,
      t: times[k],
      ms: c.status === 'up' ? c.response_time_ms : null,
      failed: c.status === 'down' ? 0 : null,
      gapMs: null,
      error: c.error,
    })
  })
  return out
}

/** Clock time, with the date added when the check was not today. */
export function tickLabel(t: number | null, now = Date.now()): string {
  if (t == null) return ''
  const d = new Date(t)
  const clock = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return d.toDateString() === new Date(now).toDateString() ? clock : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${clock}`
}