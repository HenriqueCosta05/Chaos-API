import type { ScenarioHandler } from "../core/types.js";

export interface StaleResponseOptions {
  /** The stale/cached payload to serve instead of the real one. */
  body?: unknown;
  statusCode?: number;
  /** Sets the `Age` header (seconds since the cached response was fresh). */
  ageSeconds?: number;
}

export const staleResponseScenario: ScenarioHandler = (ctx, options) => {
  const { body, statusCode = 200, ageSeconds } = options as StaleResponseOptions;

  if (ageSeconds !== undefined) {
    ctx.res.header("Age", String(ageSeconds));
  }
  ctx.res.header("X-Chaos-Stale", "true");
  ctx.res.status(statusCode);
  ctx.res.send(body ?? { stale: true });
  return "terminated";
};
