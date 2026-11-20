import { describe, expect, it } from 'vitest'
import type { Check } from './api'
import { buildPoints, tickLabel } from './chartData'

const T0 = new Date('2026-11-16T20:00:00Z').getTime()
let id = 0
const check = (atMs: number, status: 'up' | 'down' = 'up', ms = 120): Check => ({
  id: ++id,
  service_id: 1,
  status,
  http_status: status === 'up' ? 200 : null,
  response_time_ms: ms,
  error: status === 'down' ? 'ECONNREFUSED' : null,
  checked_at: new Date(atMs).toISOString(),
})
// the API returns newest first
const newestFirst = (cs: Check[]) => [...cs].reverse()

describe('buildPoints', () => {
  it('returns nothing for no checks', () => {
    expect(buildPoints([])).toEqual([])
  })

  it('orders oldest first and plots failures separately from latency', () => {
    const cs = [check(T0), check(T0 + 30_000, 'down'), check(T0 + 60_000)]
    const p = buildPoints(newestFirst(cs))
    expect(p.map((x) => x.t)).toEqual([T0, T0 + 30_000, T0 + 60_000])
    expect(p[0]).toMatchObject({ ms: 120, failed: null })
    expect(p[1]).toMatchObject({ ms: null, failed: 0, error: 'ECONNREFUSED' })
  })

  it('does not invent a gap for a regular interval, even with an extra verification check', () => {
    const cs = [check(T0), check(T0 + 30_000), check(T0 + 60_000), check(T0 + 62_000), check(T0 + 90_000)]
    const p = buildPoints(newestFirst(cs))
    expect(p.some((x) => x.gapMs)).toBe(false)
    expect(p).toHaveLength(5)
  })

  it('inserts one gap marker where monitoring was paused for hours', () => {
    const night = 17 * 3_600_000
    const cs = [check(T0), check(T0 + 30_000), check(T0 + 60_000), check(T0 + night), check(T0 + night + 30_000)]
    const p = buildPoints(newestFirst(cs))
    const gaps = p.filter((x) => x.gapMs)
    expect(gaps).toHaveLength(1)
    expect(gaps[0].gapMs).toBeGreaterThan(16 * 3_600_000)
    expect(gaps[0]).toMatchObject({ t: null, ms: null, failed: null }) // blank point, so the line breaks
    expect(p).toHaveLength(6)
    expect(p.map((x) => x.i)).toEqual([0, 1, 2, 3, 4, 5]) // positions stay consecutive
  })
})

describe('tickLabel', () => {
  it('shows only the clock for today and adds the date for older checks', () => {
    const now = new Date('2026-11-17T09:00:00').getTime()
    expect(tickLabel(new Date('2026-11-17T08:30:00').getTime(), now)).not.toMatch(/Nov/)
    expect(tickLabel(new Date('2026-11-16T08:30:00').getTime(), now)).toMatch(/Nov/)
    expect(tickLabel(null)).toBe('')
  })
})