import type { ScenarioHandler, ScenarioResult } from "../core/types.js";

export interface DelayOptions {
  minMs?: number;
  maxMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const delayScenario: ScenarioHandler = async (_ctx, options): Promise<ScenarioResult> => {
  const { minMs = 500, maxMs } = options as DelayOptions;
  const ms = maxMs !== undefined && maxMs > minMs ? minMs + Math.random() * (maxMs - minMs) : minMs;
  await sleep(ms);
  return "continue";
};
