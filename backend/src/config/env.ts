import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DB_PATH: z.string().default("./data/autoheal.db"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DEFAULT_INTERVAL_MS: z.coerce.number().int().min(1000).default(30000),
  DEFAULT_TIMEOUT_MS: z.coerce.number().int().min(100).default(5000),
  FAILURE_THRESHOLD: z.coerce.number().int().min(1).default(3),
  SCHEDULER_ENABLED: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
});

export type Env = z.infer<typeof schema>;
export const env: Env = schema.parse(process.env);