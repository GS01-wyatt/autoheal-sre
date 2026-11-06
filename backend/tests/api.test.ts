import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { openDb } from "../src/db/database";
import { createApp } from "../src/app";
import { startTarget } from "./helpers";

let t: Awaited<ReturnType<typeof startTarget>>;
let ctx: ReturnType<typeof createApp>;
beforeAll(async () => { t = await startTarget(); });
afterAll(async () => { await t.close(); });
beforeEach(() => { ctx = createApp({ db: openDb(":memory:"), failureThreshold: 3 }); });

const add = (name: string, path = "/ok", extra: object = {}) =>
  request(ctx.app).post("/api/services").send({ name, url: `${t.url}${path}`, ...extra });

describe("API", () => {
  it("GET /api/health", async () => {
    const r = await request(ctx.app).get("/api/health");
    expect(r.status).toBe(200);
    expect(r.body.db).toBe("ok");
  });
  it("creates and lists services with defaults", async () => {
    const c = await add("web");
    expect(c.status).toBe(201);
    expect(c.body.interval_ms).toBe(30000);
    const l = await request(ctx.app).get("/api/services");
    expect(l.body).toHaveLength(1);
  });
  it("validates input (400)", async () => {
    expect((await request(ctx.app).post("/api/services").send({ name: "", url: "nope" })).status).toBe(400);
    expect((await request(ctx.app).post("/api/services").send({ name: "x", url: "ftp://a.com" })).status).toBe(400);
    expect((await add("x", "/ok", { interval_ms: 5 })).status).toBe(400);
  });
  it("rejects invalid JSON (400) and bad id (400)", async () => {
    const r = await request(ctx.app).post("/api/services").set("Content-Type", "application/json").send("{bad");
    expect(r.status).toBe(400);
    expect((await request(ctx.app).get("/api/services/abc")).status).toBe(400);
  });
  it("404 for missing service and unknown route", async () => {
    expect((await request(ctx.app).get("/api/services/999")).status).toBe(404);
    expect((await request(ctx.app).get("/nope")).status).toBe(404);
  });
  it("409 on duplicate name", async () => {
    await add("dup");
    expect((await add("dup")).status).toBe(409);
  });
  it("updates and deletes", async () => {
    const id = (await add("a")).body.id;
    const u = await request(ctx.app).patch(`/api/services/${id}`).send({ enabled: false });
    expect(u.body.enabled).toBe(false);
    expect((await request(ctx.app).delete(`/api/services/${id}`)).status).toBe(204);
    expect((await request(ctx.app).get(`/api/services/${id}`)).status).toBe(404);
  });
  it("manual check stores results; metrics + consecutive failures work", async () => {
    const good = (await add("good", "/ok")).body.id;
    const bad = (await add("bad", "/fail")).body.id;
    for (let i = 0; i < 3; i++) await request(ctx.app).post(`/api/services/${bad}/check`);
    const g = await request(ctx.app).post(`/api/services/${good}/check`);
    expect(g.body.status).toBe("up");

    const m = (await request(ctx.app).get("/api/metrics")).body;
    const mb = m.find((x: any) => x.name === "bad");
    const mg = m.find((x: any) => x.name === "good");
    expect(mb.consecutive_failures).toBe(3);
    expect(mb.uptime_percent).toBe(0);
    expect(mg.uptime_percent).toBe(100);
    expect(mg.avg_response_ms).not.toBeNull();

    const checks = (await request(ctx.app).get(`/api/services/${bad}/checks?limit=2`)).body;
    expect(checks).toHaveLength(2);
  });
  it("consecutive failures reset after a success", async () => {
    const id = (await add("flap", "/fail")).body.id;
    await request(ctx.app).post(`/api/services/${id}/check`);
    await request(ctx.app).patch(`/api/services/${id}`).send({ url: `${t.url}/ok` });
    await request(ctx.app).post(`/api/services/${id}/check`);
    expect(ctx.repo.metrics(id).consecutive_failures).toBe(0);
  });
});