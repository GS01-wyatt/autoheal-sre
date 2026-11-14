import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import cors from "cors";
import type { Db } from "./db/database";
import { createRepo } from "./db/repo";
import { createHealingRepo } from "./db/healing-repo";
import { Scheduler } from "./monitor/scheduler";
import { HealingEngine, type EngineOptions, type RecoveryWorker } from "./healing/engine";
import { apiRouter } from "./routes/api";
import { healingRouter } from "./routes/healing";
import { simulateRouter, type Simulator } from "./routes/simulate";
import { HttpError } from "./lib/errors";
import { logger } from "./lib/logger";

export interface AppOptions {
  db: Db;
  failureThreshold?: number;
  defaults?: { interval_ms: number; timeout_ms: number };
  engine?: Partial<EngineOptions>;
  worker?: RecoveryWorker;
  simulator?: Simulator; // only provided in DEMO_MODE
}

export function createApp(opts: AppOptions) {
  const repo = createRepo(opts.db);
  const h = createHealingRepo(opts.db);
  const threshold = opts.failureThreshold ?? 3;
  const engine = new HealingEngine(repo, h, logger, { failureThreshold: threshold, ...opts.engine }, opts.worker);
  const scheduler = new Scheduler(repo, logger, threshold, (id, result) => {
    void engine.handleResult(id, result).catch((err) => logger.error({ err }, "healing engine crashed"));
  });

  const app = express();
  app.use(helmet());
  app.use(cors({ origin: ["http://localhost:5173"] }));
  app.use(express.json({ limit: "10kb" }));
  const defaults = opts.defaults ?? { interval_ms: 30000, timeout_ms: 5000 };
  app.use("/api", apiRouter({ db: opts.db, repo, scheduler, defaults }));
  app.use("/api", healingRouter({ repo, h, engine }));
  if (opts.simulator) app.use("/api", simulateRouter({ h, simulator: opts.simulator }));
  app.use((_req, _res, next) => next(new HttpError(404, "Route not found")));

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof HttpError) return void res.status(err.status).json({ error: err.message });
    if (err?.type === "entity.parse.failed") return void res.status(400).json({ error: "Invalid JSON body" });
    if (err?.type === "entity.too.large") return void res.status(413).json({ error: "Body too large" });
    logger.error({ err }, "unhandled error");
    res.status(500).json({ error: "Internal server error" });
  };
  app.use(onError);
  return { app, repo, h, scheduler, engine };
}