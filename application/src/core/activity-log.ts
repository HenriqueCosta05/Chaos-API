import { randomUUID } from "node:crypto";
import type { ScenarioDirection, ScenarioType } from "./types.js";

export interface ActivityEvent {
  id: string;
  timestamp: number;
  scenarioId: string;
  scenarioType: ScenarioType;
  direction: ScenarioDirection;
  method: string;
  path: string;
}

export type RecordActivityInput = Omit<ActivityEvent, "id" | "timestamp">;

/**
 * In-memory ring buffer of fired scenarios (docs/PRD.md 6.5 "feed de atividade") — no external
 * dependency, capped so it can't grow unbounded in a long-running process.
 */
export class ActivityLog {
  private readonly events: ActivityEvent[] = [];

  constructor(private readonly capacity = 200) {}

  record(input: RecordActivityInput): ActivityEvent {
    const event: ActivityEvent = { id: randomUUID(), timestamp: Date.now(), ...input };
    this.events.unshift(event);
    if (this.events.length > this.capacity) this.events.length = this.capacity;
    return event;
  }

  /** Newest first. */
  list(limit?: number): ActivityEvent[] {
    return limit !== undefined ? this.events.slice(0, limit) : [...this.events];
  }

  clear(): void {
    this.events.length = 0;
  }
}
