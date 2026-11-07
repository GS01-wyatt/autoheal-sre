import type { Repo } from "../db/repo";
import { checkUrl, type CheckResult } from "./checker";
import type { Logger } from "pino";

export class Scheduler {
  private timers = new Map<number, NodeJS.Timeout>();
  constructor(
    private repo: Repo,
    private log: Logger,
    private failureThreshold: number,
    private onResult?: (serviceId: number, result: CheckResult) => void
  ) {}

  /** Run one check now, store it, and log threshold breaches. */
  async runCheck(serviceId: number): Promise<CheckResult | undefined> {
    const svc = this.repo.getService(serviceId);
    if (!svc) return undefined;
    const result = await checkUrl(svc.url, svc.timeout_ms);
    // service may have been deleted while the request was in flight
    if (!this.repo.getService(serviceId)) return result;
    this.repo.insertCheck(serviceId, result);
    const fails = this.repo.consecutiveFailures(serviceId);
    this.log.info({ service: svc.name, status: result.status, ms: result.responseTimeMs, fails }, "health check");
    if (result.status === "down" && fails === this.failureThreshold) {
      this.log.warn({ service: svc.name, fails }, "failure threshold reached");
    }
    this.onResult?.(serviceId, result); // hand over to the healing engine
    return result;
  }

  /** Make timers match the DB (call after any service create/update/delete). */
  sync() {
    const wanted = new Map(this.repo.listServices().filter((s) => s.enabled).map((s) => [s.id, s]));
    for (const [id, t] of this.timers) {
      if (!wanted.has(id)) { clearInterval(t); this.timers.delete(id); }
    }
    for (const [id, s] of wanted) {
      const existing = this.timers.get(id);
      if (existing) clearInterval(existing);
      const t = setInterval(() => void this.runCheck(id).catch((e) => this.log.error({ err: e }, "check crashed")), s.interval_ms);
      t.unref();
      this.timers.set(id, t);
    }
  }

  stop() {
    for (const t of this.timers.values()) clearInterval(t);
    this.timers.clear();
  }
}