/**
 * Local API server: runs the exact Vercel handlers in /api on http://localhost:8787 (Vite proxies /api here).
 * Usage: terminal 1 `npm run dev:api`, terminal 2 `npm run dev`. No Vercel login needed.
 */
import { createServer, type IncomingMessage } from "node:http";

type Handler = (request: Request) => Response | Promise<Response>;
interface ApiModule {
  GET?: Handler;
  POST?: Handler;
}

try {
  process.loadEnvFile(".env.local");
} catch {
  console.warn("[dev-api] No .env.local found - live mode needs NEBIUS_API_KEY (replay still works once recorded).");
}

const ROUTES: Record<string, () => Promise<ApiModule>> = {
  "/api/plan": () => import("../api/plan.js"),
  "/api/health": () => import("../api/health.js"),
};

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      data += chunk;
      if (data.length > 100_000) req.destroy(new Error("Body too large"));
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const PORT = Number(process.env.API_PORT ?? 8787);

createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    const load = ROUTES[url.pathname];
    if (!load) {
      res.writeHead(404, { "content-type": "application/json" }).end('{"code":"NOT_FOUND"}');
      return;
    }
    const mod = await load();
    const handler = req.method === "POST" ? mod.POST : req.method === "GET" ? mod.GET : undefined;
    if (!handler) {
      res.writeHead(405).end();
      return;
    }
    const ac = new AbortController();
    res.on("close", () => {
      if (!res.writableFinished) ac.abort();
    });
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === "string") headers.set(k, v);
      else if (Array.isArray(v)) headers.set(k, v.join(", "));
    }
    const init: RequestInit = { method: req.method ?? "GET", headers, signal: ac.signal };
    if (req.method === "POST") init.body = await readBody(req);
    const response = await handler(new Request(url, init));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (!response.body) {
      res.end();
      return;
    }
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  })().catch((err: unknown) => {
    console.error("[dev-api] handler crashed:", err);
    if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
    res.end('{"code":"INTERNAL"}');
  });
}).listen(PORT, () => console.log(`[dev-api] http://localhost:${PORT}  (POST /api/plan, GET /api/health)`));
