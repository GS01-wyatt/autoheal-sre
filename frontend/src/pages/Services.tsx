import { useState } from 'react'
import { Play, Plus, Search, Server, Trash2 } from 'lucide-react'
import { api, type Service } from '../lib/api'
import { usePolling } from '../hooks/usePolling'
import { fmtInterval, fmtMs, fmtPct, timeAgo } from '../lib/format'
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Skeleton, StatusBadge } from '../components/ui'

export function validateNewService(f: { name: string; url: string; intervalS: string; timeoutS: string }) {
  const name = f.name.trim()
  if (!name) return 'Name is required'
  if (name.length > 80) return 'Name must be 80 characters or fewer'
  try {
    const u = new URL(f.url.trim())
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'URL must start with http:// or https://'
  } catch {
    return 'Enter a valid URL, for example https://example.com/health'
  }
  const interval = Number(f.intervalS)
  if (!Number.isFinite(interval) || interval < 1 || interval > 3600) return 'Check interval must be between 1 and 3600 seconds'
  const timeout = Number(f.timeoutS)
  if (!Number.isFinite(timeout) || timeout < 0.1 || timeout > 60) return 'Timeout must be between 0.1 and 60 seconds'
  return null
}

export default function Services() {
  const services = usePolling(api.services, 5000)
  const metrics = usePolling(api.metrics, 5000)
  const info = usePolling(api.info, 60_000)

  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ name: '', url: '', intervalS: '30', timeoutS: '5' })
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<number | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<number | null>(null)

  const refreshAll = () => {
    void services.refresh()
    void metrics.refresh()
  }

  async function onAdd(e: React.SyntheticEvent) {
    e.preventDefault()
    const problem = validateNewService(form)
    if (problem) return setFormError(problem)
    setSaving(true)
    setFormError(null)
    try {
      await api.createService({
        name: form.name.trim(),
        url: form.url.trim(),
        interval_ms: Math.round(Number(form.intervalS) * 1000),
        timeout_ms: Math.round(Number(form.timeoutS) * 1000),
      })
      setForm({ name: '', url: '', intervalS: '30', timeoutS: '5' })
      refreshAll()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not add the service')
    } finally {
      setSaving(false)
    }
  }

  async function act(id: number, fn: () => Promise<unknown>) {
    setBusy(id)
    setRowError(null)
    try {
      await fn()
      refreshAll()
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setBusy(null)
      setConfirmId(null)
    }
  }

  const list: Service[] = services.data ?? []
  const q = search.trim().toLowerCase()
  const shown = list.filter((s) => !q || s.name.toLowerCase().includes(q) || s.url.toLowerCase().includes(q))
  const byId = new Map((metrics.data ?? []).map((m) => [m.service_id, m]))
  const targets = info.data?.allowed_targets ?? []

  const inputCls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800'

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader title="Services" subtitle="Websites and endpoints that AutoHeal checks and heals" />

      <Card title="Add a service">
        <form onSubmit={onAdd} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_2fr_7rem_7rem_auto]" noValidate>
          <label className="text-sm">
            <span className="mb-1 block text-slate-500 dark:text-slate-400">Name</span>
            <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="My website" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-500 dark:text-slate-400">URL</span>
            <input className={inputCls} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://example.com/health" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-500 dark:text-slate-400">Every (s)</span>
            <input className={inputCls} inputMode="numeric" value={form.intervalS} onChange={(e) => setForm({ ...form, intervalS: e.target.value })} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-500 dark:text-slate-400">Timeout (s)</span>
            <input className={inputCls} inputMode="decimal" value={form.timeoutS} onChange={(e) => setForm({ ...form, timeoutS: e.target.value })} />
          </label>
          <div className="flex items-end">
            <Button type="submit" variant="primary" disabled={saving} className="w-full sm:w-auto">
              <Plus className="h-4 w-4" /> {saving ? 'Adding…' : 'Add service'}
            </Button>
          </div>
        </form>
        {formError && <p role="alert" className="mt-3 text-sm text-rose-600 dark:text-rose-400">{formError}</p>}
      </Card>

      <Card
        title={`Monitored services${services.data ? ` (${list.length})` : ''}`}
        flush
        action={
          <label className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
            <input
              aria-label="Search services"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-40 rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 sm:w-56"
            />
          </label>
        }
      >
        {rowError && <p role="alert" className="border-b border-slate-100 px-5 py-3 text-sm text-rose-600 dark:border-slate-800 dark:text-rose-400">{rowError}</p>}

        {services.error && !services.data ? (
          <div className="p-5"><ErrorState message={services.error.message} onRetry={services.refresh} /></div>
        ) : !services.data ? (
          <div className="space-y-3 p-5"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
        ) : list.length === 0 ? (
          <EmptyState icon={<Server className="h-5 w-5" />} title="No services yet" text="Add a website or API above and its first health check runs right away." />
        ) : shown.length === 0 ? (
          <EmptyState icon={<Search className="h-5 w-5" />} title="No matches" text={`Nothing matches "${search}".`} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-5 py-3 font-medium">Service</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Uptime</th>
                  <th className="px-5 py-3 font-medium">Latency</th>
                  <th className="px-5 py-3 font-medium">Interval</th>
                  <th className="px-5 py-3 font-medium">Auto-heal target</th>
                  <th className="px-5 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {shown.map((s) => {
                  const m = byId.get(s.id)
                  const isBusy = busy === s.id
                  return (
                    <tr key={s.id}>
                      <td className="max-w-xs px-5 py-3">
                        <p className="font-medium">{s.name}</p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400" title={s.url}>{s.url}</p>
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={m?.last_status ?? null} paused={!s.enabled} />
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{timeAgo(m?.last_checked_at)}</p>
                      </td>
                      <td className="px-5 py-3">{fmtPct(m?.uptime_percent)}</td>
                      <td className="px-5 py-3">{fmtMs(m?.avg_response_ms)}</td>
                      <td className="px-5 py-3">{fmtInterval(s.interval_ms)}</td>
                      <td className="px-5 py-3">
                        <select
                          aria-label={`Auto-heal target for ${s.name}`}
                          disabled={isBusy || targets.length === 0}
                          value={s.recovery_target ?? ''}
                          onChange={(e) => void act(s.id, () => api.setRecoveryTarget(s.id, e.target.value || null))}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800"
                        >
                          <option value="">None (manual)</option>
                          {targets.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                        {s.recovery_target && info.data?.demo_mode && <div className="mt-1"><Badge tone="amber">demo target</Badge></div>}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Button disabled={isBusy} onClick={() => void act(s.id, () => api.checkNow(s.id))} aria-label={`Check ${s.name} now`}>
                            <Play className="h-3.5 w-3.5" /> Check
                          </Button>
                          <Button disabled={isBusy} onClick={() => void act(s.id, () => api.updateService(s.id, { enabled: !s.enabled }))}>
                            {s.enabled ? 'Pause' : 'Resume'}
                          </Button>
                          {confirmId === s.id ? (
                            <>
                              <Button variant="danger" disabled={isBusy} onClick={() => void act(s.id, () => api.deleteService(s.id))}>Confirm</Button>
                              <Button variant="ghost" onClick={() => setConfirmId(null)}>Cancel</Button>
                            </>
                          ) : (
                            <Button variant="ghost" disabled={isBusy} onClick={() => setConfirmId(s.id)} aria-label={`Delete ${s.name}`}>
                              <Trash2 className="h-4 w-4 text-rose-500" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}