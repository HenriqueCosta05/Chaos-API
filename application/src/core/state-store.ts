import { randomUUID } from "node:crypto";
import type { ScenarioConfig, ScenarioScope, ScenarioType } from "./types.js";

export interface RegisterScenarioInput {
  type: ScenarioType;
  scope?: ScenarioScope;
  rate?: number;
  enabled?: boolean;
  options?: Record<string, unknown>;
}

export type UpdateScenarioInput = Partial<Omit<ScenarioConfig, "id" | "type">>;

/** Converts a route glob (`/orders/*`) into a matching RegExp. Only `*` is a wildcard. */
export function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function matchesScope(scope: ScenarioScope, path: string): boolean {
  if (scope === "global") return true;
  return globToRegex(scope.pattern).test(path);
}

/** In-memory registry of active chaos scenarios. One instance lives per middleware. */
export class StateStore {
  private readonly scenarios = new Map<string, ScenarioConfig>();

  register(input: RegisterScenarioInput): ScenarioConfig {
    if (input.rate !== undefined && (input.rate < 0 || input.rate > 1)) {
      throw new Error(`rate must be between 0 and 1, got ${input.rate}`);
    }

    const scenario: ScenarioConfig = {
      id: randomUUID(),
      type: input.type,
      scope: input.scope ?? "global",
      rate: input.rate ?? 1,
      enabled: input.enabled ?? true,
      options: input.options ?? {},
    };
    this.scenarios.set(scenario.id, scenario);
    return scenario;
  }

  update(id: string, patch: UpdateScenarioInput): ScenarioConfig | undefined {
    const existing = this.scenarios.get(id);
    if (!existing) return undefined;

    const updated: ScenarioConfig = { ...existing, ...patch, id: existing.id, type: existing.type };
    this.scenarios.set(id, updated);
    return updated;
  }

  remove(id: string): boolean {
    return this.scenarios.delete(id);
  }

  get(id: string): ScenarioConfig | undefined {
    return this.scenarios.get(id);
  }

  list(): ScenarioConfig[] {
    return [...this.scenarios.values()];
  }

  getActiveForPath(path: string): ScenarioConfig[] {
    return this.list().filter((s) => s.enabled && matchesScope(s.scope, path));
  }

  clear(): void {
    this.scenarios.clear();
  }
}
