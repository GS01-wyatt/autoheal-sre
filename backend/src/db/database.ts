import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type Db = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS services (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL UNIQUE,
  url             TEXT NOT NULL,
  interval_ms     INTEGER NOT NULL,
  timeout_ms      INTEGER NOT NULL,
  enabled         INTEGER NOT NULL DEFAULT 1,
  recovery_target TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS health_checks (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id       INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  status           TEXT NOT NULL CHECK (status IN ('up','down')),
  http_status      INTEGER,
  response_time_ms INTEGER NOT NULL,
  error            TEXT,
  checked_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_checks_service_time ON health_checks(service_id, id DESC);
CREATE TABLE IF NOT EXISTS incidents (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id        INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  severity          TEXT NOT NULL,
  status            TEXT NOT NULL,
  opened_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  resolved_at       TEXT,
  recovery_attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_ms   INTEGER
);
CREATE TABLE IF NOT EXISTS recovery_attempts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  service_id  INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  attempt_no  INTEGER NOT NULL,
  action      TEXT NOT NULL,
  outcome     TEXT NOT NULL DEFAULT 'running',
  detail      TEXT,
  started_ms  INTEGER NOT NULL,
  started_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  level       TEXT NOT NULL,
  source      TEXT NOT NULL,
  message     TEXT NOT NULL,
  service_id  INTEGER,
  incident_id INTEGER,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_logs_time ON logs(id DESC);
`;

function addColumn(db: Db, table: string, col: string, def: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}

/** Upgrades databases created by Phase 1 (existing data is kept). */
function migrate(db: Db) {
  addColumn(db, "services", "recovery_target", "TEXT");
  addColumn(db, "incidents", "recovery_attempts", "INTEGER NOT NULL DEFAULT 0");
  addColumn(db, "incidents", "last_attempt_ms", "INTEGER");
  addColumn(db, "logs", "incident_id", "INTEGER");
}

export function openDb(file: string): Db {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  // Old DBs must be migrated BEFORE the schema runs (indexes/tables may reference new columns)
  const hasServices = db.prepare("SELECT name FROM sqlite_master WHERE name='services'").get();
  if (hasServices) migrate(db);
  db.exec(SCHEMA);
  migrate(db);
  return db;
}