import { Activity } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Check } from '../lib/api'
import { bucketErrors, buildLatencySeries } from '../lib/metrics'
import { EmptyState } from './ui'

const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const tick = { fontSize: 11, fill: '#64748b' }
const tooltipStyle = { background: 'var(--tooltip-bg)', border: '1px solid var(--tooltip-border)', borderRadius: 8, color: 'var(--tooltip-text)' }

function Empty() {
  return <EmptyState icon={<Activity className="h-5 w-5" />} title="No checks yet" text="Results appear after the first health check." />
}

/** Response time on a real time axis. Gaps in monitoring show as breaks; failed checks are red dots on the baseline. */
export function ResponseChart({ checks }: { checks: Check[] }) {
  const points = buildLatencySeries(checks)
  if (points.length === 0) return <Empty />
  return (
    <div className="h-64 w-full" role="img" aria-label="Response time over time">
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 600, height: 256 }}>
        <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#64748b" strokeOpacity={0.2} />
          <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={clock} tick={tick} minTickGap={48} />
          <YAxis tick={tick} unit="ms" domain={[0, 'auto']} />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(t) => clock(Number(t))}
            formatter={(v, name) => (name === 'failed' ? ['Check failed', ''] : [`${v}ms`, 'Response time'])}
          />
          <Line type="monotone" dataKey="ms" stroke="#10b981" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
          <Line dataKey="failed" stroke="none" dot={{ r: 4, fill: '#f43f5e', stroke: 'none' }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Successful vs failed checks per time bucket: shows when and how long a service was failing. */
export function ErrorTrendChart({ checks }: { checks: Check[] }) {
  const buckets = bucketErrors(checks)
  if (buckets.length === 0) return <Empty />
  return (
    <div className="h-56 w-full" role="img" aria-label="Successful and failed checks over time">
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 600, height: 224 }}>
        <BarChart data={buckets} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#64748b" strokeOpacity={0.2} vertical={false} />
          <XAxis dataKey="t" tickFormatter={clock} tick={tick} minTickGap={48} />
          <YAxis tick={tick} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(t) => clock(Number(t))} cursor={{ fill: 'rgba(100,116,139,0.1)' }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="ok" name="Successful" stackId="a" fill="#10b981" isAnimationActive={false} />
          <Bar dataKey="failed" name="Failed" stackId="a" fill="#f43f5e" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}