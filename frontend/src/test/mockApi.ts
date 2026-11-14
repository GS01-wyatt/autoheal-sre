import { vi } from 'vitest'

type Reply = { status?: number; body?: unknown }
type Handler = unknown | ((init?: RequestInit) => Reply)

/** Reply with a specific HTTP status, e.g. reply(409, { error: 'x' }) */
export const reply = (status: number, body?: unknown) => (): Reply => ({ status, body })

/** Replaces fetch with a fake backend. Keys look like "GET /api/metrics". Returns the list of calls made. */
export function mockApi(routes: Record<string, Handler>) {
  const calls: { key: string; body?: unknown }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${String(input).split('?')[0]}`
      calls.push({ key, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      const h = routes[key]
      if (h === undefined) return new Response(JSON.stringify({ error: `not mocked: ${key}` }), { status: 404 })
      const out: Reply = typeof h === 'function' ? (h as (i?: RequestInit) => Reply)(init) : { status: 200, body: h }
      const status = out.status ?? 200
      return new Response(status === 204 ? null : JSON.stringify(out.body), { status })
    }),
  )
  return calls
}

export const info = {
  app: 'autoheal-sre',
  demo_mode: false,
  failure_threshold: 3,
  max_retries: 3,
  cooldown_ms: 60000,
  verify_delay_ms: 3000,
  max_restarts_per_hour: 6,
  allowed_targets: ['demo-app'],
}
export const health = { status: 'ok', db: 'ok', uptime_s: 10 }

export const metric = (over: Record<string, unknown> = {}) => ({
  service_id: 1,
  name: 'Google',
  total_checks: 10,
  successful_checks: 10,
  failed_checks: 0,
  uptime_percent: 100,
  avg_response_ms: 150,
  last_status: 'up',
  last_http_status: 200,
  last_checked_at: new Date().toISOString(),
  consecutive_failures: 0,
  ...over,
})

export const service = (over: Record<string, unknown> = {}) => ({
  id: 1,
  name: 'Google',
  url: 'https://www.google.com',
  interval_ms: 30000,
  timeout_ms: 5000,
  enabled: true,
  recovery_target: null,
  created_at: new Date().toISOString(),
  ...over,
})