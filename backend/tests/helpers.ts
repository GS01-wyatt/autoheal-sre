import http from "node:http";
import type { AddressInfo } from "node:net";

/** Tiny fake target: /ok -> 200, /fail -> 500, /slow -> responds after 1500ms */
export function startTarget(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    if (req.url === "/ok") { res.writeHead(200); res.end("ok"); }
    else if (req.url === "/fail") { res.writeHead(500); res.end("boom"); }
    else if (req.url === "/slow") { setTimeout(() => { res.writeHead(200); res.end("late"); }, 1500); }
    else { res.writeHead(404); res.end(); }
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }),
      });
    })
  );
}