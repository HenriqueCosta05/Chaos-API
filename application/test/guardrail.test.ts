import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isBlockedByGuardrail, resetGuardrailWarning } from "../src/guardrail.js";

describe("isBlockedByGuardrail", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    resetGuardrailWarning();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    vi.restoreAllMocks();
  });

  it("does not block outside production", () => {
    process.env.NODE_ENV = "development";
    expect(isBlockedByGuardrail()).toBe(false);
  });

  it("blocks in production by default", () => {
    process.env.NODE_ENV = "production";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(isBlockedByGuardrail()).toBe(true);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("only warns once across repeated calls", () => {
    process.env.NODE_ENV = "production";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    isBlockedByGuardrail();
    isBlockedByGuardrail();
    isBlockedByGuardrail();

    expect(warn).toHaveBeenCalledOnce();
  });

  it("allows override via allowInProduction", () => {
    process.env.NODE_ENV = "production";
    expect(isBlockedByGuardrail({ allowInProduction: true })).toBe(false);
  });
});
