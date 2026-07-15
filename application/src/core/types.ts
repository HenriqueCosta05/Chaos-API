/** v2 primitives (PRD docs/PRD.md 6.2) — the ~85-item preset catalog (6.3) all resolve to one of these. */
export type ScenarioType =
  | "delay"
  | "error-response"
  | "connection-reset"
  | "unavailable"
  | "malformed-response"
  | "stale-response";

/**
 * v1 type names, kept accepted at registration time so existing configs don't break.
 * `StateStore.register` normalizes these to their v2 primitive equivalent (see
 * `LEGACY_TYPE_ALIASES` in state-store.ts) — a stored `ScenarioConfig.type` is always
 * a `ScenarioType`, never one of these.
 */
export type LegacyScenarioType = "random-error" | "random-timeout" | "unavailable-503";

export type ScenarioScope = "global" | { pattern: string };

export interface ScenarioConfig {
  id: string;
  type: ScenarioType;
  scope: ScenarioScope;
  /** 0..1 — fraction of matching requests this scenario applies to. */
  rate: number;
  enabled: boolean;
  options: Record<string, unknown>;
}

export interface ChaosRequestInfo {
  method: string;
  path: string;
}

export interface ChaosResponseController {
  status(code: number): void;
  header(name: string, value: string): void;
  send(body?: unknown): void;
}

export type ScenarioResult = "continue" | "terminated";

export type ScenarioHandler = (
  ctx: { req: ChaosRequestInfo; res: ChaosResponseController },
  options: Record<string, unknown>,
) => Promise<ScenarioResult> | ScenarioResult;
