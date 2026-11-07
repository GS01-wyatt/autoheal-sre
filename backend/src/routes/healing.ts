import { Router } from "express";
import { z } from "zod";
import type { Repo } from "../db/repo";
import type { HealingRepo } from "../db/healing-repo";
import type { HealingEngine } from "../healing/engine";
import { ALLOWED_TARGETS } from "../healing/allowlist";
import { HttpError } from "../lib/errors";

const targetSchema = z.object({ target: z.enum(ALLOWED_TARGETS).nullable() });
const levelSchema = z.enum(["debug", "info", "warn", "error"]);
const statusSchema = z.enum(["open", "recovering", "escalated", "resolved"]);

export function healingRouter(deps: { repo: Repo; h: HealingRepo; engine: HealingEngine }) {
  const { repo, h, engine } = deps;
  const r = Router();

  const idOf = (v: string) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1) throw new HttpError(400, "Invalid id");
    return n;
  };
  const opt = <T>(schema: z.ZodType<T>, v: unknown, name: string): T | undefined => {
    if (v === undefined || v === "") return undefined;
    const p = schema.safeParse(v);
    if (!p.success) throw new HttpError(400, `Invalid ${name}`);
    return p.data;
  };
  const optInt = (v: unknown, name: string) => {
    if (v === undefined || v === "") return undefined;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1) throw new HttpError(400, `Invalid ${name}`);
    return n;
  };

  // Recovery target = a key from the allowlist, never a command
  r.put("/services/:id/recovery-target", (req, res) => {
    const id = idOf(req.params.id);
    if (!repo.getService(id)) throw new HttpError(404, "Service not found");
    const p = targetSchema.safeParse(req.body);
    if (!p.success) throw new HttpError(400, `target must be null or one of: ${ALLOWED_TARGETS.join(", ")}`);
    h.setRecoveryTarget(id, p.data.target);
    h.addLog("info", "api", `Recovery target set to ${p.data.target ?? "none"}`, id);
    res.json(repo.getService(id));
  });

  r.get("/incidents", (req, res) => {
    res.json(
      h.listIncidents({
        status: opt(statusSchema, req.query.status, "status"),
        serviceId: optInt(req.query.service_id, "service_id"),
        limit: optInt(req.query.limit, "limit"),
      })
    );
  });

  r.get("/incidents/:id", (req, res) => {
    const inc = h.getIncident(idOf(req.params.id));
    if (!inc) throw new HttpError(404, "Incident not found");
    res.json({ ...inc, attempts: h.attemptsFor(inc.id), timeline: h.listLogs({ incidentId: inc.id, limit: 500 }) });
  });

  r.get("/logs", (req, res) => {
    res.json(
      h.listLogs({
        level: opt(levelSchema, req.query.level, "level"),
        q: typeof req.query.q === "string" ? req.query.q.slice(0, 100) : undefined,
        serviceId: optInt(req.query.service_id, "service_id"),
        limit: optInt(req.query.limit, "limit"),
      })
    );
  });

  r.get("/healing/status", (_req, res) => {
    res.json(
      repo.listServices().map((s) => ({
        service_id: s.id,
        name: s.name,
        recovery_target: (s as any).recovery_target ?? null,
        ...engine.status(s.id),
      }))
    );
  });

  return r;
}