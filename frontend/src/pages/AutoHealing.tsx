import { useState } from 'react'
import { Flame, HeartPulse, Hourglass, RotateCcw, Zap } from 'lucide-react'
import { api, type HealingStatus, type SimMode } from '../lib/api'
import { usePolling } from '../hooks/usePolling'
import { fmtDuration } from '../lib/format'
import { Badge, Card, EmptyState, ErrorState, PageHeader, Skeleton, type Tone } from '../components/ui'
import { statusTone } from './Incidents'

const outcomeTone: Record<string, Tone> = { success: 'green', failed: 'red', running: 'blue' }

function stateOf(s: HealingStatus): { tone: Tone; label: string } {
  switch (s.incident_status) {
    case 'recovering': return { tone: 'blue', label: 'Recovering…' }
    case 'open': return { tone: 'amber', label: s.cooldown_remaining_ms > 0 ? `Cooling down ${Math.ceil(s.cooldown_remaining_ms / 1000)}s` : 'Incident open' }
    case 'escalated': return { tone: 'red', label: 'Escalated: needs a human' }
    default: return { tone: 'green', label: 'Healthy' }
  }
}

const SIMS: { mode: SimMode; label: string; hint: string }[] = [
  { mode: 'fail', label: 'Make it fail (HTTP 500)', hint: 'The app keeps running but answers with errors' },
  { mode: 'slow', label: 'Make it slow', hint: 'Responses take 8s, so health checks time out' },
  { mode: 'crash', label: 'Crash the process', hint: 'The process exits, so the port is closed' },
  { mode: 'heal', label: 'Fix it manually', hint: 'Back to healthy without a restart' },
]

export default function AutoHealing() {
  const status = usePolling(api.healingStatus, 2000)
  const info = usePolling(api.info, 60_000)
  const incidents = usePolling(() => api.incidents({ limit: 200 }), 5000)
  const [simMsg, setSimMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [simBusy, setSimBusy] = useState(false)

  async function simulate(mode: SimMode) {
    setSimBusy(true)
    setSimMsg(null)
    try {
      const r = await api.simulate('demo-app', mode)
      setSimMsg({ ok: true, text: r.detail })
    } catch (e) {
      setSimMsg({ ok: false, text: e instanceof Error ? e.message : 'Simulation failed' })
    } finally {
      setSimBusy(false)
    }
  }

  const rows = status.data
  const inc = incidents.data ?? []
  const resolved = inc.filter((i) => i.status === 'resolved').length
  const escalated = inc.filter((i) => i.status === 'escalated').length
  const restarts = (rows ?? []).reduce((a, r) => a + r.total_restarts, 0)
  const i = info.data

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader title="Auto-Healing" subtitle="Safe, limited recovery: check, incident, restart, verify, then recovered or escalated" />

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Restarts performed', value: rows ? String(restarts) : '—', icon: <RotateCcw className="h-4 w-4" />, tone: 'blue' as Tone },
          { label: 'Incidents resolved', value: incidents.data ? String(resolved) : '—', icon: <HeartPulse className="h-4 w-4" />, tone: 'green' as Tone },
          { label: 'Escalated to a human', value: incidents.data ? String(escalated) : '—', icon: <Flame className="h-4 w-4" />, tone: (escalated ? 'red' : 'slate') as Tone },
        ].map((c) => (
          <div key={c.label} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">{c.label}</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">{c.value}</p>
            </div>
            <Badge tone={c.tone}>{c.icon}</Badge>
          </div>
        ))}
      </div>

      <Card title="Recovery policy">
        {!i ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-5">
            {[
              ['Failures before incident', `${i.failure_threshold} in a row`],
              ['Max attempts per incident', String(i.max_retries)],
              ['Cooldown between attempts', fmtDuration(i.cooldown_ms)],
              ['Verify delay after restart', fmtDuration(i.verify_delay_ms)],
              ['Restart cap', `${i.max_restarts_per_hour} per hour`],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-slate-500 dark:text-slate-400">{k}</dt>
                <dd className="mt-0.5 font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        {i && <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">Allowlisted recovery targets: {i.allowed_targets.join(', ')}. The API can only choose from this list, never run a command.</p>}
      </Card>

      {status.error && !rows ? (
        <ErrorState message={status.error.message} onRetry={status.refresh} />
      ) : !rows ? (
        <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-44 w-full" /><Skeleton className="h-44 w-full" /></div>
      ) : rows.length === 0 ? (
        <Card><EmptyState icon={<HeartPulse className="h-5 w-5" />} title="No services to heal" text="Add a service and choose an auto-heal target on the Services page." /></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((s) => {
            const st = stateOf(s)
            const pct = s.max_retries ? Math.min(100, (s.attempts_used / s.max_retries) * 100) : 0
            return (
              <Card key={s.service_id} title={s.name} action={<Badge tone={st.tone}>{st.label}</Badge>}>
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Recovery target</dt>
                    <dd className="mt-0.5 font-medium">{s.recovery_target ?? 'None (manual only)'}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Active incident</dt>
                    <dd className="mt-0.5 font-medium">
                      {s.active_incident_id ? <>#{s.active_incident_id} {s.incident_status && <Badge tone={statusTone[s.incident_status]}>{s.incident_status}</Badge>}</> : 'None'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Total restarts</dt>
                    <dd className="mt-0.5 font-medium">{s.total_restarts}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Last outcome</dt>
                    <dd className="mt-0.5 font-medium">{s.last_outcome ? <Badge tone={outcomeTone[s.last_outcome] ?? 'slate'}>{s.last_outcome}</Badge> : '—'}</dd>
                  </div>
                </dl>
                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>Attempts used this incident</span>
                    <span>{s.attempts_used}/{s.max_retries}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="progressbar" aria-valuemin={0} aria-valuemax={s.max_retries} aria-valuenow={s.attempts_used} aria-label={`Attempts used for ${s.name}`}>
                    <div className={`h-full rounded-full transition-all ${s.incident_status === 'escalated' ? 'bg-rose-500' : 'bg-indigo-500'}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {i?.demo_mode && (
        <Card title="Failure simulation (demo mode only)" action={<Badge tone="amber">Demo</Badge>}>
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            These buttons only change the local <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">demo-app</code>. Break it, then watch the incident open and the engine heal it.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {SIMS.map((s) => (
              <button
                key={s.mode}
                disabled={simBusy}
                onClick={() => void simulate(s.mode)}
                className="rounded-lg border border-slate-200 p-3 text-left transition hover:border-indigo-400 hover:bg-indigo-500/5 disabled:opacity-50 dark:border-slate-700"
              >
                <span className="flex items-center gap-1.5 text-sm font-medium"><Zap className="h-3.5 w-3.5 text-amber-500" />{s.label}</span>
                <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{s.hint}</span>
              </button>
            ))}
          </div>
          {simMsg && (
            <p role={simMsg.ok ? 'status' : 'alert'} className={`mt-4 flex items-center gap-1.5 text-sm ${simMsg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
              {simMsg.ok && <Hourglass className="h-4 w-4" />}{simMsg.text}
            </p>
          )}
        </Card>
      )}
    </div>
  )
}