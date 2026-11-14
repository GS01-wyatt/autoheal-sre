// Typed client for the AutoHeal backend. Every call goes to /api (proxied to the backend in dev).

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: init?.body ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
    })
  } catch {
    throw new ApiError('Cannot reach the backend. Is it running?', 0)
  }
  if (res.status === 204) return undefined as T
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(body?.error ?? `Request failed (${res.status})`, res.status)
  return body as T
}

export interface Service {
  id: number
  name: string
  url: string
  interval_ms: number
  timeout_ms: number
  enabled: boolean
  recovery_target: string | null
  created_at: string
}
export interface ServiceMetrics {
  service_id: number
  name: string
  total_checks: number
  successful_checks: number
  failed_checks: number
  uptime_percent: number | null
  avg_response_ms: number | null
  last_status: 'up' | 'down' | null
  last_http_status: number | null
  last_checked_at: string | null
  consecutive_failures: number
}
export interface Check {
  id: number
  service_id: number
  status: 'up' | 'down'
  http_status: number | null
  response_time_ms: number
  error: string | null
  checked_at: string
}
export type IncidentStatus = 'open' | 'recovering' | 'escalated' | 'resolved'
export interface Incident {
  id: number
  service_id: number
  service_name: string
  severity: 'warning' | 'critical'
  status: IncidentStatus
  opened_at: string
  resolved_at: string | null
  recovery_attempts: number
}
export interface Attempt {
  id: number
  incident_id: number
  service_id: number
  attempt_no: number
  action: string
  outcome: 'running' | 'success' | 'failed'
  detail: string | null
  started_at: string
  finished_at: string | null
}
export interface LogRow {
  id: number
  level: 'debug' | 'info' | 'warn' | 'error'
  source: string
  message: string
  service_id: number | null
  incident_id: number | null
  created_at: string
}
export interface IncidentDetail extends Incident {
  attempts: Attempt[]
  timeline: LogRow[]
}
export interface HealingStatus {
  service_id: number
  name: string
  recovery_target: string | null
  active_incident_id: number | null
  incident_status: IncidentStatus | null
  attempts_used: number
  max_retries: number
  cooldown_remaining_ms: number
  total_restarts: number
  last_outcome: 'running' | 'success' | 'failed' | null
}
export type SimMode = 'fail' | 'slow' | 'crash' | 'heal'
export interface Info {
  app: string
  demo_mode: boolean
  failure_threshold: number
  max_retries: number
  cooldown_ms: number
  verify_delay_ms: number
  max_restarts_per_hour: number
  allowed_targets: string[]
}
export interface NewService {
  name: string
  url: string
  interval_ms?: number
  timeout_ms?: number
}

export const api = {
  incident: (id: number) => request<IncidentDetail>(`/incidents/${id}`),
  logs: (q: { level?: string; q?: string; service_id?: number; limit?: number } = {}) => {
    const p = new URLSearchParams()
    if (q.level) p.set('level', q.level)
    if (q.q) p.set('q', q.q)
    if (q.service_id) p.set('service_id', String(q.service_id))
    if (q.limit) p.set('limit', String(q.limit))
    const s = p.toString()
    return request<LogRow[]>(`/logs${s ? `?${s}` : ''}`)
  },
  healingStatus: () => request<HealingStatus[]>('/healing/status'),
  simulate: (target: string, mode: SimMode) =>
    request<{ target: string; mode: string; detail: string }>(`/simulate/${target}`, { method: 'POST', body: JSON.stringify({ mode }) }),
  health: () => request<{ status: string; db: string; uptime_s: number }>('/health'),
  info: () => request<Info>('/info'),
  services: () => request<Service[]>('/services'),
  createService: (b: NewService) => request<Service>('/services', { method: 'POST', body: JSON.stringify(b) }),
  updateService: (id: number, b: Partial<NewService> & { enabled?: boolean }) =>
    request<Service>(`/services/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  deleteService: (id: number) => request<void>(`/services/${id}`, { method: 'DELETE' }),
  checkNow: (id: number) => request<Check>(`/services/${id}/check`, { method: 'POST' }),
  checks: (id: number, limit = 60) => request<Check[]>(`/services/${id}/checks?limit=${limit}`),
  metrics: () => request<ServiceMetrics[]>('/metrics'),
  incidents: (q: { status?: IncidentStatus; limit?: number } = {}) => {
    const p = new URLSearchParams()
    if (q.status) p.set('status', q.status)
    if (q.limit) p.set('limit', String(q.limit))
    const s = p.toString()
    return request<Incident[]>(`/incidents${s ? `?${s}` : ''}`)
  },
  setRecoveryTarget: (id: number, target: string | null) =>
    request<Service>(`/services/${id}/recovery-target`, { method: 'PUT', body: JSON.stringify({ target }) }),
}