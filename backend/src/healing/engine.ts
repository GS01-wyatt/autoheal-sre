import type { Logger } from "pino";
import type { Repo } from "../db/repo";
import type { HealingRepo, Incident, LogLevel } from "../db/healing-repo";
import { checkUrl, type CheckResult } from "../monitor/checker";
import { isAllowedTarget, type AllowedTarget } from "./allowlist";

export interface RecoveryWorker {
  restart(target: AllowedTarget): Promise<{ ok: boolean; detail: string }>;
}

export interface EngineOptions {
  failureThreshold: number;
  maxRetries: number;          // per incident
  cooldownMs: number;          // wait between attempts
  verifyDelayMs: number;       // wait after restart before re-checking
  maxRestartsPerHour: number;  // flap protection across incidents
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  check: (url: string, timeoutMs: number) => Promise<CheckResult>;
}

export const defaultEngineOptions: EngineOptions = {
  failureThreshold: 3,
  maxRetries: 3,
  cooldownMs: 60_000,
  verifyDelayMs: 3_000,
  maxRestartsPerHour: 6,
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  check: checkUrl,
};

const HOUR = 3_600_000;

/**
 * Health Check -> Failure Threshold -> Incident -> Recovery Attempt -> Re-check -> Recovered | Escalated
 */
export class HealingEngine {
  readonly opts: EngineOptions;
  constructor(
    private repo: Repo,
    private h: HealingRepo,
    private log: Logger,
    opts: Partial<EngineOptions> = {},
    private worker?: RecoveryWorker
  ) {
    this.opts = { ...defaultEngineOptions, ...opts };
  }

  private note(level: LogLevel, message: string, serviceId: number, incidentId?: number) {
    this.h.addLog(level, "healing", message, serviceId, incidentId);
    this.log[level === "debug" ? "debug" : level]({ serviceId, incidentId }, message);
  }

  /** Called after every stored health check. */
  async handleResult(serviceId: number, result: CheckResult): Promise<void> {
    const svc = this.repo.getService(serviceId);
    if (!svc) return;
    const active = this.h.activeIncident(serviceId);

    if (result.status === "up") {
      // 'recovering' is resolved by the recovery flow itself, after verification
      if (active && active.status !== "recovering") {
        this.h.resolveIncident(active.id);
        this.note("info", "Service is healthy again; incident resolved", serviceId, active.id);
      }
      return;
    }

    const fails = this.repo.consecutiveFailures(serviceId);
    if (fails < this.opts.failureThreshold) return;

    let inc = active;
    if (!inc) {
      inc = this.h.openIncident(serviceId);
      this.note("warn", `Incident opened after ${fails} consecutive failures (${result.error ?? "unhealthy"})`, serviceId, inc.id);
    }
    if (inc.status !== "open") return; // already recovering or escalated

    const target = (svc as { recovery_target?: string | null }).recovery_target;
    if (!target || !isAllowedTarget(target)) {
      if (!active) this.note("warn", "No recovery target configured; manual action required", serviceId, inc.id);
      return;
    }
    if (!this.worker) {
      if (!active) this.note("warn", "No recovery worker available; manual action required", serviceId, inc.id);
      return;
    }
    await this.tryRecover(serviceId, svc.url, svc.timeout_ms, target, inc);
  }

  private escalate(inc: Incident, reason: string) {
    this.h.updateIncident(inc.id, { status: "escalated", severity: "critical" });
    this.note("error", `Escalated: ${reason}. Manual intervention required`, inc.service_id, inc.id);
  }

  private async tryRecover(serviceId: number, url: string, timeoutMs: number, target: AllowedTarget, inc: Incident) {
    const now = this.opts.now();

    if (inc.recovery_attempts >= this.opts.maxRetries) return this.escalate(inc, `retry limit (${this.opts.maxRetries}) reached`);
    if (this.h.countAttemptsSince(serviceId, now - HOUR) >= this.opts.maxRestartsPerHour)
      return this.escalate(inc, `restart limit (${this.opts.maxRestartsPerHour}/hour) reached, possible restart loop`);
    if (inc.last_attempt_ms != null && now - inc.last_attempt_ms < this.opts.cooldownMs) return; // cooling down

    const attemptNo = inc.recovery_attempts + 1;
    // Mark as in-flight synchronously, before any await, so concurrent checks cannot start a second restart
    this.h.updateIncident(inc.id, { status: "recovering", recovery_attempts: attemptNo, last_attempt_ms: now });
    const attemptId = this.h.addAttempt({ incidentId: inc.id, serviceId, attemptNo, action: `restart:${target}`, startedMs: now });
    this.note("info", `Recovery attempt ${attemptNo}/${this.opts.maxRetries}: restarting ${target}`, serviceId, inc.id);

    let ok = false;
    let detail = "";
    try {
      const r = await this.worker!.restart(target);
      if (!r.ok) detail = `Restart failed: ${r.detail}`;
      else {
        await this.opts.sleep(this.opts.verifyDelayMs);
        const verify = await this.opts.check(url, timeoutMs);
        this.repo.insertCheck(serviceId, verify); // verify, do not assume
        ok = verify.status === "up";
        detail = ok ? `Verified healthy (HTTP ${verify.httpStatus}, ${verify.responseTimeMs}ms)` : `Still unhealthy after restart (${verify.error ?? "down"})`;
      }
    } catch (e: any) {
      detail = `Worker error: ${e?.message ?? e}`;
    }

    this.h.finishAttempt(attemptId, ok ? "success" : "failed", detail);
    if (ok) {
      this.h.resolveIncident(inc.id);
      this.note("info", `Recovered on attempt ${attemptNo}. ${detail}`, serviceId, inc.id);
    } else if (attemptNo >= this.opts.maxRetries) {
      this.note("warn", `Attempt ${attemptNo} failed. ${detail}`, serviceId, inc.id);
      this.escalate({ ...inc, recovery_attempts: attemptNo }, `retry limit (${this.opts.maxRetries}) reached`);
    } else {
      this.h.updateIncident(inc.id, { status: "open" });
      this.note("warn", `Attempt ${attemptNo} failed. ${detail}. Will retry after cooldown`, serviceId, inc.id);
    }
  }

  /** Snapshot for the Auto-Healing dashboard page. */
  status(serviceId: number) {
    const inc = this.h.activeIncident(serviceId);
    const now = this.opts.now();
    const cooldown = inc?.last_attempt_ms != null ? Math.max(0, this.opts.cooldownMs - (now - inc.last_attempt_ms)) : 0;
    return {
      active_incident_id: inc?.id ?? null,
      incident_status: inc?.status ?? null,
      attempts_used: inc?.recovery_attempts ?? 0,
      max_retries: this.opts.maxRetries,
      cooldown_remaining_ms: inc && inc.status === "open" ? cooldown : 0,
      total_restarts: this.h.totalAttempts(serviceId),
      last_outcome: this.h.lastAttempt(serviceId)?.outcome ?? null,
    };
  }
}