import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { Server } from "node:http";
import { ActivityLog } from "../core/activity-log.js";
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
  /** If set, starts the local control API on this port for the dashboard UI to talk to. */
  controlPort?: number;
}

export interface ChaosInstance {
  (req: Request, res: Response, next: NextFunction): void;
  store: StateStore;
  activityLog: ActivityLog;
  controlApi?: Server;
}

export function chaos(options: ChaosOptions = {}): ChaosInstance {
  const store = options.store ?? new StateStore();
  const activityLog = options.activityLog ?? new ActivityLog();
  const engine = new ScenarioEngine(store, activityLog);

  const middleware = ((req: Request, res: Response, next: NextFunction) => {
    if (isBlockedByGuardrail(options)) {
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

  if (options.controlPort) {
    middleware.controlApi = createControlApi(store, activityLog).listen(options.controlPort);
  }

  return middleware;
}
