import { Router } from "express";
import { z } from "zod";
import type { Db } from "../db/database";
import type { Repo } from "../db/repo";
import type { Scheduler } from "../monitor/scheduler";
import { HttpError } from "../lib/errors";

const httpUrl = z
  .string()
  .url()
  .refine((u) => /^https?:\/\//i.test(u), "URL must start with http:// or https://");

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  url: httpUrl,
  interval_ms: z.number().int().min(1000).max(3_600_000).optional(),
  timeout_ms: z.number().int().min(100).max(60_000).optional(),
});
const updateSchema = createSchema.partial().extend({ enabled: z.boolean().optional() });

export function apiRouter(deps: {
  db: Db; repo: Repo; scheduler: Scheduler;
  defaults: { interval_ms: number; timeout_ms: number };
}) {
  const { db, repo, scheduler, defaults } = deps;
  const r = Router();

  const idOf = (v: string) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1) throw new HttpError(400, "Invalid id");
    return n;
  };
  const must = (id: number) => {
    const s = repo.getService(id);
    if (!s) throw new HttpError(404, "Service not found");
    return s;
  };
  const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
    const p = schema.safeParse(body);
    if (!p.success) throw new HttpError(400, p.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
    return p.data;
  };
  const isDup = (e: any) => String(e?.code).startsWith("SQLITE_CONSTRAINT");

  r.get("/health", (_req, res) => {
    try {
      db.prepare("SELECT 1").get();
      res.json({ status: "ok", uptime_s: Math.round(process.uptime()), db: "ok", time: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: "degraded", db: "error" });
    }
  });

  r.get("/services", (_req, res) => res.json(repo.listServices()));

  r.post("/services", (req, res) => {
    const b = parse(createSchema, req.body);
    try {
      const s = repo.createService({ ...b, interval_ms: b.interval_ms ?? defaults.interval_ms, timeout_ms: b.timeout_ms ?? defaults.timeout_ms });
      scheduler.sync();
      res.status(201).json(s);
    } catch (e) {
      if (isDup(e)) throw new HttpError(409, "A service with this name already exists");
      throw e;
    }
  });

  r.get("/services/:id", (req, res) => res.json(must(idOf(req.params.id))));

  r.patch("/services/:id", (req, res) => {
    const id = idOf(req.params.id);
    must(id);
    const b = parse(updateSchema, req.body);
    try {
      const s = repo.updateService(id, b);
      scheduler.sync();
      res.json(s);
    } catch (e) {
      if (isDup(e)) throw new HttpError(409, "A service with this name already exists");
      throw e;
    }
  });

  r.delete("/services/:id", (req, res) => {
    const id = idOf(req.params.id);
    must(id);
    repo.deleteService(id);
    scheduler.sync();
    res.status(204).end();
  });

  r.post("/services/:id/check", async (req, res) => {
    const id = idOf(req.params.id);
    must(id);
    res.json(await scheduler.runCheck(id));
  });

  r.get("/services/:id/checks", (req, res) => {
    const id = idOf(req.params.id);
    must(id);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 500);
    res.json(repo.recentChecks(id, limit));
  });

  r.get("/metrics", (_req, res) => {
    res.json(repo.listServices().map((s) => ({ service_id: s.id, name: s.name, ...repo.metrics(s.id) })));
  });

  return r;
}