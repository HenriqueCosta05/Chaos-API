import { describe, expect, it } from "vitest";
import { StateStore } from "../../src/core/state-store.js";
import { applyPreset, findPreset, listPresets } from "../../src/presets/index.js";

describe("findPreset", () => {
  it("finds a preset by name", () => {
    expect(findPreset("auth-service-down")?.category).toBe("seguranca");
  });

  it("returns undefined for an unknown name", () => {
    expect(findPreset("does-not-exist")).toBeUndefined();
  });
});

describe("listPresets", () => {
  it("lists all presets when no category is given", () => {
    expect(listPresets().length).toBeGreaterThan(0);
  });

  it("filters by category", () => {
    const presets = listPresets("filesystem");
    expect(presets.length).toBeGreaterThan(0);
    expect(presets.every((preset) => preset.category === "filesystem")).toBe(true);
  });
});

describe("applyPreset", () => {
  it("registers a scenario resolved from the preset's primitive + options", () => {
    const store = new StateStore();
    const scenario = applyPreset(store, "auth-service-down");

    expect(scenario.type).toBe("unavailable");
    expect(scenario.options).toEqual({ statusCode: 503 });
    expect(scenario.scope).toBe("global");
    expect(scenario.rate).toBe(1);
    expect(scenario.enabled).toBe(true);
  });

  it("throws for an unknown preset name", () => {
    const store = new StateStore();
    expect(() => applyPreset(store, "does-not-exist")).toThrow(/unknown preset/);
  });

  it("allows overriding scope/rate/enabled", () => {
    const store = new StateStore();
    const scenario = applyPreset(store, "third-party-timeout", {
      scope: { pattern: "/checkout/*" },
      rate: 0.3,
      enabled: false,
    });

    expect(scenario.scope).toEqual({ pattern: "/checkout/*" });
    expect(scenario.rate).toBe(0.3);
    expect(scenario.enabled).toBe(false);
  });

  it("merges option overrides on top of the preset's defaults", () => {
    const store = new StateStore();
    const scenario = applyPreset(store, "third-party-rate-limit", {
      options: { headers: { "Retry-After": "60" } },
    });

    expect(scenario.options).toEqual({ statusCodes: [429], headers: { "Retry-After": "60" } });
  });
});
