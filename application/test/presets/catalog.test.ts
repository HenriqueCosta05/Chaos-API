import { describe, expect, it } from "vitest";
import { PRESET_CATALOG } from "../../src/presets/catalog.js";

const VALID_CATEGORIES = new Set([
  "seguranca",
  "dependencias-externas",
  "configuracao",
  "resource-exhaustion",
  "filesystem",
]);

const VALID_TYPES = new Set([
  "delay",
  "error-response",
  "connection-reset",
  "unavailable",
  "malformed-response",
  "stale-response",
]);

describe("PRESET_CATALOG", () => {
  it("has unique preset names", () => {
    const names = PRESET_CATALOG.map((preset) => preset.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("only uses the shipped category subset (docs/PRD.md 6.3 Next roadmap)", () => {
    for (const preset of PRESET_CATALOG) {
      expect(VALID_CATEGORIES.has(preset.category)).toBe(true);
    }
  });

  it("only resolves to one of the 6 v2 primitives", () => {
    for (const preset of PRESET_CATALOG) {
      expect(VALID_TYPES.has(preset.type)).toBe(true);
    }
  });

  it("covers all 5 shipped categories with at least one preset", () => {
    const covered = new Set(PRESET_CATALOG.map((preset) => preset.category));
    expect(covered).toEqual(VALID_CATEGORIES);
  });
});
