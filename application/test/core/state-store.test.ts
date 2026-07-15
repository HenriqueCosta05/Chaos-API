import { describe, expect, it } from "vitest";
import { StateStore, globToRegex } from "../../src/core/state-store.js";

describe("globToRegex", () => {
  it("matches exact paths", () => {
    expect(globToRegex("/orders").test("/orders")).toBe(true);
    expect(globToRegex("/orders").test("/orders/1")).toBe(false);
  });

  it("matches wildcard patterns", () => {
    expect(globToRegex("/orders/*").test("/orders/123")).toBe(true);
    expect(globToRegex("/orders/*").test("/customers/1")).toBe(false);
  });
});

describe("StateStore", () => {
  it("registers a scenario with defaults", () => {
    const store = new StateStore();
    const scenario = store.register({ type: "delay" });

    expect(scenario.id).toBeTruthy();
    expect(scenario.scope).toBe("global");
    expect(scenario.rate).toBe(1);
    expect(scenario.enabled).toBe(true);
    expect(scenario.options).toEqual({});
  });

  it("rejects an out-of-range rate", () => {
    const store = new StateStore();
    expect(() => store.register({ type: "delay", rate: 1.5 })).toThrow();
    expect(() => store.register({ type: "delay", rate: -0.1 })).toThrow();
  });

  it("updates a scenario in place", () => {
    const store = new StateStore();
    const scenario = store.register({ type: "delay" });

    const updated = store.update(scenario.id, { enabled: false });
    expect(updated?.enabled).toBe(false);
    expect(store.get(scenario.id)?.enabled).toBe(false);
  });

  it("returns undefined when updating an unknown id", () => {
    const store = new StateStore();
    expect(store.update("missing", { enabled: false })).toBeUndefined();
  });

  it("removes a scenario", () => {
    const store = new StateStore();
    const scenario = store.register({ type: "delay" });

    expect(store.remove(scenario.id)).toBe(true);
    expect(store.list()).toHaveLength(0);
    expect(store.remove(scenario.id)).toBe(false);
  });

  it("getActiveForPath filters by enabled + scope", () => {
    const store = new StateStore();
    const global = store.register({ type: "delay" });
    const scoped = store.register({ type: "random-error", scope: { pattern: "/orders/*" } });
    const disabled = store.register({ type: "unavailable-503", enabled: false });

    const active = store.getActiveForPath("/orders/1");
    const ids = active.map((s) => s.id);

    expect(ids).toContain(global.id);
    expect(ids).toContain(scoped.id);
    expect(ids).not.toContain(disabled.id);
    expect(store.getActiveForPath("/customers/1").map((s) => s.id)).toEqual([global.id]);
  });

  it("normalizes v1 legacy type names to their v2 primitive (docs/PRD.md 6.2)", () => {
    const store = new StateStore();

    expect(store.register({ type: "random-error" }).type).toBe("error-response");
    expect(store.register({ type: "random-timeout" }).type).toBe("connection-reset");
    expect(store.register({ type: "unavailable-503" }).type).toBe("unavailable");
  });
});
