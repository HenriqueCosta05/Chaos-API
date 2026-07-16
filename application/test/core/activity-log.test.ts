import { describe, expect, it } from "vitest";
import { ActivityLog } from "../../src/core/activity-log.js";

function event(overrides: Partial<Parameters<ActivityLog["record"]>[0]> = {}) {
  return {
    scenarioId: "s1",
    scenarioType: "delay" as const,
    direction: "inbound" as const,
    method: "GET",
    path: "/orders",
    ...overrides,
  };
}

describe("ActivityLog", () => {
  it("records an event with a generated id and timestamp", () => {
    const log = new ActivityLog();
    const recorded = log.record(event());

    expect(recorded.id).toBeTruthy();
    expect(recorded.timestamp).toBeTypeOf("number");
    expect(recorded.scenarioType).toBe("delay");
  });

  it("lists events newest first", () => {
    const log = new ActivityLog();
    const first = log.record(event({ scenarioId: "s1" }));
    const second = log.record(event({ scenarioId: "s2" }));

    expect(log.list().map((e) => e.id)).toEqual([second.id, first.id]);
  });

  it("respects a limit", () => {
    const log = new ActivityLog();
    log.record(event());
    log.record(event());
    log.record(event());

    expect(log.list(2)).toHaveLength(2);
  });

  it("caps the buffer at capacity, dropping the oldest events", () => {
    const log = new ActivityLog(2);
    const first = log.record(event({ scenarioId: "s1" }));
    const second = log.record(event({ scenarioId: "s2" }));
    const third = log.record(event({ scenarioId: "s3" }));

    const ids = log.list().map((e) => e.id);
    expect(ids).toEqual([third.id, second.id]);
    expect(ids).not.toContain(first.id);
  });

  it("clear empties the buffer", () => {
    const log = new ActivityLog();
    log.record(event());
    log.clear();

    expect(log.list()).toHaveLength(0);
  });
});
