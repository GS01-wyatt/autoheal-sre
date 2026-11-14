import { useCallback, useEffect, useRef, useState } from 'react'

/** Loads data now and then every `intervalMs` (paused while the tab is hidden). */
export function usePolling<T>(fn: () => Promise<T>, intervalMs = 5000, key: unknown = '') {
  const [data, setData] = useState<T | undefined>(undefined)
  const [error, setError] = useState<Error | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const fnRef = useRef(fn)
  const alive = useRef(true)

  useEffect(() => {
    fnRef.current = fn
  })

  const load = useCallback(async () => {
    try {
      const v = await fnRef.current()
      if (!alive.current) return
      setData(v)
      setError(undefined)
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      if (alive.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    alive.current = true
    void load()
    const t = setInterval(() => {
      if (!document.hidden) void load()
    }, intervalMs)
    return () => {
      alive.current = false
      clearInterval(t)
    }
  }, [load, intervalMs, key])

  return { data, error, loading, refresh: load }
}