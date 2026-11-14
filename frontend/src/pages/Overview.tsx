import { lazy, Suspense, useState } from 'react'
import { Activity, CheckCircle2, Gauge, Server, ShieldAlert, TriangleAlert } from 'lucide-react'
import { api, type Incident, type ServiceMetrics } from '../lib/api'
import { usePolling } from '../hooks/usePolling'
import { fmtMs, fmtPct, timeAgo } from '../lib/format'
import { Badge, Card, EmptyState, ErrorState, PageHeader, Skeleton, StatCard, StatCardSkeleton, StatusBadge } from '../components/ui'

function summarize(rows: ServiceMetrics[]) {
  const total = rows.reduce((a, r) => a + r.total_checks, 0)
  const ok = rows.reduce((a, r) => a + r.successful_checks, 0)
  const failed = rows.reduce((a, r) => a + r.failed_checks, 0)
  const latencyWeight = rows.reduce((a, r) => a + (r.avg_response_ms == null ? 0 : r.successful_checks), 0)
  const latencySum = rows.reduce((a, r) => a + (r.avg_response_ms == null ? 0 : r.avg_response_ms * r.successful_checks), 0)
  return {
    up: rows.filter((r) => r.last_status === 'up').length,
    down: rows.filter((r) => r.last_status === 'down').length,
    uptime: total ? (ok / total) * 100 : null,
    errorRate: total ? (failed / total) * 100 : null,
    avgLatency: latencyWeight ? latencySum / latencyWeight : null,
  }
}

// Recharts is large, so the chart is loaded only when this page needs it
const LatencyChart = lazy(() => import('../components/LatencyChart'))

const sevTone = { warning: 'amber', critical: 'red' } as const
const statusTone = { open: 'amber', recovering: 'blue', escalated: 'red', resolved: 'green' } as const

export default function Overview() {
  const metrics = usePolling(api.metrics, 5000)
  const incidents = usePolling(() => api.incidents({ limit: 50 }), 5000)
  const [picked, setPicked] = useState<number | null>(null)

  const rows = metrics.data
  if (metrics.error && !rows) {
    return (
      <div className="space-y-6">
        <PageHeader title="Overview" subtitle="Live health of every monitored service" />
        <ErrorState message={metrics.error.message} onRetry={metrics.refresh} />
      </div>
    )
  }

  const s = rows ? summarize(rows) : null
  const active: Incident[] = (incidents.data ?? []).filter((i) => i.status !== 'resolved')
  const selected = rows?.find((r) => r.service_id === picked) ?? rows?.[0]

  let banner = { tone: 'slate' as 'slate' | 'green' | 'red', text: 'Waiting for the first health checks…' }
  if (rows && rows.length === 0) banner = { tone: 'slate', text: 'No services yet. Add one on the Services page.' }
  else if (s && s.down > 0) banner = { tone: 'red', text: `${s.down} of ${rows!.length} services are down` }
  else if (s && s.up > 0 && s.up === rows!.length) banner = { tone: 'green', text: 'All systems operational' }

  const bannerStyle = {
    slate: 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900',
    green: 'border-emerald-500/30 bg-emerald-500/5',
    red: 'border-rose-500/30 bg-rose-500/5',
  }[banner.tone]

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader title="Overview" subtitle="Live health of every monitored service" />

      <div className={`flex items-center gap-3 rounded-xl border px-5 py-4 ${bannerStyle}`}>
        {banner.tone === 'red' ? <TriangleAlert className="h-5 w-5 text-rose-500" /> : <CheckCircle2 className={`h-5 w-5 ${banner.tone === 'green' ? 'text-emerald-500' : 'text-slate-400'}`} />}
        <p className="font-medium">{banner.text}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {!s ? (
          <>
            <StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard label="Services up" value={`${s.up}/${rows!.length}`} sub={s.down ? `${s.down} down` : 'none down'} icon={<Server className="h-4 w-4" />} tone={s.down ? 'red' : 'green'} />
            <StatCard label="Uptime" value={fmtPct(s.uptime)} sub={`error rate ${fmtPct(s.errorRate)}`} icon={<Activity className="h-4 w-4" />} tone="green" />
            <StatCard label="Avg latency" value={fmtMs(s.avgLatency)} sub="successful checks only" icon={<Gauge className="h-4 w-4" />} tone="blue" />
            <StatCard label="Active incidents" value={incidents.data ? String(active.length) : '—'} sub={active.some((i) => i.severity === 'critical') ? 'includes critical' : 'none critical'} icon={<ShieldAlert className="h-4 w-4" />} tone={active.length ? 'amber' : 'slate'} />
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title="Response time (last 60 checks)"
          action={
            rows && rows.length > 0 ? (
              <select
                aria-label="Service for chart"
                value={selected?.service_id ?? ''}
                onChange={(e) => setPicked(Number(e.target.value))}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                {rows.map((r) => (
                  <option key={r.service_id} value={r.service_id}>{r.name}</option>
                ))}
              </select>
            ) : undefined
          }
        >
          {selected ? <Suspense fallback={<Skeleton className="h-64 w-full" />}><LatencyChart serviceId={selected.service_id} /></Suspense> : rows ? <EmptyState icon={<Server className="h-5 w-5" />} title="Nothing to chart yet" /> : <Skeleton className="h-64 w-full" />}
        </Card>

        <Card title="Active incidents">
          {!incidents.data && !incidents.error ? (
            <div className="space-y-3"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
          ) : incidents.error && !incidents.data ? (
            <ErrorState message={incidents.error.message} onRetry={incidents.refresh} />
          ) : active.length === 0 ? (
            <EmptyState icon={<CheckCircle2 className="h-5 w-5" />} title="No active incidents" text="Everything is running normally." />
          ) : (
            <ul className="space-y-3">
              {active.slice(0, 6).map((i) => (
                <li key={i.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{i.service_name}</p>
                    <Badge tone={sevTone[i.severity]}>{i.severity}</Badge>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <Badge tone={statusTone[i.status]}>{i.status}</Badge>
                    <span>opened {timeAgo(i.opened_at)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Service availability" flush>
        {!rows ? (
          <div className="space-y-3 p-5"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<Server className="h-5 w-5" />} title="No services monitored" text="Add your first service on the Services page." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-5 py-3 font-medium">Service</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Uptime</th>
                  <th className="px-5 py-3 font-medium">Avg latency</th>
                  <th className="px-5 py-3 font-medium">Last check</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((r) => (
                  <tr key={r.service_id}>
                    <td className="px-5 py-3 font-medium">{r.name}</td>
                    <td className="px-5 py-3"><StatusBadge status={r.last_status} /></td>
                    <td className="px-5 py-3">{fmtPct(r.uptime_percent)}</td>
                    <td className="px-5 py-3">{fmtMs(r.avg_response_ms)}</td>
                    <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{timeAgo(r.last_checked_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}