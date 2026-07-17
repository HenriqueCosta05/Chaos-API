import type { Context, Middleware } from "koa";
import type { Server } from "node:http";
import { ActivityLog } from "../core/activity-log.js";
import { resolveControlApiConfig } from "../core/control-api-env.js";
import { isIgnoredPath } from "../core/ignore-paths.js";
import { warnOnPortCollision } from "../core/safe-listen.js";
import { ScenarioEngine } from "../core/scenario-engine.js";
import { StateStore } from "../core/state-store.js";
import type { ChaosResponseController } from "../core/types.js";
import {
  createControlApi,
  handleControlApiRequest,
  isControlApiRoute,
  type ControlApiOptions,
} from "../dashboard/server/control-api.js";
import { isBlockedByGuardrail } from "../guardrail.js";
import type { ChaosOptions } from "./express.js";

export interface ChaosKoaMiddleware extends Middleware {
  store: StateStore;
  activityLog: ActivityLog;
  controlApi?: Server;
}

/** docs/PRD.md 6.6 — thin adapter over the shared core, same pattern as adapters/express.ts and adapters/fastify.ts. */
export function chaosKoaMiddleware(options: ChaosOptions = {}): ChaosKoaMiddleware {
  const store = options.store ?? new StateStore();
  const activityLog = options.activityLog ?? new ActivityLog(options.activityLogCapacity);
  const engine = new ScenarioEngine(store, activityLog);

  const middleware = (async (ctx: Context, next) => {
    if (isBlockedByGuardrail(options) || isIgnoredPath(ctx.path, options.ignorePaths)) {
      await next();
      return;
    }

    let responded = false;
    const controller: ChaosResponseController = {
      status: (code) => {
        ctx.status = code;
        responded = true;
      },
      header: (name, value) => {
        ctx.set(name, value);
      },
      send: (body) => {
        ctx.body = body;
        responded = true;
      },
    };

    const result = await engine.resolve({ method: ctx.method, path: ctx.path }, controller);

    if (result === "terminated") {
      if (!responded) {
        // connection-reset: no response was written on purpose — take Koa out of the
        // request lifecycle so it doesn't send a default reply / close the socket.
        ctx.respond = false;
      }
      return;
    }

    await next();
  }) as ChaosKoaMiddleware;

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

/**
 * Koa-compatible middleware serving the same routes as `createControlApi`, mounted directly onto
 * the host app's own Koa instance — no extra port, no port-collision risk. Requests that aren't
 * ours fall through to Koa's normal middleware chain untouched.
 */
export function createControlApiKoaMiddleware(
  store: StateStore,
  activityLog?: ActivityLog,
  options: ControlApiOptions = {},
): Middleware {
  const corsOrigin = options.corsOrigin ?? "*";

  return async (ctx: Context, next) => {
    if (!isControlApiRoute(ctx.path)) {
      await next();
      return;
    }

    // We answer with the raw req/res directly (same as the standalone control API server) —
    // take Koa out of the response-committing flow so it doesn't also try to write a reply.
    ctx.respond = false;
    await handleControlApiRequest(ctx.req, ctx.res, store, activityLog, corsOrigin);
  };
}
