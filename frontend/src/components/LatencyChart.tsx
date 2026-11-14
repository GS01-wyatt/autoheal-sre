import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../lib/api'
import { usePolling } from '../hooks/usePolling'
import { EmptyState, ErrorState, Skeleton } from './ui'
import { Activity } from 'lucide-react'

export default function LatencyChart({ serviceId }: { serviceId: number }) {
  const { data, error, loading, refresh } = usePolling(() => api.checks(serviceId, 60), 5000, serviceId)

  if (error && !data) return <ErrorState message={error.message} onRetry={refresh} />
  if (loading && !data) return <Skeleton className="h-64 w-full" />
  if (!data || data.length === 0)
    return <EmptyState icon={<Activity className="h-5 w-5" />} title="No checks yet" text="Results appear after the first health check." />

  // API returns newest first; the chart reads left to right in time.
  const points = [...data].reverse().map((c) => ({
    time: new Date(c.checked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    ms: c.status === 'up' ? c.response_time_ms : null,
    failed: c.status === 'down' ? 0 : null,
    error: c.error,
  }))

  return (
    <div className="h-64 w-full" role="img" aria-label="Response time of the last checks">
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 600, height: 256 }}>
        <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#64748b" strokeOpacity={0.2} />
          <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#64748b' }} minTickGap={32} />
          <YAxis tick={{ fontSize: 11, fill: '#64748b' }} unit="ms" domain={[0, 'auto']} />
          <Tooltip
            contentStyle={{ background: 'var(--tooltip-bg)', border: '1px solid var(--tooltip-border)', borderRadius: 8, color: 'var(--tooltip-text)' }}
            formatter={(v, name) => (name === 'failed' ? ['Check failed', ''] : [`${v}ms`, 'Response time'])}
          />
          <Line type="monotone" dataKey="ms" stroke="#10b981" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
          <Line dataKey="failed" stroke="none" dot={{ r: 4, fill: '#f43f5e', stroke: 'none' }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}