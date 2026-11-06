export interface CheckResult {
  status: "up" | "down";
  httpStatus: number | null;
  responseTimeMs: number;
  error: string | null;
}

/** HTTP GET health check. 2xx/3xx = up. Redirects are not followed. */
export async function checkUrl(url: string, timeoutMs: number): Promise<CheckResult> {
  const start = performance.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    await res.body?.cancel();
    const ms = Math.round(performance.now() - start);
    const ok = res.status >= 200 && res.status < 400;
    return { status: ok ? "up" : "down", httpStatus: res.status, responseTimeMs: ms, error: ok ? null : `HTTP ${res.status}` };
  } catch (e: any) {
    const ms = Math.round(performance.now() - start);
    const timedOut = e?.name === "TimeoutError" || e?.name === "AbortError";
    const msg = timedOut ? `Timeout after ${timeoutMs}ms` : e?.cause?.code ?? e?.message ?? "Request failed";
    return { status: "down", httpStatus: null, responseTimeMs: ms, error: String(msg) };
  }
}