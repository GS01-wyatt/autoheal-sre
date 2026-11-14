import { describe, it, expect, afterAll } from "vitest";
import net from "node:net";
import request from "supertest";
import { openDb } from "../src/db/database";
import { createApp } from "../src/app";
import { LocalProcessWorker } from "../src/healing/worker";

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => { const p = (s.address() as net.AddressInfo).port; s.close(() => resolve(p)); });
  });

const worker: { w?: LocalProcessWorker } = {};
afterAll(async () => { await worker.w?.stop(); });

async function waitFor<T>(fn: () => Promise<T | undefined>, ms = 10000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v !== undefined) return v;
    if (Date.now() > end) throw new Error("timeout waiting for condition");
    await new Promise((r) => setTimeout(r, 100));
  }
}

describe("end-to-end auto-healing with a real process", () => {
  it("failure -> incident -> restart -> verified -> resolved", async () => {
    const port = await freePort();
    const w = (worker.w = new LocalProcessWorker({ port }));
    await w.start();
    const ctx = createApp({
      db: openDb(":memory:"),
      failureThreshold: 2,
      engine: { cooldownMs: 100, verifyDelayMs: 100, maxRetries: 3 },
      worker: w,
      simulator: w,
    });
    const api = request(ctx.app);

    const id = (await api.post("/api/services").send({ name: "Demo App", url: `http://127.0.0.1:${port}/health`, timeout_ms: 1000 })).body.id;
    expect((await api.put(`/api/services/${id}/recovery-target`).send({ target: "demo-app" })).status).toBe(200);
    expect((await api.post(`/api/services/${id}/check`)).body.status).toBe("up");

    expect((await api.post("/api/simulate/demo-app").send({ mode: "fail" })).status).toBe(200);
    await api.post(`/api/services/${id}/check`); // fail 1
    await api.post(`/api/services/${id}/check`); // fail 2 -> threshold -> incident + recovery

    const resolved = await waitFor(async () => {
      const list = (await api.get("/api/incidents?status=resolved")).body;
      return list.length ? list[0] : undefined;
    });
    const detail = (await api.get(`/api/incidents/${resolved.id}`)).body;
    expect(detail.attempts).toHaveLength(1);
    expect(detail.attempts[0].outcome).toBe("success");
    expect(detail.timeline.map((l: any) => l.message).join(" | ")).toMatch(/Recovered on attempt 1/);
    expect((await api.post(`/api/services/${id}/check`)).body.status).toBe("up");
  }, 20000);

  it("simulate endpoint rejects bad input and is absent without a simulator", async () => {
    const withSim = request(createApp({ db: openDb(":memory:"), simulator: { simulate: async () => ({ ok: true, detail: "x" }) } }).app);
    expect((await withSim.post("/api/simulate/rm -rf").send({ mode: "fail" })).status).toBe(400);
    expect((await withSim.post("/api/simulate/demo-app").send({ mode: "format-disk" })).status).toBe(400);
    const without = request(createApp({ db: openDb(":memory:") }).app);
    expect((await without.post("/api/simulate/demo-app").send({ mode: "fail" })).status).toBe(404);
  });
});