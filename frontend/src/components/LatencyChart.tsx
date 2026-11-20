import { Activity } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../lib/api'
import { buildPoints, tickLabel } from '../lib/chartData'
import { fmtDuration } from '../lib/format'
import { usePolling } from '../hooks/usePolling'
import { EmptyState, ErrorState, Skeleton } from './ui'

export default function LatencyChart({ serviceId }: { serviceId: number }) {
  const { data, error, loading, refresh } = usePolling(() => api.checks(serviceId, 60), 5000, serviceId)

  if (error && !data) return <ErrorState message={error.message} onRetry={refresh} />
  if (loading && !data) return <Skeleton className="h-64 w-full" />
  if (!data || data.length === 0)
    return <EmptyState icon={<Activity className="h-5 w-5" />} title="No checks yet" text="Results appear after the first health check." />

  const points = buildPoints(data)
  const at = (v: number | string) => points[Math.round(Number(v))]

  return (
    <div className="w-full">
      <div className="h-64 w-full" role="img" aria-label="Response time of the last checks">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 600, height: 256 }}>
          <LineChart data={points} margin={{ top: 16, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#64748b" strokeOpacity={0.2} />
            <XAxis
              dataKey="i"
              type="number"
              domain={[0, Math.max(points.length - 1, 1)]}
              allowDecimals={false}
              tickCount={6}
              tickFormatter={(v: number) => tickLabel(at(v)?.t ?? null)}
              tick={{ fontSize: 11, fill: '#64748b' }}
            />
            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} unit="ms" domain={[0, 'auto']} />
            <Tooltip
              contentStyle={{ background: 'var(--tooltip-bg)', border: '1px solid var(--tooltip-border)', borderRadius: 8, color: 'var(--tooltip-text)' }}
              labelFormatter={(v) => {
                const p = at(v as number)
                return p?.t ? new Date(p.t).toLocaleString() : 'No data (monitor was not running)'
              }}
              formatter={(v, name) => (name === 'failed' ? ['Check failed', ''] : [`${v}ms`, 'Response time'])}
            />
            {points
              .filter((p) => p.gapMs)
              .map((p) => (
                <ReferenceLine
                  key={p.i}
                  x={p.i}
                  stroke="#f59e0b"
                  strokeDasharray="4 4"
                  label={{ value: `${fmtDuration(p.gapMs!)} gap`, position: 'insideTopRight', fontSize: 10, fill: '#f59e0b' }}
                />
              ))}
            <Line type="monotone" dataKey="ms" stroke="#10b981" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
            <Line dataKey="failed" stroke="none" dot={{ r: 4, fill: '#f43f5e', stroke: 'none' }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        <span className="mr-3 inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" /> failed check</span>
        <span className="inline-flex items-center gap-1"><span className="h-0 w-4 border-t border-dashed border-amber-500" /> pause in monitoring</span>
      </p>
    </div>
  )
}