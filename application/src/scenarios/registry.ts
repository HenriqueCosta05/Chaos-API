import { connectionResetScenario } from "./connection-reset.js";
import { delayScenario } from "./delay.js";
import { errorResponseScenario } from "./error-response.js";
import { malformedResponseScenario } from "./malformed-response.js";
import { staleResponseScenario } from "./stale-response.js";
import { unavailableScenario } from "./unavailable.js";
import type { ScenarioHandler, ScenarioType } from "../core/types.js";

export interface ScenarioDefinition {
  type: ScenarioType;
  handler: ScenarioHandler;
}

/**
 * Single source of truth for the v2 primitives (docs/PRD.md 6.2): type, handler, and
 * apply order for combined scenarios. Array order = fixed priority order.
 * Adding a primitive only touches this file plus the new scenario module — the engine
 * itself doesn't change (docs/PRD.md 6.1 "registry pattern").
 */
export const SCENARIO_REGISTRY: ScenarioDefinition[] = [
  { type: "delay", handler: delayScenario },
  { type: "error-response", handler: errorResponseScenario },
  { type: "connection-reset", handler: connectionResetScenario },
  { type: "unavailable", handler: unavailableScenario },
  { type: "malformed-response", handler: malformedResponseScenario },
  { type: "stale-response", handler: staleResponseScenario },
];
