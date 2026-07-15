import { SCENARIO_REGISTRY } from "../scenarios/registry.js";
import type { StateStore } from "./state-store.js";
import type { ChaosRequestInfo, ChaosResponseController, ScenarioHandler, ScenarioResult, ScenarioType } from "./types.js";

/** Fixed apply order for combined scenarios — matches docs/architecture-and-walkthrough.md. */
const PRIORITY: ScenarioType[] = SCENARIO_REGISTRY.map((def) => def.type);

const HANDLERS: Record<ScenarioType, ScenarioHandler> = Object.fromEntries(
  SCENARIO_REGISTRY.map((def) => [def.type, def.handler]),
) as Record<ScenarioType, ScenarioHandler>;

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
