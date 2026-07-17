import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
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

export interface ChaosFastifyPlugin {
  (fastify: FastifyInstance): Promise<void>;
  store: StateStore;
  activityLog: ActivityLog;
  controlApi?: Server;
}

export function chaosFastifyPlugin(options: ChaosOptions = {}): ChaosFastifyPlugin {
  const store = options.store ?? new StateStore();
  const activityLog = options.activityLog ?? new ActivityLog(options.activityLogCapacity);
  const engine = new ScenarioEngine(store, activityLog);

  const plugin = (async (fastify: FastifyInstance) => {
    fastify.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
      const path = request.url.split("?")[0];
      if (isBlockedByGuardrail(options) || isIgnoredPath(path, options.ignorePaths)) return;

      const controller: ChaosResponseController = {
        status: (code) => {
          reply.code(code);
        },
        header: (name, value) => {
          reply.header(name, value);
        },
        send: (body) => {
          reply.send(body);
        },
      };

      const result = await engine.resolve({ method: request.method, path }, controller);

      if (result === "terminated" && !reply.sent) {
        // random-timeout: no response was written on purpose — take Fastify
        // out of the request lifecycle so it doesn't send a default reply.
        reply.hijack();
      }
    });
  }) as ChaosFastifyPlugin;

  // Skip Fastify's plugin encapsulation so the onRequest hook applies to routes
  // registered on the parent instance, not just inside this plugin's own context.
  // This is the same mechanism the `fastify-plugin` package uses internally.
  (plugin as unknown as Record<symbol, boolean>)[Symbol.for("skip-override")] = true;

  plugin.store = store;
  plugin.activityLog = activityLog;

  const controlApiConfig = resolveControlApiConfig(options);
  if (controlApiConfig.port) {
    const server = createControlApi(store, activityLog, { corsOrigin: controlApiConfig.corsOrigin }).listen(
      controlApiConfig.port,
      controlApiConfig.host,
    );
    plugin.controlApi = warnOnPortCollision(server, "control API", controlApiConfig.port, controlApiConfig.host);
  }

  return plugin;
}

export interface ChaosControlApiFastifyPlugin {
  (fastify: FastifyInstance): Promise<void>;
}

/**
 * Fastify-compatible plugin serving the same routes as `createControlApi`, mounted directly onto
 * the host app's own Fastify instance — no extra port, no port-collision risk. Requests that
 * aren't ours fall through to Fastify's normal routing untouched.
 */
export function createControlApiFastifyPlugin(
  store: StateStore,
  activityLog?: ActivityLog,
  options: ControlApiOptions = {},
): ChaosControlApiFastifyPlugin {
  const corsOrigin = options.corsOrigin ?? "*";

  const plugin = (async (fastify: FastifyInstance) => {
    fastify.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
      if (!isControlApiRoute(request.url.split("?")[0])) return;
      reply.hijack();
      await handleControlApiRequest(request.raw, reply.raw, store, activityLog, corsOrigin);
    });
  }) as ChaosControlApiFastifyPlugin;

  (plugin as unknown as Record<symbol, boolean>)[Symbol.for("skip-override")] = true;

  return plugin;
}
