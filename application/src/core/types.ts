export type ScenarioType =
  | "delay"
  | "random-error"
  | "random-timeout"
  | "unavailable-503";

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
