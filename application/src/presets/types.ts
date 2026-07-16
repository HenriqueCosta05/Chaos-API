import type { ScenarioScope, ScenarioType } from "../core/types.js";

/**
 * Category subset shipped in this increment (docs/PRD.md 6.3 "Next" roadmap): only the
 * categories flagged HTTP-simulável that don't need chaos outbound (6.4) or a composed-preset
 * design (erro humano/black swan) to be useful today.
 */
export type PresetCategory =
  | "seguranca"
  | "dependencias-externas"
  | "configuracao"
  | "resource-exhaustion"
  | "filesystem";

export interface PresetDefinition {
  /** Stable kebab-case id, e.g. "auth-service-down". Unique within PRESET_CATALOG. */
  name: string;
  category: PresetCategory;
  description: string;
  type: ScenarioType;
  options?: Record<string, unknown>;
  scope?: ScenarioScope;
  rate?: number;
}
