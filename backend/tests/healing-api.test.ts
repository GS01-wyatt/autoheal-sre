import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDb } from "../src/db/database";
import { createApp } from "../src/app";
import { startTarget } from "./helpers";

let t: Awaited<ReturnType<typeof startTarget>>;
let ctx: ReturnType<typeof createApp>;
beforeAll(async () => { t = await startTarget(); });
afterAll(async () => { await t.close(); });
beforeEach(() => { ctx = createApp({ db: openDb(":memory:"), failureThreshold: 3 }); });

const add = (name: string, p = "/ok") => request(ctx.app).post("/api/services").send({ name, url: `${t.url}${p}` });

describe("healing API", () => {
  it("recovery-target accepts only allowlisted keys", async () => {
    const id = (await add("a")).body.id;
    const put = (target: unknown) => request(ctx.app).put(`/api/services/${id}/recovery-target`).send({ target });
    expect((await put("demo-app")).body.recovery_target).toBe("demo-app");
    expect((await put("rm -rf /")).status).toBe(400);
    expect((await put("powershell -c calc")).status).toBe(400);
    expect((await put(null)).body.recovery_target).toBeNull();
    expect((await request(ctx.app).put("/api/services/999/recovery-target").send({ target: null })).status).toBe(404);
  });

  it("incident lifecycle is visible through the API", async () => {
    const id = (await add("bad", "/fail")).body.id;
    for (let i = 0; i < 3; i++) await request(ctx.app).post(`/api/services/${id}/check`);
    const list = (await request(ctx.app).get("/api/incidents?status=open")).body;
    expect(list).toHaveLength(1);
    expect(list[0].service_name).toBe("bad");

    const detail = (await request(ctx.app).get(`/api/incidents/${list[0].id}`)).body;
    expect(detail.timeline.length).toBeGreaterThan(0);

    await request(ctx.app).patch(`/api/services/${id}`).send({ url: `${t.url}/ok` });
    await request(ctx.app).post(`/api/services/${id}/check`);
    expect((await request(ctx.app).get("/api/incidents?status=resolved")).body).toHaveLength(1);
  });

  it("logs can be filtered and searched; bad filters return 400", async () => {
    const id = (await add("bad", "/fail")).body.id;
    for (let i = 0; i < 3; i++) await request(ctx.app).post(`/api/services/${id}/check`);
    expect((await request(ctx.app).get("/api/logs?level=warn")).body.length).toBeGreaterThan(0);
    expect((await request(ctx.app).get("/api/logs?q=Incident")).body.length).toBeGreaterThan(0);
    expect((await request(ctx.app).get("/api/logs?q=zzzz-nothing")).body).toHaveLength(0);
    expect((await request(ctx.app).get("/api/logs?level=nope")).status).toBe(400);
    expect((await request(ctx.app).get("/api/incidents/abc")).status).toBe(400);
    expect((await request(ctx.app).get("/api/incidents/999")).status).toBe(404);
  });

  it("healing status exposes cooldown/attempt fields per service", async () => {
    await add("a");
    const s = (await request(ctx.app).get("/api/healing/status")).body;
    expect(s[0]).toMatchObject({ name: "a", attempts_used: 0, max_retries: 3, total_restarts: 0, recovery_target: null });
  });
});

describe("migration from Phase 1 database", () => {
  it("keeps existing data and adds the new columns", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ah-")), "old.db");
    const old = new Database(file);
    old.exec(`
      CREATE TABLE services (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, url TEXT NOT NULL,
        interval_ms INTEGER NOT NULL, timeout_ms INTEGER NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
      CREATE TABLE incidents (id INTEGER PRIMARY KEY AUTOINCREMENT, service_id INTEGER NOT NULL, severity TEXT NOT NULL,
        status TEXT NOT NULL, opened_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), resolved_at TEXT);
      CREATE TABLE logs (id INTEGER PRIMARY KEY AUTOINCREMENT, level TEXT NOT NULL, source TEXT NOT NULL, message TEXT NOT NULL,
        service_id INTEGER, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
      INSERT INTO services (name,url,interval_ms,timeout_ms) VALUES ('Google','https://www.google.com',30000,5000);
    `);
    old.close();
    const db = openDb(file);
    const cols = (tbl: string) => (db.prepare(`PRAGMA table_info(${tbl})`).all() as any[]).map((c) => c.name);
    expect(cols("services")).toContain("recovery_target");
    expect(cols("incidents")).toContain("recovery_attempts");
    expect(cols("logs")).toContain("incident_id");
    expect((db.prepare("SELECT name FROM services").get() as any).name).toBe("Google");
    db.close();
  });
});
describe("info endpoint", () => {
  it("reports settings and demo mode without exposing anything sensitive", async () => {
    const plain = request(createApp({ db: openDb(":memory:") }).app);
    const a = (await plain.get("/api/info")).body;
    expect(a).toMatchObject({ app: "autoheal-sre", demo_mode: false, failure_threshold: 3, allowed_targets: ["demo-app"] });
    const demo = request(createApp({ db: openDb(":memory:"), simulator: { simulate: async () => ({ ok: true, detail: "x" }) } }).app);
    expect((await demo.get("/api/info")).body.demo_mode).toBe(true);
  });
});
