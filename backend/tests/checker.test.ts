import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { checkUrl } from "../src/monitor/checker";
import { startTarget } from "./helpers";

let t: Awaited<ReturnType<typeof startTarget>>;
beforeAll(async () => { t = await startTarget(); });
afterAll(async () => { await t.close(); });

describe("checkUrl", () => {
  it("healthy: 200 is up", async () => {
    const r = await checkUrl(`${t.url}/ok`, 2000);
    expect(r.status).toBe("up");
    expect(r.httpStatus).toBe(200);
    expect(r.error).toBeNull();
  });
  it("unhealthy: 500 is down", async () => {
    const r = await checkUrl(`${t.url}/fail`, 2000);
    expect(r.status).toBe("down");
    expect(r.httpStatus).toBe(500);
  });
  it("timeout: slow response is down with timeout error", async () => {
    const r = await checkUrl(`${t.url}/slow`, 300);
    expect(r.status).toBe("down");
    expect(r.httpStatus).toBeNull();
    expect(r.error).toMatch(/Timeout/);
    expect(r.responseTimeMs).toBeLessThan(1200);
  });
  it("connection refused is down", async () => {
    const r = await checkUrl("http://127.0.0.1:1", 1000);
    expect(r.status).toBe("down");
    expect(r.httpStatus).toBeNull();
  });
});