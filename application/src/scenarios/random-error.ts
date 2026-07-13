import type { ScenarioHandler } from "../core/types.js";

export interface RandomErrorOptions {
  statusCodes?: number[];
  body?: unknown;
}

export const randomErrorScenario: ScenarioHandler = (ctx, options) => {
  const { statusCodes = [500], body } = options as RandomErrorOptions;
  const code = statusCodes[Math.floor(Math.random() * statusCodes.length)];

  ctx.res.status(code);
  ctx.res.send(body ?? { error: "chaos-api: injected error", status: code });
  return "terminated";
};
