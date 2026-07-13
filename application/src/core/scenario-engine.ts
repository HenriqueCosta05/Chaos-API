import { delayScenario } from "../scenarios/delay.js";
import { randomErrorScenario } from "../scenarios/random-error.js";
import { randomTimeoutScenario } from "../scenarios/random-timeout.js";
import { unavailable503Scenario } from "../scenarios/unavailable-503.js";
import type { StateStore } from "./state-store.js";
import type {
  ChaosRequestInfo,
  ChaosResponseController,
  ScenarioHandler,
  ScenarioResult,
  ScenarioType,
} from "./types.js";

/** Fixed apply order for combined scenarios — matches docs/architecture-and-walkthrough.md. */
const PRIORITY: ScenarioType[] = ["delay", "random-error", "random-timeout", "unavailable-503"];

const HANDLERS: Record<ScenarioType, ScenarioHandler> = {
  delay: delayScenario,
  "random-error": randomErrorScenario,
  "random-timeout": randomTimeoutScenario,
  "unavailable-503": unavailable503Scenario,
};

export class ScenarioEngine {
  constructor(private readonly store: StateStore) {}

  async resolve(req: ChaosRequestInfo, res: ChaosResponseController): Promise<ScenarioResult> {
    const active = this.store.getActiveForPath(req.path);
    const ordered = PRIORITY.flatMap((type) => active.filter((s) => s.type === type));

    for (const scenario of ordered) {
      if (Math.random() > scenario.rate) continue;

      const handler = HANDLERS[scenario.type];
      const result = await handler({ req, res }, scenario.options);
      if (result === "terminated") return "terminated";
    }

    return "continue";
  }
}
