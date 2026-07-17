import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { Server } from "node:http";
import { ActivityLog } from "../core/activity-log.js";
import { resolveControlApiConfig } from "../core/control-api-env.js";
import { isIgnoredPath, type IgnorePathPattern } from "../core/ignore-paths.js";
import { warnOnPortCollision } from "../core/safe-listen.js";
import { ScenarioEngine } from "../core/scenario-engine.js";
import { StateStore } from "../core/state-store.js";
import type { ChaosResponseController } from "../core/types.js";
import { createControlApi } from "../dashboard/server/control-api.js";
import { isBlockedByGuardrail } from "../guardrail.js";

export interface ChaosOptions {
  /** Bypass the NODE_ENV=production guardrail. Not recommended. */
  allowInProduction?: boolean;
  /** Reuse an existing StateStore (e.g. to share state across adapters in tests). */
  store?: StateStore;
  /** Reuse an existing ActivityLog (e.g. to share state across adapters in tests). */
  activityLog?: ActivityLog;
  /** Max events kept by the activity feed (docs/PRD.md 6.5). Default 200. Ignored if `activityLog` is passed. */
  activityLogCapacity?: number;
  /** If set (or `CHAOS_CONTROL_PORT` is set), starts the local control API on this port for the dashboard UI to talk to. */
  controlPort?: number;
  /** Bind address for the control API. Default `CHAOS_CONTROL_HOST` env var, else `"127.0.0.1"`. */
  controlHost?: string;
  /** `Access-Control-Allow-Origin` for the control API. Default `CHAOS_CORS_ORIGIN` env var, else `"*"`. */
  corsOrigin?: string;
  /** Paths that always bypass chaos scenarios (glob strings like `"/health*"` or RegExp), e.g. health checks. */
  ignorePaths?: IgnorePathPattern[];
}

export interface ChaosInstance {
  (req: Request, res: Response, next: NextFunction): void;
  store: StateStore;
  activityLog: ActivityLog;
  controlApi?: Server;
}

export function chaos(options: ChaosOptions = {}): ChaosInstance {
  const store = options.store ?? new StateStore();
  const activityLog = options.activityLog ?? new ActivityLog(options.activityLogCapacity);
  const engine = new ScenarioEngine(store, activityLog);

  const middleware = ((req: Request, res: Response, next: NextFunction) => {
    if (isBlockedByGuardrail(options) || isIgnoredPath(req.path, options.ignorePaths)) {
      next();
      return;
    }

    const controller: ChaosResponseController = {
      status: (code) => {
        res.status(code);
      },
      header: (name, value) => {
        res.setHeader(name, value);
      },
      send: (body) => {
        res.send(body);
      },
    };

    engine
      .resolve({ method: req.method, path: req.path }, controller)
      .then((result) => {
        if (result === "continue") next();
      })
      .catch(next);
  }) as ChaosInstance;

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
