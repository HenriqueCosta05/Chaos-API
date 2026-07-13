import { describe, expect, it, vi } from "vitest";
import { randomTimeoutScenario } from "../../src/scenarios/random-timeout.js";

describe("randomTimeoutScenario", () => {
  it("terminates the chain without writing a response", () => {
    const status = vi.fn();
    const send = vi.fn();
    const result = randomTimeoutScenario(
      { req: { method: "GET", path: "/" }, res: { status, header: vi.fn(), send } },
      {},
    );

    expect(result).toBe("terminated");
    expect(status).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
