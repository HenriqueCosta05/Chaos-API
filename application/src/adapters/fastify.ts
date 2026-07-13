import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Server } from "node:http";
import { ScenarioEngine } from "../core/scenario-engine.js";
import { StateStore } from "../core/state-store.js";
import type { ChaosResponseController } from "../core/types.js";
import { createControlApi } from "../dashboard/server/control-api.js";
import { isBlockedByGuardrail } from "../guardrail.js";
import type { ChaosOptions } from "./express.js";

export interface ChaosFastifyPlugin {
  (fastify: FastifyInstance): Promise<void>;
  store: StateStore;
  controlApi?: Server;
}

export function chaosFastifyPlugin(options: ChaosOptions = {}): ChaosFastifyPlugin {
  const store = options.store ?? new StateStore();
  const engine = new ScenarioEngine(store);

  const plugin = (async (fastify: FastifyInstance) => {
    fastify.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
      if (isBlockedByGuardrail(options)) return;

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

      const path = request.url.split("?")[0];
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

  if (options.controlPort) {
    plugin.controlApi = createControlApi(store).listen(options.controlPort);
  }

  return plugin;
}
