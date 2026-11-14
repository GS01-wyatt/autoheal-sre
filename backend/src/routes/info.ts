import { Router } from "express";
import type { HealingEngine } from "../healing/engine";
import { ALLOWED_TARGETS } from "../healing/allowlist";

/** Read-only, non-sensitive settings. Lets the dashboard tell demo mode from real monitoring. */
export function infoRouter(deps: { engine: HealingEngine; demoMode: boolean }) {
  const r = Router();
  r.get("/info", (_req, res) => {
    const o = deps.engine.opts;
    res.json({
      app: "autoheal-sre",
      demo_mode: deps.demoMode,
      failure_threshold: o.failureThreshold,
      max_retries: o.maxRetries,
      cooldown_ms: o.cooldownMs,
      verify_delay_ms: o.verifyDelayMs,
      max_restarts_per_hour: o.maxRestartsPerHour,
      allowed_targets: ALLOWED_TARGETS,
    });
  });
  return r;
}