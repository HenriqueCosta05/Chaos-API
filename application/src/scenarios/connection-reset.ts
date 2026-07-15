import type { ScenarioHandler } from "../core/types.js";

/**
 * Simulates a dropped connection / hung upstream: intentionally never writes a response.
 * Adapters must not call `next()`/end the request when this scenario terminates the
 * chain — the connection stays open until the client or server times out.
 */
export const connectionResetScenario: ScenarioHandler = () => {
  return "terminated";
};
