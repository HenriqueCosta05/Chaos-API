import type { StateStore } from "../core/state-store.js";
import type { ScenarioConfig, ScenarioScope } from "../core/types.js";
import { PRESET_CATALOG } from "./catalog.js";
import type { PresetCategory, PresetDefinition } from "./types.js";

export { PRESET_CATALOG } from "./catalog.js";
export type { PresetCategory, PresetDefinition } from "./types.js";

export function findPreset(name: string): PresetDefinition | undefined {
  return PRESET_CATALOG.find((preset) => preset.name === name);
}

export function listPresets(category?: PresetCategory): PresetDefinition[] {
  return category ? PRESET_CATALOG.filter((preset) => preset.category === category) : [...PRESET_CATALOG];
}

export interface ApplyPresetOverrides {
  scope?: ScenarioScope;
  rate?: number;
  enabled?: boolean;
  options?: Record<string, unknown>;
}

/** Registers a preset by name on `store`, resolving it to its `{primitivo, options, scope}` (docs/PRD.md 6.3). */
export function applyPreset(store: StateStore, name: string, overrides: ApplyPresetOverrides = {}): ScenarioConfig {
  const preset = findPreset(name);
  if (!preset) {
    throw new Error(`unknown preset "${name}"`);
  }

  return store.register({
    type: preset.type,
    scope: overrides.scope ?? preset.scope ?? "global",
    rate: overrides.rate ?? preset.rate ?? 1,
    enabled: overrides.enabled,
    options: { ...preset.options, ...overrides.options },
  });
}
