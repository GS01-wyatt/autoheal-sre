import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import path from "node:path";
import type { Logger } from "pino";
import type { RecoveryWorker } from "./engine";
import { isAllowedTarget, type AllowedTarget } from "./allowlist";

export type SimMode = "fail" | "slow" | "crash" | "heal";

export interface LocalWorkerOptions {
  port: number;
  /** Fixed script. Never taken from an API request. */
  scriptPath?: string;
  readyTimeoutMs?: number;
  killTimeoutMs?: number;
  log?: Logger;
}

const DEFAULT_SCRIPT = path.resolve(__dirname, "../../../demo/server.js");

/**
 * Restricted recovery worker. It can only (re)start ONE fixed script, as a child process,
 * with no shell and no arguments. The only input it accepts is an allowlisted target key.
 */
export class LocalProcessWorker implements RecoveryWorker {
  private child?: ChildProcess;
  private readonly script: string;
  private readonly readyTimeoutMs: number;
  private readonly killTimeoutMs: number;

  constructor(private opts: LocalWorkerOptions) {
    this.script = opts.scriptPath ?? DEFAULT_SCRIPT;
    this.readyTimeoutMs = opts.readyTimeoutMs ?? 5000;
    this.killTimeoutMs = opts.killTimeoutMs ?? 3000;
  }

  get running() {
    return !!this.child && this.child.exitCode === null && this.child.signalCode === null;
  }

  private portInUse(): Promise<boolean> {
    return new Promise((resolve) => {
      const s = net.createServer();
      s.once("error", (e: NodeJS.ErrnoException) => resolve(e.code === "EADDRINUSE"));
      s.once("listening", () => s.close(() => resolve(false)));
      s.listen(this.opts.port, "127.0.0.1");
    });
  }

  async start(): Promise<{ ok: boolean; detail: string }> {
    if (this.running) return { ok: true, detail: "already running" };
    // The port may take a moment to free up right after we killed the previous process
    let busy = await this.portInUse();
    for (let i = 0; busy && i < 10; i++) { await new Promise((r) => setTimeout(r, 200)); busy = await this.portInUse(); }
    if (busy) return { ok: false, detail: `port ${this.opts.port} is already in use by another process` };

    // 'ipc' channel: the child exits by itself if this process dies, so no orphan is left behind
    const c = spawn(process.execPath, [this.script], {
      env: { ...process.env, DEMO_PORT: String(this.opts.port) },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      shell: false,
      windowsHide: true,
    });
    this.child = c;
    let errTail = "";
    c.stderr?.on("data", (d) => {
      errTail = String(d).trim().slice(-200);
      this.opts.log?.warn({ out: errTail }, "demo-app stderr");
    });
    c.on("exit", () => { if (this.child === c) this.child = undefined; });

    return new Promise((resolve) => {
      let done = false;
      const finish = (r: { ok: boolean; detail: string }) => { if (!done) { done = true; clearTimeout(timer); resolve(r); } };
      const timer = setTimeout(() => finish({ ok: false, detail: "demo-app did not become ready in time" }), this.readyTimeoutMs);
      c.stdout?.on("data", (d) => { if (String(d).includes("READY")) finish({ ok: true, detail: `demo-app started (pid ${c.pid})` }); });
      c.once("exit", (code) => finish({ ok: false, detail: `demo-app exited early (code ${code})${errTail ? `: ${errTail}` : ""}` }));
      c.once("error", (e) => finish({ ok: false, detail: `spawn failed: ${e.message}` }));
    });
  }

  async stop(): Promise<void> {
    const c = this.child;
    this.child = undefined;
    if (!c || c.exitCode !== null || c.signalCode !== null) return;
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => c.kill("SIGKILL"), this.killTimeoutMs);
      c.once("exit", () => { clearTimeout(t); resolve(); });
      c.kill();
    });
  }

  async restart(target: AllowedTarget): Promise<{ ok: boolean; detail: string }> {
    if (!isAllowedTarget(target) || target !== "demo-app") return { ok: false, detail: "Target is not allowlisted" };
    await this.stop();
    return this.start();
  }

  /** Failure simulation for demos. Talks to the demo app on localhost only. */
  async simulate(mode: SimMode): Promise<{ ok: boolean; detail: string }> {
    const m = mode === "heal" ? "healthy" : mode;
    try {
      const res = await fetch(`http://127.0.0.1:${this.opts.port}/__sim`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: m }),
        signal: AbortSignal.timeout(2000),
      });
      return res.ok ? { ok: true, detail: `demo-app set to ${mode}` } : { ok: false, detail: `demo-app answered HTTP ${res.status}` };
    } catch (e: any) {
      return { ok: false, detail: `demo-app not reachable (${e?.cause?.code ?? e?.message})` };
    }
  }
}