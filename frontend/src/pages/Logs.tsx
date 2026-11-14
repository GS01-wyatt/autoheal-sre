import { useEffect, useState } from 'react'
import { Search, ScrollText } from 'lucide-react'
import { api } from '../lib/api'
import { usePolling } from '../hooks/usePolling'
import { fmtClock } from '../lib/format'
import { Badge, Card, EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui'
import { levelTone } from './Incidents'

const LEVELS = ['', 'debug', 'info', 'warn', 'error'] as const

export default function Logs() {
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [level, setLevel] = useState<(typeof LEVELS)[number]>('')
  const [serviceId, setServiceId] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  const services = usePolling(api.services, 60_000)
  const logs = usePolling(
    () => api.logs({ level: level || undefined, q: debounced || undefined, service_id: serviceId || undefined, limit: 200 }),
    3000,
    `${level}|${debounced}|${serviceId}`,
  )
  const names = new Map((services.data ?? []).map((s) => [s.id, s.name]))
  const rows = logs.data
  const filtered = !!(level || debounced || serviceId)

  const sel = 'rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800'

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader title="Logs" subtitle="Incident, recovery and simulation events recorded by the backend (refreshes every 3s)" />

      <Card flush>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
          <label className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              aria-label="Search logs"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search messages…"
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
          <select aria-label="Filter by level" className={sel} value={level} onChange={(e) => setLevel(e.target.value as (typeof LEVELS)[number])}>
            {LEVELS.map((l) => <option key={l} value={l}>{l ? l : 'All levels'}</option>)}
          </select>
          <select aria-label="Filter by service" className={sel} value={serviceId} onChange={(e) => setServiceId(Number(e.target.value))}>
            <option value={0}>All services</option>
            {(services.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {logs.error && !rows ? (
          <div className="p-5"><ErrorState message={logs.error.message} onRetry={logs.refresh} /></div>
        ) : !rows ? (
          <div className="space-y-2 p-5"><Skeleton className="h-6 w-full" /><Skeleton className="h-6 w-full" /><Skeleton className="h-6 w-full" /></div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<ScrollText className="h-5 w-5" />}
            title={filtered ? 'No logs match these filters' : 'No log events yet'}
            text={filtered ? 'Try a different search or clear the filters.' : 'Events appear here when an incident opens or a recovery runs.'}
          />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r) => (
              <li key={r.id} className="grid gap-x-3 gap-y-1 px-5 py-2.5 text-sm sm:grid-cols-[6rem_4.5rem_6rem_1fr]">
                <span className="font-mono text-xs text-slate-500 dark:text-slate-400" title={new Date(r.created_at).toLocaleString()}>{fmtClock(r.created_at)}</span>
                <span><Badge tone={levelTone[r.level]}>{r.level}</Badge></span>
                <span className="text-xs text-slate-500 dark:text-slate-400">{r.source}</span>
                <span>
                  {r.message}
                  {r.service_id && names.get(r.service_id) && <span className="ml-2 text-xs text-slate-400">· {names.get(r.service_id)}</span>}
                  {r.incident_id && <span className="ml-2 text-xs text-slate-400">· incident #{r.incident_id}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}