import { SCENARIO_REGISTRY } from "../scenarios/registry.js";
import type { ActivityLog } from "./activity-log.js";
import type { StateStore } from "./state-store.js";
import type {
  ChaosRequestInfo,
  ChaosResponseController,
  ScenarioConfig,
  ScenarioHandler,
  ScenarioResult,
  ScenarioType,
} from "./types.js";

/** Fixed apply order for combined scenarios — matches docs/architecture-and-walkthrough.md. */
const PRIORITY: ScenarioType[] = SCENARIO_REGISTRY.map((def) => def.type);

const HANDLERS: Record<ScenarioType, ScenarioHandler> = Object.fromEntries(
  SCENARIO_REGISTRY.map((def) => [def.type, def.handler]),
) as Record<ScenarioType, ScenarioHandler>;

export class ScenarioEngine {
  constructor(
    private readonly store: StateStore,
    private readonly activityLog?: ActivityLog,
  ) {}

  async resolve(req: ChaosRequestInfo, res: ChaosResponseController): Promise<ScenarioResult> {
    return this.apply(this.store.getActiveForPath(req.path), req, res);
  }

  /** docs/PRD.md 6.4 — `req.path` carries the outbound call's destination host, not a route. */
  async resolveOutbound(req: ChaosRequestInfo, res: ChaosResponseController): Promise<ScenarioResult> {
    return this.apply(this.store.getActiveOutbound(req.path), req, res);
  }

  private async apply(
    active: ScenarioConfig[],
    req: ChaosRequestInfo,
    res: ChaosResponseController,
  ): Promise<ScenarioResult> {
    const ordered = PRIORITY.flatMap((type) => active.filter((s) => s.type === type));

    for (const scenario of ordered) {
      if (Math.random() > scenario.rate) continue;

      this.activityLog?.record({
        scenarioId: scenario.id,
        scenarioType: scenario.type,
        direction: scenario.direction,
        method: req.method,
        path: req.path,
      });

      const handler = HANDLERS[scenario.type];
      const result = await handler({ req, res }, scenario.options);
      if (result === "terminated") return "terminated";
    }

    return "continue";
  }
}
