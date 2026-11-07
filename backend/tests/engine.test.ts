import { describe, it, expect, beforeEach } from "vitest";
import pino from "pino";
import { openDb } from "../src/db/database";
import { createRepo } from "../src/db/repo";
import { createHealingRepo } from "../src/db/healing-repo";
import { HealingEngine, type RecoveryWorker } from "../src/healing/engine";
import type { CheckResult } from "../src/monitor/checker";

const DOWN: CheckResult = { status: "down", httpStatus: 500, responseTimeMs: 5, error: "HTTP 500" };
const UP: CheckResult = { status: "up", httpStatus: 200, responseTimeMs: 5, error: null };

let clock = 0;
let verifyResult: CheckResult;
let restarts: string[];
let workerImpl: (t: string) => Promise<{ ok: boolean; detail: string }>;

function setup(over: Partial<ConstructorParameters<typeof HealingEngine>[3]> = {}) {
  const db = openDb(":memory:");
  const repo = createRepo(db);
  const h = createHealingRepo(db);
  const worker: RecoveryWorker = { restart: (t) => { restarts.push(t); return workerImpl(t); } };
  const engine = new HealingEngine(
    repo, h, pino({ level: "silent" }),
    { failureThreshold: 3, maxRetries: 2, cooldownMs: 1000, verifyDelayMs: 0, maxRestartsPerHour: 100,
      now: () => clock, sleep: async () => {}, check: async () => verifyResult, ...over },
    worker
  );
  const svc = repo.createService({ name: "web", url: "http://x.invalid", interval_ms: 1000, timeout_ms: 1000 });
  h.setRecoveryTarget(svc.id, "demo-app");
  const fail = async () => { repo.insertCheck(svc.id, DOWN); await engine.handleResult(svc.id, DOWN); };
  const pass = async () => { repo.insertCheck(svc.id, UP); await engine.handleResult(svc.id, UP); };
  return { repo, h, engine, svc, fail, pass };
}

beforeEach(() => {
  clock = 1_000_000;
  verifyResult = UP;
  restarts = [];
  workerImpl = async () => ({ ok: true, detail: "restarted" });
});

describe("HealingEngine", () => {
  it("does nothing below the failure threshold", async () => {
    const s = setup();
    await s.fail(); await s.fail();
    expect(s.h.listIncidents({})).toHaveLength(0);
    expect(restarts).toHaveLength(0);
  });

  it("opens an incident at the threshold and recovers + verifies", async () => {
    const s = setup();
    await s.fail(); await s.fail(); await s.fail();
    const inc: any = s.h.listIncidents({})[0];
    expect(inc.status).toBe("resolved");
    expect(restarts).toEqual(["demo-app"]);
    const attempts: any[] = s.h.attemptsFor(inc.id);
    expect(attempts).toHaveLength(1);
    expect(attempts[0].outcome).toBe("success");
    expect(s.repo.consecutiveFailures(s.svc.id)).toBe(0); // verification check was stored
  });

  it("without a recovery target the incident stays open and nothing is restarted", async () => {
    const s = setup();
    s.h.setRecoveryTarget(s.svc.id, null);
    await s.fail(); await s.fail(); await s.fail(); await s.fail();
    const inc: any = s.h.listIncidents({})[0];
    expect(inc.status).toBe("open");
    expect(restarts).toHaveLength(0);
  });

  it("a failed verification is recorded and cooldown blocks the next attempt", async () => {
    verifyResult = DOWN;
    const s = setup();
    await s.fail(); await s.fail(); await s.fail();       // attempt 1 fails
    expect(restarts).toHaveLength(1);
    await s.fail();                                        // still cooling down
    expect(restarts).toHaveLength(1);
    expect(s.engine.status(s.svc.id).cooldown_remaining_ms).toBeGreaterThan(0);
    clock += 1500;                                         // cooldown over
    await s.fail();
    expect(restarts).toHaveLength(2);
  });

  it("escalates at the retry limit and never restarts again", async () => {
    verifyResult = DOWN;
    const s = setup();
    await s.fail(); await s.fail(); await s.fail();        // attempt 1
    clock += 1500; await s.fail();                         // attempt 2 -> limit
    const inc: any = s.h.listIncidents({})[0];
    expect(inc.status).toBe("escalated");
    expect(inc.severity).toBe("critical");
    for (let i = 0; i < 5; i++) { clock += 5000; await s.fail(); }
    expect(restarts).toHaveLength(2);                      // no infinite restart loop
  });

  it("worker error is recorded as a failed attempt and does not crash", async () => {
    workerImpl = async () => { throw new Error("boom"); };
    const s = setup();
    await s.fail(); await s.fail(); await s.fail();
    const inc: any = s.h.listIncidents({})[0];
    const attempts: any[] = s.h.attemptsFor(inc.id);
    expect(attempts[0].outcome).toBe("failed");
    expect(attempts[0].detail).toMatch(/boom/);
    expect(inc.status).toBe("open");
  });

  it("worker reporting ok=false counts as failed", async () => {
    workerImpl = async () => ({ ok: false, detail: "not allowed" });
    const s = setup();
    await s.fail(); await s.fail(); await s.fail();
    expect((s.h.attemptsFor((s.h.listIncidents({})[0] as any).id) as any[])[0].outcome).toBe("failed");
  });

  it("an open incident resolves by itself when the service becomes healthy", async () => {
    const s = setup();
    s.h.setRecoveryTarget(s.svc.id, null);
    await s.fail(); await s.fail(); await s.fail();
    await s.pass();
    expect((s.h.listIncidents({})[0] as any).status).toBe("resolved");
  });

  it("concurrent failures start only one restart", async () => {
    let release!: () => void;
    workerImpl = () => new Promise((r) => { release = () => r({ ok: true, detail: "ok" }); });
    const s = setup();
    await s.fail(); await s.fail();
    s.repo.insertCheck(s.svc.id, DOWN);
    const p1 = s.engine.handleResult(s.svc.id, DOWN);
    s.repo.insertCheck(s.svc.id, DOWN);
    const p2 = s.engine.handleResult(s.svc.id, DOWN);
    await p2;
    release();
    await p1;
    expect(restarts).toHaveLength(1);
  });

  it("flap protection: hourly restart cap escalates instead of restarting", async () => {
    const s = setup({ maxRestartsPerHour: 2 });
    for (let round = 0; round < 3; round++) {
      await s.fail(); await s.fail(); await s.fail();
      clock += 10;
    }
    expect(restarts).toHaveLength(2);
    expect((s.h.listIncidents({})[0] as any).status).toBe("escalated");
  });

  it("logs every recovery step on the incident timeline", async () => {
    const s = setup();
    await s.fail(); await s.fail(); await s.fail();
    const id = (s.h.listIncidents({})[0] as any).id;
    const msgs = (s.h.listLogs({ incidentId: id }) as any[]).map((l) => l.message).join(" | ");
    expect(msgs).toMatch(/Incident opened/);
    expect(msgs).toMatch(/restarting demo-app/);
    expect(msgs).toMatch(/Recovered on attempt 1/);
  });
});