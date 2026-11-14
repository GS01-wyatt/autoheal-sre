import { Router } from "express";
import { z } from "zod";
import type { HealingRepo } from "../db/healing-repo";
import { isAllowedTarget } from "../healing/allowlist";
import type { SimMode } from "../healing/worker";
import { HttpError } from "../lib/errors";

export interface Simulator {
  simulate(mode: SimMode): Promise<{ ok: boolean; detail: string }>;
}

const bodySchema = z.object({ mode: z.enum(["fail", "slow", "crash", "heal"]) });

/** Only mounted in DEMO_MODE. Cannot run commands: it can only flip the demo app's failure mode. */
export function simulateRouter(deps: { h: HealingRepo; simulator: Simulator }) {
  const r = Router();
  r.post("/simulate/:target", async (req, res) => {
    if (!isAllowedTarget(req.params.target)) throw new HttpError(400, "Unknown target");
    const p = bodySchema.safeParse(req.body);
    if (!p.success) throw new HttpError(400, "mode must be one of: fail, slow, crash, heal");
    const out = await deps.simulator.simulate(p.data.mode);
    deps.h.addLog("warn", "simulation", `Simulated '${p.data.mode}' on ${req.params.target}: ${out.detail}`);
    if (!out.ok) throw new HttpError(502, out.detail);
    res.json({ target: req.params.target, mode: p.data.mode, detail: out.detail });
  });
  return r;
}