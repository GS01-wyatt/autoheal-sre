import { describe, expect, it } from 'vitest'
import type { Check } from './api'
import { bucketErrors, buildLatencySeries, chronological, percentile, summarizeChecks } from './metrics'

let id = 0
const T0 = Date.UTC(2026, 10, 14, 10, 0, 0)
// API returns newest first, so tests build checks in any order and rely on the code to sort
const c = (sec: number, status: 'up' | 'down' = 'up', ms = 100): Check => ({
  id: ++id,
  service_id: 1,
  status,
  http_status: status === 'up' ? 200 : 500,
  response_time_ms: ms,
  error: status === 'down' ? 'HTTP 500' : null,
  checked_at: new Date(T0 + sec * 1000).toISOString(),
})

describe('percentile', () => {
  it('uses nearest-rank and handles empty input', () => {
    const v = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
    expect(percentile(v, 50)).toBe(50)
    expect(percentile(v, 95)).toBe(100)
    expect(percentile([], 95)).toBeNull()
    expect(percentile([7], 95)).toBe(7)
  })
})

describe('summarizeChecks', () => {
  it('counts successes and failures and ignores failed checks for latency', () => {
    const s = summarizeChecks([c(0, 'up', 100), c(2, 'up', 300), c(4, 'down', 2), c(6, 'up', 200)])
    expect(s).toMatchObject({ total: 4, ok: 3, failed: 1, avg: 200, p50: 200, max: 300 })
    expect(s.successRate).toBe(75)
  })
  it('returns nulls for no data', () => {
    expect(summarizeChecks([])).toMatchObject({ total: 0, successRate: null, avg: null, p95: null, max: null })
  })
})

describe('buildLatencySeries', () => {
  it('sorts into time order and marks failures on the baseline', () => {
    const pts = buildLatencySeries([c(4, 'down', 2), c(0, 'up', 120), c(2, 'up', 80)])
    expect(pts.map((p) => p.t)).toEqual([T0, T0 + 2000, T0 + 4000])
    expect(pts[0]).toMatchObject({ ms: 120, failed: null })
    expect(pts[2]).toMatchObject({ ms: null, failed: 0 })
  })

  it('inserts a break where monitoring stopped for a long time', () => {
    // checks every 2s, then nothing for 20 minutes (backend was off), then checks again
    const pts = buildLatencySeries([c(0), c(2), c(4), c(1204), c(1206)])
    expect(pts).toHaveLength(6)
    const gap = pts[3]
    expect(gap.ms).toBeNull()
    expect(gap.failed).toBeNull()
    expect(gap.t).toBeGreaterThan(T0 + 4000)
    expect(gap.t).toBeLessThan(T0 + 1204000)
  })

  it('does not add breaks for normal spacing', () => {
    expect(buildLatencySeries([c(0), c(2), c(4), c(6)])).toHaveLength(4)
  })

  it('is empty for no checks', () => {
    expect(buildLatencySeries([])).toEqual([])
  })
})

describe('bucketErrors', () => {
  it('splits checks into buckets and counts ok and failed', () => {
    const b = bucketErrors([c(0), c(2, 'down'), c(4, 'down'), c(30), c(32)])
    expect(b.reduce((a, x) => a + x.ok, 0)).toBe(3)
    expect(b.reduce((a, x) => a + x.failed, 0)).toBe(2)
    expect(b[0]).toMatchObject({ ok: 1, failed: 2 })
  })

  it('keeps empty buckets so an outage gap is visible, with a bounded bucket count', () => {
    const b = bucketErrors([c(0), c(1200)]) // 20 minutes apart
    expect(b.length).toBeGreaterThan(2)
    expect(b.length).toBeLessThanOrEqual(25)
    expect(b.some((x) => x.ok === 0 && x.failed === 0)).toBe(true)
  })

  it('is empty for no checks', () => {
    expect(bucketErrors([])).toEqual([])
  })
})

describe('chronological', () => {
  it('does not mutate its input', () => {
    const input = [c(4), c(0)]
    const copy = [...input]
    chronological(input)
    expect(input).toEqual(copy)
  })
})