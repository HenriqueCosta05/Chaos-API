import { createServer, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { warnOnPortCollision } from "../../core/safe-listen.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UI_DIR = path.join(__dirname, "..", "ui");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

export interface StartDashboardOptions {
  port?: number;
  /** Bind address. Default `"127.0.0.1"` — set to `"0.0.0.0"` to expose it beyond localhost. */
  host?: string;
}

/**
 * Serves the static dashboard-ui. This process does not hold any scenario state —
 * dashboard-ui talks directly to the control API running inside the target app
 * (see src/dashboard/server/control-api.ts and docs/architecture-and-walkthrough.md).
 */
export function startDashboard(options: StartDashboardOptions = {}): Server {
  const port = options.port ?? 4000;
  const host = options.host ?? "127.0.0.1";
  const server = createServer((req, res) => {
    void serveStatic(req.url ?? "/", res);
  });
  server.listen(port, host, () => {
    console.log(`[chaos-api] dashboard running at http://${host}:${port}/dashboard`);
  });
  return warnOnPortCollision(server, "dashboard server", port, host);
}

async function serveStatic(url: string, res: ServerResponse): Promise<void> {
  let pathname = url.split("?")[0];
  if (pathname === "/" || pathname === "/dashboard" || pathname === "/dashboard/") {
    pathname = "/index.html";
  } else if (pathname.startsWith("/dashboard/")) {
    pathname = pathname.slice("/dashboard".length);
  }

  const filePath = path.join(UI_DIR, pathname);
  if (!filePath.startsWith(UI_DIR)) {
    res.writeHead(403).end();
    return;
  }

  try {
    const content = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
    res.end(content);
  } catch {
    res.writeHead(404).end("Not found");
  }
}
