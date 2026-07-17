import type { Context, Middleware } from "koa";
import type { Server } from "node:http";
import { ActivityLog } from "../core/activity-log.js";
import { isIgnoredPath } from "../core/ignore-paths.js";
import { ScenarioEngine } from "../core/scenario-engine.js";
import { StateStore } from "../core/state-store.js";
import type { ChaosResponseController } from "../core/types.js";
import { createControlApi } from "../dashboard/server/control-api.js";
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

  if (options.controlPort) {
    middleware.controlApi = createControlApi(store, activityLog, { corsOrigin: options.corsOrigin }).listen(
      options.controlPort,
      options.controlHost ?? "127.0.0.1",
    );
  }

  return middleware;
}
