import { env } from "./config/env";
import { logger } from "./lib/logger";
import { openDb } from "./db/database";
import { createApp } from "./app";

const db = openDb(env.DB_PATH);
const { app, scheduler } = createApp({
  db,
  failureThreshold: env.FAILURE_THRESHOLD,
  defaults: { interval_ms: env.DEFAULT_INTERVAL_MS, timeout_ms: env.DEFAULT_TIMEOUT_MS },
});
if (env.SCHEDULER_ENABLED) scheduler.sync();

const server = app.listen(env.PORT, () => logger.info({ port: env.PORT }, "backend listening"));

function shutdown(signal: string) {
  logger.info({ signal }, "shutting down");
  scheduler.stop();
  server.close(() => {
    db.close();
    logger.info("shutdown complete");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));