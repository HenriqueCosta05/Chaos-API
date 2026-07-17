import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { ActivityLog } from "../../core/activity-log.js";
import type { RegisterScenarioInput, StateStore, UpdateScenarioInput } from "../../core/state-store.js";
import { applyPreset, findPreset, listPresets, type ApplyPresetOverrides, type PresetCategory } from "../../presets/index.js";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export interface ControlApiOptions {
  /** `Access-Control-Allow-Origin` value. Default `"*"` (dashboard-ui may run on any origin/port). */
  corsOrigin?: string;
}

export type ControlApiNext = (err?: unknown) => void;

/** Resource names this control API owns — anything else isn't ours (see `isControlApiRoute` below). */
const KNOWN_RESOURCES = ["scenarios", "activity", "presets", "config"];

/**
 * Local control API for the scenario StateStore living inside the user's app process.
 * dashboard-ui talks to this directly (CORS-open, localhost-only by convention) — the
 * dashboard-server process only serves static UI files, it does not proxy this API.
 *
 * Runs as its own `http.Server` on `controlPort`. If you'd rather not open a second port,
 * see `createControlApiMiddleware` — it mounts these same routes onto the host app's own
 * server/port instead.
 */
export function createControlApi(store: StateStore, activityLog?: ActivityLog, options: ControlApiOptions = {}): Server {
  const corsOrigin = options.corsOrigin ?? "*";
  return createServer((req, res) => {
    void handleControlApiRequest(req, res, store, activityLog, corsOrigin);
  });
}

export type ControlApiMiddleware = (req: IncomingMessage, res: ServerResponse, next: ControlApiNext) => void;

/**
 * Express/Nest-compatible middleware (`(req, res, next)`) that serves the same routes as
 * `createControlApi`, but mounted directly onto the host app's own server — no extra port.
 * Calls `next()` untouched for any request that isn't one of ours, so it can sit alongside the
 * host's real routes: `app.use(createControlApiMiddleware(store, activityLog))`.
 *
 * For Fastify/Koa, use `createControlApiFastifyPlugin` / `createControlApiKoaMiddleware` instead —
 * their request/response objects aren't raw `http.IncomingMessage`/`ServerResponse`.
 */
export function createControlApiMiddleware(
  store: StateStore,
  activityLog?: ActivityLog,
  options: ControlApiOptions = {},
): ControlApiMiddleware {
  const corsOrigin = options.corsOrigin ?? "*";
  return (req, res, next) => {
    void handleControlApiRequest(req, res, store, activityLog, corsOrigin, next);
  };
}

/**
 * True if `pathname` targets one of this control API's own resources, wherever it's mounted.
 * Exported so the Fastify/Koa wrappers (which can't rely on an Express-style `next`) can decide
 * up front whether a request is ours before touching their request/response objects.
 */
export function isControlApiRoute(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  const apiIndex = segments.lastIndexOf("api");
  return apiIndex !== -1 && KNOWN_RESOURCES.includes(segments[apiIndex + 1] ?? "");
}

/**
 * Handles one control API request against raw Node req/res. Exported for framework wrappers
 * (Fastify's `request.raw`/`reply.raw`, Koa's `ctx.req`/`ctx.res`) that already know — via
 * `isControlApiRoute` — that the request is ours, so they call this directly instead of going
 * through the `next`-based fallback in `createControlApiMiddleware`.
 */
export async function handleControlApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  store: StateStore,
  activityLog: ActivityLog | undefined,
  corsOrigin: string,
  next?: ControlApiNext,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");

  // When mounted as middleware (`next` present), a non-matching request belongs to the host
  // app — pass it through untouched instead of claiming it with our own CORS headers/404.
  if (next && !isControlApiRoute(url.pathname)) {
    next();
    return;
  }

  res.setHeader("Access-Control-Allow-Origin", corsOrigin);
  for (const [key, value] of Object.entries(CORS_HEADERS)) res.setHeader(key, value);

  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  const allSegments = url.pathname.split("/").filter(Boolean);

  // Anchor on the *last* "api" segment, not position 0 — a host may mount this control API
  // (as middleware, or behind a proxy) underneath its own base path (e.g.
  // `/api/v1/notebooks/api/activity`). Anchoring on position 0 breaks in that case; anchoring
  // on the last "api" keeps the package route-independent of wherever the host puts it.
  const apiIndex = allSegments.lastIndexOf("api");

  try {
    if (apiIndex === -1) {
      notFound(res);
      return;
    }

    const segments = allSegments.slice(apiIndex);

    if (segments[1] === "activity" && segments.length === 2 && req.method === "GET") {
      const limitParam = url.searchParams.get("limit");
      sendJson(res, 200, activityLog?.list(limitParam ? Number(limitParam) : undefined) ?? []);
      return;
    }

    if (segments[1] === "presets") {
      if (segments.length === 2 && req.method === "GET") {
        const category = url.searchParams.get("category");
        sendJson(res, 200, listPresets((category ?? undefined) as PresetCategory | undefined));
        return;
      }

      if (segments.length === 4 && segments[3] === "apply" && req.method === "POST") {
        const name = segments[2];
        if (!findPreset(name)) {
          notFound(res);
          return;
        }
        const body = await readJsonBody<ApplyPresetOverrides>(req);
        sendJson(res, 201, applyPreset(store, name, body));
        return;
      }

      notFound(res);
      return;
    }

    if (segments[1] === "config") {
      if (segments.length === 2 && req.method === "GET") {
        sendJson(res, 200, { scenarios: store.list() });
        return;
      }

      if (segments.length === 2 && req.method === "POST") {
        const body = await readJsonBody<{ scenarios: RegisterScenarioInput[] }>(req);
        if (!Array.isArray(body.scenarios)) {
          throw new Error('body must be { "scenarios": [...] }');
        }
        store.clear();
        for (const scenario of body.scenarios) store.register(scenario);
        sendJson(res, 200, { scenarios: store.list() });
        return;
      }

      notFound(res);
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
