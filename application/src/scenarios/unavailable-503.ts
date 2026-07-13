import type { ScenarioHandler } from "../core/types.js";

export interface Unavailable503Options {
  retryAfterSeconds?: number;
}

export const unavailable503Scenario: ScenarioHandler = (ctx, options) => {
  const { retryAfterSeconds } = options as Unavailable503Options;

  if (retryAfterSeconds !== undefined) {
    ctx.res.header("Retry-After", String(retryAfterSeconds));
  }
  ctx.res.status(503);
  ctx.res.send({ error: "chaos-api: service unavailable" });
  return "terminated";
};
