import { describe, it, expect, afterEach } from "vitest";
import net from "node:net";
import { spawn } from "node:child_process";
import path from "node:path";
import { LocalProcessWorker } from "../src/healing/worker";

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => { const p = (s.address() as net.AddressInfo).port; s.close(() => resolve(p)); });
  });

let worker: LocalProcessWorker | undefined;
afterEach(async () => { await worker?.stop(); worker = undefined; });

const get = async (port: number) => {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2000) });
    return { status: r.status, body: (await r.json()) as any };
  } catch { return { status: 0, body: null }; }
};

describe("LocalProcessWorker (real demo-app process)", () => {
  it("starts the demo app and it is healthy", async () => {
    const port = await freePort();
    worker = new LocalProcessWorker({ port });
    expect((await worker.start()).ok).toBe(true);
    expect((await get(port)).status).toBe(200);
  });

  it("restart really replaces the process and fixes a failing app", async () => {
    const port = await freePort();
    worker = new LocalProcessWorker({ port });
    await worker.start();
    const pid1 = (await get(port)).body.pid;
    await worker.simulate("fail");
    expect((await get(port)).status).toBe(500);
    expect((await worker.restart("demo-app")).ok).toBe(true);
    const after = await get(port);
    expect(after.status).toBe(200);
    expect(after.body.pid).not.toBe(pid1);
  });

  it("recovers from a crash", async () => {
    const port = await freePort();
    worker = new LocalProcessWorker({ port });
    await worker.start();
    await worker.simulate("crash");
    await new Promise((r) => setTimeout(r, 400));
    expect((await get(port)).status).toBe(0); // connection refused
    expect((await worker.restart("demo-app")).ok).toBe(true);
    expect((await get(port)).status).toBe(200);
  });

  it("rejects anything that is not an allowlisted target", async () => {
    const port = await freePort();
    worker = new LocalProcessWorker({ port });
    const r = await worker.restart("rm -rf /" as any);
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/allowlisted/);
    expect(worker.running).toBe(false); // nothing was started
  });

  it("stop() kills the child", async () => {
    const port = await freePort();
    worker = new LocalProcessWorker({ port });
    await worker.start();
    await worker.stop();
    expect(worker.running).toBe(false);
    expect((await get(port)).status).toBe(0);
  });

  it("gives a clear error when the port is taken by another process", async () => {
    const blocker = net.createServer();
    await new Promise<void>((r) => blocker.listen(0, "127.0.0.1", r));
    const port = (blocker.address() as net.AddressInfo).port;
    worker = new LocalProcessWorker({ port });
    const r = await worker.start();
    blocker.close();
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/already in use/);
  });

  it("the demo app exits by itself if the backend is hard-killed (no orphan)", async () => {
    const port = await freePort();
    const script = path.resolve(__dirname, "../../demo/server.js");
    // a stand-in 'backend' that starts the demo app the same way the worker does
    const parent = spawn(process.execPath, ["-e", `
      const { spawn } = require("node:child_process");
      const c = spawn(process.execPath, [${JSON.stringify(script)}], { env: { ...process.env, DEMO_PORT: "${port}" }, stdio: ["ignore", "pipe", "pipe", "ipc"] });
      c.stdout.on("data", () => console.log("CHILD " + c.pid));
      setInterval(() => {}, 1000);
    `], { stdio: ["ignore", "pipe", "ignore"] });
    const childPid: number = await new Promise((resolve) =>
      parent.stdout!.on("data", (d) => { const m = /CHILD (\d+)/.exec(String(d)); if (m) resolve(Number(m[1])); })
    );
    expect((await get(port)).status).toBe(200);
    parent.kill("SIGKILL"); // hard kill: no shutdown handlers run
    const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
    for (let i = 0; i < 40 && alive(childPid); i++) await new Promise((r) => setTimeout(r, 100));
    expect(alive(childPid)).toBe(false);
    expect((await get(port)).status).toBe(0);
  });
});