import { lazy, Suspense, useState } from 'react'
import { Activity, CheckCircle2, Gauge, Server, TrendingUp, XCircle } from 'lucide-react'
import { api } from '../lib/api'
import { usePolling } from '../hooks/usePolling'
import { fmtClock, fmtMs, fmtPct, timeAgo } from '../lib/format'
import { summarizeChecks } from '../lib/metrics'
import { Badge, Card, EmptyState, ErrorState, PageHeader, Skeleton, StatCard, StatCardSkeleton } from '../components/ui'

// Recharts is large: load the charts only when this page is opened
const ResponseChart = lazy(() => import('../components/MetricCharts').then((m) => ({ default: m.ResponseChart })))
const ErrorTrendChart = lazy(() => import('../components/MetricCharts').then((m) => ({ default: m.ErrorTrendChart })))

const WINDOWS = [60, 200, 500]
const sel = 'rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800'

export default function LiveMetrics() {
  const services = usePolling(api.services, 30_000)
  const [picked, setPicked] = useState(0)
  const [limit, setLimit] = useState(200)

  const list = services.data
  const serviceId = picked || list?.[0]?.id || 0
  const checks = usePolling(() => (serviceId ? api.checks(serviceId, limit) : Promise.resolve([])), 3000, `${serviceId}|${limit}`)

  const controls = (
    <div className="flex flex-wrap items-center gap-3">
      {list && list.length > 0 && (
        <select aria-label="Service" className={sel} value={serviceId} onChange={(e) => setPicked(Number(e.target.value))}>
          {list.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}
      <select aria-label="Window" className={sel} value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
        {WINDOWS.map((w) => <option key={w} value={w}>Last {w} checks</option>)}
      </select>
    </div>
  )
  const header = <PageHeader title="Live Metrics" subtitle="Response time, successes and failures (refreshes every 3s)" action={controls} />

  if (services.error && !list) return <div className="space-y-6">{header}<ErrorState message={services.error.message} onRetry={services.refresh} /></div>
  if (list && list.length === 0)
    return (
      <div className="space-y-6">
        {header}
        <Card><EmptyState icon={<Server className="h-5 w-5" />} title="No services yet" text="Add a service on the Services page to see its metrics." /></Card>
      </div>
    )

  const data = checks.data
  const s = data ? summarizeChecks(data) : null
  const failures = (data ?? []).filter((c) => c.status === 'down').slice(0, 10) // API returns newest first
  const chartFallback = <Skeleton className="h-64 w-full" />

  return (
    <div className="animate-fade-in space-y-6">
      {header}

      {checks.error && !data ? (
        <ErrorState message={checks.error.message} onRetry={checks.refresh} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {!s ? (
              <><StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton /></>
            ) : (
              <>
                <StatCard label="Successful checks" value={String(s.ok)} sub={`of ${s.total} in this window`} icon={<CheckCircle2 className="h-4 w-4" />} tone="green" />
                <StatCard label="Failed checks" value={String(s.failed)} sub={`success rate ${fmtPct(s.successRate)}`} icon={<XCircle className="h-4 w-4" />} tone={s.failed ? 'red' : 'slate'} />
                <StatCard label="Median latency" value={fmtMs(s.p50)} sub={`average ${fmtMs(s.avg)}`} icon={<Gauge className="h-4 w-4" />} tone="blue" />
                <StatCard label="p95 latency" value={fmtMs(s.p95)} sub={`slowest ${fmtMs(s.max)}`} icon={<TrendingUp className="h-4 w-4" />} tone="blue" />
              </>
            )}
          </div>

          <Card title="Response time">
            {data ? <Suspense fallback={chartFallback}><ResponseChart checks={data} /></Suspense> : chartFallback}
          </Card>

          <Card title="Successful vs failed checks over time">
            {data ? <Suspense fallback={chartFallback}><ErrorTrendChart checks={data} /></Suspense> : chartFallback}
          </Card>

          <Card title="Recent failures" flush>
            {!data ? (
              <div className="p-5"><Skeleton className="h-16 w-full" /></div>
            ) : failures.length === 0 ? (
              <EmptyState icon={<Activity className="h-5 w-5" />} title="No failures in this window" text="Every check in the selected window succeeded." />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {failures.map((c) => {
                  const badge = c.http_status ? `HTTP ${c.http_status}` : 'No response'
                  return (
                    <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 text-sm">
                      <span className="font-mono text-xs text-slate-500 dark:text-slate-400" title={new Date(c.checked_at).toLocaleString()}>{fmtClock(c.checked_at)}</span>
                      <Badge tone="red">{badge}</Badge>
                      {c.error && c.error !== badge && <span>{c.error}</span>}
                      <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">{timeAgo(c.checked_at)}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  )
}