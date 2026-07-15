import type { ScenarioHandler } from "../core/types.js";

export interface UnavailableOptions {
  /** 503 (service unavailable), 507 (insufficient storage), 429 (rate limited), etc. */
  statusCode?: number;
  retryAfterSeconds?: number;
}

export const unavailableScenario: ScenarioHandler = (ctx, options) => {
  const { statusCode = 503, retryAfterSeconds } = options as UnavailableOptions;

  if (retryAfterSeconds !== undefined) {
    ctx.res.header("Retry-After", String(retryAfterSeconds));
  }
  ctx.res.status(statusCode);
  ctx.res.send({ error: "chaos-api: service unavailable" });
  return "terminated";
};
