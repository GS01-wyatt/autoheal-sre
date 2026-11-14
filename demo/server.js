// AutoHeal demo target. Plain Node, no dependencies. Listens on localhost only.
const http = require("node:http");

const PORT = Number(process.env.DEMO_PORT || 5055);
const startedAt = new Date().toISOString();
let mode = "healthy"; // healthy | fail | slow

const server = http.createServer((req, res) => {
  const send = (code, obj) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(obj));
  };

  if (req.method === "GET" && req.url === "/health") {
    if (mode === "fail") return send(500, { status: "error", mode, pid: process.pid });
    if (mode === "slow") return void setTimeout(() => send(200, { status: "slow", pid: process.pid }), 8000);
    return send(200, { status: "ok", pid: process.pid, startedAt });
  }

  if (req.method === "POST" && req.url === "/__sim") {
    let body = "";
    req.on("data", (c) => { if (body.length < 1024) body += c; });
    req.on("end", () => {
      let m;
      try { m = JSON.parse(body).mode; } catch { return send(400, { error: "bad json" }); }
      if (m === "crash") {
        send(202, { ok: true, mode: "crash" });
        return void setTimeout(() => process.exit(1), 50);
      }
      if (m === "fail" || m === "slow" || m === "healthy") { mode = m; return send(200, { ok: true, mode }); }
      send(400, { error: "unknown mode" });
    });
    return;
  }
  send(404, { error: "not found" });
});

server.on("error", (e) => {
  console.error(`demo-app cannot listen on ${PORT}: ${e.code || e.message}`);
  process.exit(1);
});
server.listen(PORT, "127.0.0.1", () => console.log(`READY ${PORT}`));

// If the backend that started us dies (even if it is hard-killed), exit too: no orphan processes.
if (process.send) process.on("disconnect", () => process.exit(0));

const stop = () => { server.close(); process.exit(0); };
process.on("SIGTERM", stop);
process.on("SIGINT", stop);