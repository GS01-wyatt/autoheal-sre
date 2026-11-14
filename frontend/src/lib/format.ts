export function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return '—'
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`
}

export function fmtPct(p: number | null | undefined): string {
  return p == null ? '—' : `${p.toFixed(p === 100 || p === 0 ? 0 : 2)}%`
}

export function fmtInterval(ms: number): string {
  return ms % 60000 === 0 ? `${ms / 60000}m` : `${ms / 1000}s`
}

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never'
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}