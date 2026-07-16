import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { ActivityLog } from "../../core/activity-log.js";
import type { RegisterScenarioInput, StateStore, UpdateScenarioInput } from "../../core/state-store.js";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * Local control API for the scenario StateStore living inside the user's app process.
 * dashboard-ui talks to this directly (CORS-open, localhost-only by convention) — the
 * dashboard-server process only serves static UI files, it does not proxy this API.
 */
export function createControlApi(store: StateStore, activityLog?: ActivityLog): Server {
  return createServer((req, res) => {
    void handleRequest(req, res, store, activityLog);
  });
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  store: StateStore,
  activityLog?: ActivityLog,
): Promise<void> {
  for (const [key, value] of Object.entries(CORS_HEADERS)) res.setHeader(key, value);

  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  const url = new URL(req.url ?? "/", "http://localhost");
  const segments = url.pathname.split("/").filter(Boolean);

  try {
    if (segments[0] !== "api") {
      notFound(res);
      return;
    }

    if (segments[1] === "activity" && segments.length === 2 && req.method === "GET") {
      const limitParam = url.searchParams.get("limit");
      sendJson(res, 200, activityLog?.list(limitParam ? Number(limitParam) : undefined) ?? []);
      return;
    }

    if (segments[1] !== "scenarios") {
      notFound(res);
      return;
    }

    if (segments.length === 2 && req.method === "GET") {
      sendJson(res, 200, store.list());
      return;
    }

    if (segments.length === 2 && req.method === "POST") {
      const body = await readJsonBody<RegisterScenarioInput>(req);
      sendJson(res, 201, store.register(body));
      return;
    }

    if (segments.length === 3 && req.method === "PATCH") {
      const body = await readJsonBody<UpdateScenarioInput>(req);
      const updated = store.update(segments[2], body);
      if (!updated) {
        notFound(res);
        return;
      }
      sendJson(res, 200, updated);
      return;
    }

    if (segments.length === 3 && req.method === "DELETE") {
      const removed = store.remove(segments[2]);
      if (!removed) {
        notFound(res);
        return;
      }
      res.writeHead(204).end();
      return;
    }

    notFound(res);
  } catch (error) {
    sendJson(res, 400, { error: (error as Error).message });
  }
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function notFound(res: ServerResponse): void {
  sendJson(res, 404, { error: "not found" });
}

function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw) {
        resolve({} as T);
        return;
      }
      try {
        resolve(JSON.parse(raw) as T);
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}
