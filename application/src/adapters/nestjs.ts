import type { Server } from "node:http";
import { ActivityLog } from "../core/activity-log.js";
import { resolveControlApiConfig } from "../core/control-api-env.js";
import { isIgnoredPath } from "../core/ignore-paths.js";
import { warnOnPortCollision } from "../core/safe-listen.js";
import { ScenarioEngine } from "../core/scenario-engine.js";
import { StateStore } from "../core/state-store.js";
import type { ChaosResponseController } from "../core/types.js";
import { createControlApi } from "../dashboard/server/control-api.js";
import { isBlockedByGuardrail } from "../guardrail.js";
import type { ChaosOptions } from "./express.js";

/**
 * Minimal structural shapes for Nest's req/res — deliberately not `@nestjs/common` types, so
 * this package doesn't need Nest (or Express/Fastify) as a dependency just to type this file.
 * Works under both platform-express (req/res are Express-decorated) and platform-fastify
 * (functional middleware gets the raw `http.IncomingMessage`/`ServerResponse`).
 */
export interface NestLikeRequest {
  method: string;
  url: string;
  originalUrl?: string;
}

export interface NestLikeResponse {
  statusCode?: number;
  status?(code: number): unknown;
  send?(body?: unknown): unknown;
  setHeader(name: string, value: string): unknown;
  end(chunk?: unknown): unknown;
}

export type NestMiddlewareFn = (req: NestLikeRequest, res: NestLikeResponse, next: (err?: unknown) => void) => void;

export interface ChaosNestMiddleware extends NestMiddlewareFn {
  store: StateStore;
  activityLog: ActivityLog;
  controlApi?: Server;
}

/**
 * docs/PRD.md 6.6 — thin adapter over the shared core, same pattern as adapters/express.ts and
 * adapters/fastify.ts. Register as functional middleware: `consumer.apply(createChaosNestMiddleware()).forRoutes("*")`
 * in a NestModule's `configure()`, or just `app.use(createChaosNestMiddleware())` in main.ts.
 */
export function createChaosNestMiddleware(options: ChaosOptions = {}): ChaosNestMiddleware {
  const store = options.store ?? new StateStore();
  const activityLog = options.activityLog ?? new ActivityLog(options.activityLogCapacity);
  const engine = new ScenarioEngine(store, activityLog);

  const middleware = ((req, res, next) => {
    const path = (req.originalUrl ?? req.url).split("?")[0];

    if (isBlockedByGuardrail(options) || isIgnoredPath(path, options.ignorePaths)) {
      next();
      return;
    }

    const controller: ChaosResponseController = {
      status: (code) => {
        if (typeof res.status === "function") res.status(code);
        else res.statusCode = code;
      },
      header: (name, value) => {
        res.setHeader(name, value);
      },
      send: (body) => {
        if (typeof res.send === "function") res.send(body);
        else res.end(typeof body === "string" ? body : JSON.stringify(body));
      },
    };

    engine
      .resolve({ method: req.method, path }, controller)
      .then((result) => {
        if (result === "continue") next();
      })
      .catch(next);
  }) as ChaosNestMiddleware;

  middleware.store = store;
  middleware.activityLog = activityLog;

  const controlApiConfig = resolveControlApiConfig(options);
  if (controlApiConfig.port) {
    const server = createControlApi(store, activityLog, { corsOrigin: controlApiConfig.corsOrigin }).listen(
      controlApiConfig.port,
      controlApiConfig.host,
    );
    middleware.controlApi = warnOnPortCollision(server, "control API", controlApiConfig.port, controlApiConfig.host);
  }

  return middleware;
}
