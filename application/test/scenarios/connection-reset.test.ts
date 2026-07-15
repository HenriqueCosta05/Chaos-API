import { describe, expect, it, vi } from "vitest";
import { connectionResetScenario } from "../../src/scenarios/connection-reset.js";

describe("connectionResetScenario", () => {
  it("terminates the chain without writing a response", () => {
    const status = vi.fn();
    const send = vi.fn();
    const result = connectionResetScenario(
      { req: { method: "GET", path: "/" }, res: { status, header: vi.fn(), send } },
      {},
    );

    expect(result).toBe("terminated");
    expect(status).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
