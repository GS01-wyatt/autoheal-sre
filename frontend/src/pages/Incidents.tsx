import { useState } from 'react'
import { CheckCircle2, ShieldAlert } from 'lucide-react'
import { api, type IncidentStatus, type LogRow } from '../lib/api'
import { usePolling } from '../hooks/usePolling'
import { fmtClock, fmtDuration, timeAgo } from '../lib/format'
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Skeleton, type Tone } from '../components/ui'

export const statusTone: Record<IncidentStatus, Tone> = { open: 'amber', recovering: 'blue', escalated: 'red', resolved: 'green' }
export const levelTone: Record<LogRow['level'], Tone> = { debug: 'slate', info: 'blue', warn: 'amber', error: 'red' }
const outcomeTone = { running: 'blue', success: 'green', failed: 'red' } as const

const FILTERS: { value: '' | IncidentStatus; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'recovering', label: 'Recovering' },
  { value: 'escalated', label: 'Escalated' },
  { value: 'resolved', label: 'Resolved' },
]

function Detail({ id, onClose }: { id: number; onClose: () => void }) {
  const d = usePolling(() => api.incident(id), 3000, id)
  const inc = d.data
  return (
    <Card
      title={`Incident #${id}`}
      action={<Button variant="ghost" onClick={onClose}>Close</Button>}
    >
      {d.error && !inc ? (
        <ErrorState message={d.error.message} onRetry={d.refresh} />
      ) : !inc ? (
        <div className="space-y-3"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-24 w-full" /></div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Recovery attempts</h3>
            {inc.attempts.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">No automatic recovery was attempted (no recovery target set, or still below the retry policy).</p>
            ) : (
              <ul className="space-y-2">
                {inc.attempts.map((a) => (
                  <li key={a.id} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">Attempt {a.attempt_no} · {a.action}</span>
                      <Badge tone={outcomeTone[a.outcome]}>{a.outcome}</Badge>
                    </div>
                    {a.detail && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{a.detail}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Timeline</h3>
            {inc.timeline.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">No events recorded.</p>
            ) : (
              <ol className="space-y-3 border-l border-slate-200 pl-4 dark:border-slate-700">
                {inc.timeline.map((e) => (
                  <li key={e.id} className="relative text-sm">
                    <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-indigo-500 ring-4 ring-white dark:ring-slate-900" />
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{fmtClock(e.created_at)}</span>
                      <Badge tone={levelTone[e.level]}>{e.level}</Badge>
                    </div>
                    <p className="mt-0.5">{e.message}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

export default function Incidents() {
  const [status, setStatus] = useState<'' | IncidentStatus>('')
  const [selected, setSelected] = useState<number | null>(null)
  const list = usePolling(() => api.incidents({ status: status || undefined, limit: 100 }), 5000, status)
  const rows = list.data

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader title="Incidents" subtitle="Opened automatically when a service keeps failing health checks" />

      <Card
        title={`Incident history${rows ? ` (${rows.length})` : ''}`}
        flush
        action={
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => { setStatus(e.target.value as '' | IncidentStatus); setSelected(null) }}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800"
          >
            {FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        }
      >
        {list.error && !rows ? (
          <div className="p-5"><ErrorState message={list.error.message} onRetry={list.refresh} /></div>
        ) : !rows ? (
          <div className="space-y-3 p-5"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={status ? <ShieldAlert className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
            title={status ? `No ${status} incidents` : 'No incidents yet'}
            text="An incident opens automatically after consecutive failed health checks."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-5 py-3 font-medium">Incident</th>
                  <th className="px-5 py-3 font-medium">Service</th>
                  <th className="px-5 py-3 font-medium">Severity</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Opened</th>
                  <th className="px-5 py-3 font-medium">Duration</th>
                  <th className="px-5 py-3 font-medium">Attempts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((i) => (
                  <tr key={i.id} className={selected === i.id ? 'bg-indigo-500/5' : ''}>
                    <td className="px-5 py-3">
                      <button className="font-medium text-indigo-600 hover:underline dark:text-indigo-300" onClick={() => setSelected(i.id)} aria-label={`View incident ${i.id}`}>
                        #{i.id}
                      </button>
                    </td>
                    <td className="px-5 py-3">{i.service_name}</td>
                    <td className="px-5 py-3"><Badge tone={i.severity === 'critical' ? 'red' : 'amber'}>{i.severity}</Badge></td>
                    <td className="px-5 py-3"><Badge tone={statusTone[i.status]}>{i.status}</Badge></td>
                    <td className="px-5 py-3 text-slate-500 dark:text-slate-400" title={new Date(i.opened_at).toLocaleString()}>{timeAgo(i.opened_at)}</td>
                    <td className="px-5 py-3">
                      {i.resolved_at ? fmtDuration(new Date(i.resolved_at).getTime() - new Date(i.opened_at).getTime()) : 'ongoing'}
                    </td>
                    <td className="px-5 py-3">{i.recovery_attempts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selected !== null && <Detail id={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}