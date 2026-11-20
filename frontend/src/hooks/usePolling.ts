import { useCallback, useEffect, useRef, useState } from 'react'

interface Result<T> {
  key: unknown
  data?: T
  error?: Error
}

/**
 * Loads data now and then every `intervalMs` (paused while the tab is hidden).
 * Results belong to the `key` they were fetched for: when the key changes (another service, another filter)
 * old data is not shown and late answers for the old key are ignored.
 */
export function usePolling<T>(fn: () => Promise<T>, intervalMs = 5000, key: unknown = '') {
  const [result, setResult] = useState<Result<T> | null>(null)
  const fnRef = useRef(fn)
  const keyRef = useRef(key)
  const alive = useRef(true)

  useEffect(() => {
    fnRef.current = fn
    keyRef.current = key
  })

  const load = useCallback(async (forKey: unknown) => {
    try {
      const v = await fnRef.current()
      if (alive.current && Object.is(keyRef.current, forKey)) setResult({ key: forKey, data: v })
    } catch (e) {
      if (!alive.current || !Object.is(keyRef.current, forKey)) return
      const error = e instanceof Error ? e : new Error(String(e))
      // keep the last good data of the same key, so one failed refresh does not blank the screen
      setResult((prev) => ({ key: forKey, data: prev && Object.is(prev.key, forKey) ? prev.data : undefined, error }))
    }
  }, [])

  useEffect(() => {
    alive.current = true
    void load(key)
    const t = setInterval(() => {
      if (!document.hidden) void load(key)
    }, intervalMs)
    return () => {
      alive.current = false
      clearInterval(t)
    }
  }, [load, intervalMs, key])

  const current = result && Object.is(result.key, key) ? result : null
  const refresh = useCallback(() => load(keyRef.current), [load])
  return { data: current?.data, error: current?.error, loading: current === null, refresh }
}