import type { ScenarioHandler } from "../core/types.js";

export interface ErrorResponseOptions {
  statusCodes?: number[];
  body?: unknown;
  headers?: Record<string, string>;
  /** Restrict to these HTTP methods (e.g. write verbs only). Omitted = all methods. */
  methods?: string[];
}

export const errorResponseScenario: ScenarioHandler = (ctx, options) => {
  const { statusCodes = [500], body, headers, methods } = options as ErrorResponseOptions;
  if (methods && !methods.includes(ctx.req.method.toUpperCase())) return "continue";

  const code = statusCodes[Math.floor(Math.random() * statusCodes.length)];

  if (headers) {
    for (const [name, value] of Object.entries(headers)) ctx.res.header(name, value);
  }
  ctx.res.status(code);
  ctx.res.send(body ?? { error: "chaos-api: injected error", status: code });
  return "terminated";
};
