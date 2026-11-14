import { env } from "./config/env";
import { logger } from "./lib/logger";
import { openDb } from "./db/database";
import { createApp } from "./app";
import { LocalProcessWorker } from "./healing/worker";

const db = openDb(env.DB_PATH);

// The restart worker and the failure simulator exist ONLY in DEMO_MODE.
const demoWorker = env.DEMO_MODE ? new LocalProcessWorker({ port: env.DEMO_PORT, log: logger }) : undefined;

const { app, scheduler } = createApp({
  db,
  failureThreshold: env.FAILURE_THRESHOLD,
  defaults: { interval_ms: env.DEFAULT_INTERVAL_MS, timeout_ms: env.DEFAULT_TIMEOUT_MS },
  engine: {
    maxRetries: env.MAX_RECOVERY_RETRIES,
    cooldownMs: env.RECOVERY_COOLDOWN_MS,
    verifyDelayMs: env.VERIFY_DELAY_MS,
    maxRestartsPerHour: env.MAX_RESTARTS_PER_HOUR,
  },
  worker: demoWorker,
  simulator: demoWorker,
});

async function main() {
  if (demoWorker) {
    const r = await demoWorker.start();
    logger.info({ ok: r.ok, detail: r.detail, port: env.DEMO_PORT }, "demo mode: demo-app");
  }
  if (env.SCHEDULER_ENABLED) scheduler.sync();
}

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, demoMode: env.DEMO_MODE }, "backend listening");
  void main();
});

function shutdown(signal: string) {
  logger.info({ signal }, "shutting down");
  scheduler.stop();
  server.close(async () => {
    await demoWorker?.stop();
    db.close();
    logger.info("shutdown complete");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));