export { chaos } from "./adapters/express.js";
export type { ChaosOptions, ChaosInstance } from "./adapters/express.js";
export { chaosFastifyPlugin } from "./adapters/fastify.js";
export type { ChaosFastifyPlugin } from "./adapters/fastify.js";
export { createChaosNestMiddleware } from "./adapters/nestjs.js";
export type { ChaosNestMiddleware, NestLikeRequest, NestLikeResponse, NestMiddlewareFn } from "./adapters/nestjs.js";
export { chaosKoaMiddleware } from "./adapters/koa.js";
export type { ChaosKoaMiddleware } from "./adapters/koa.js";

export { StateStore, globToRegex } from "./core/state-store.js";
export type { RegisterScenarioInput, UpdateScenarioInput } from "./core/state-store.js";
export { ActivityLog } from "./core/activity-log.js";
export type { ActivityEvent, RecordActivityInput } from "./core/activity-log.js";
export { ScenarioEngine } from "./core/scenario-engine.js";
export type {
  ChaosRequestInfo,
  ChaosResponseController,
  LegacyScenarioType,
  ScenarioConfig,
  ScenarioDirection,
  ScenarioHandler,
  ScenarioResult,
  ScenarioScope,
  ScenarioType,
} from "./core/types.js";

export * from "./scenarios/index.js";
export { PRESET_CATALOG, applyPreset, findPreset, listPresets } from "./presets/index.js";
export type { ApplyPresetOverrides, PresetCategory, PresetDefinition } from "./presets/index.js";
export { createChaosFetch } from "./outbound/index.js";
export type { ChaosFetchOptions } from "./outbound/index.js";
export { createControlApi } from "./dashboard/server/control-api.js";
export { startDashboard } from "./dashboard/server/index.js";
export { isBlockedByGuardrail, resetGuardrailWarning } from "./guardrail.js";
