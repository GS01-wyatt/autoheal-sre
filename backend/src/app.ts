import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import cors from "cors";
import type { Db } from "./db/database";
import { createRepo } from "./db/repo";
import { Scheduler } from "./monitor/scheduler";
import { apiRouter } from "./routes/api";
import { HttpError } from "./lib/errors";
import { logger } from "./lib/logger";

export function createApp(opts: { db: Db; failureThreshold?: number; defaults?: { interval_ms: number; timeout_ms: number } }) {
  const repo = createRepo(opts.db);
  const scheduler = new Scheduler(repo, logger, opts.failureThreshold ?? 3);
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: ["http://localhost:5173"] }));
  app.use(express.json({ limit: "10kb" }));
  app.use("/api", apiRouter({ db: opts.db, repo, scheduler, defaults: opts.defaults ?? { interval_ms: 30000, timeout_ms: 5000 } }));
  app.use((_req, _res, next) => next(new HttpError(404, "Route not found")));

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof HttpError) return void res.status(err.status).json({ error: err.message });
    if (err?.type === "entity.parse.failed") return void res.status(400).json({ error: "Invalid JSON body" });
    if (err?.type === "entity.too.large") return void res.status(413).json({ error: "Body too large" });
    logger.error({ err }, "unhandled error");
    res.status(500).json({ error: "Internal server error" });
  };
  app.use(onError);
  return { app, repo, scheduler };
}