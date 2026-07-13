import { describe, expect, it, vi } from "vitest";
import { delayScenario } from "../../src/scenarios/delay.js";

function fakeResponse() {
  return { status: vi.fn(), header: vi.fn(), send: vi.fn() };
}

describe("delayScenario", () => {
  it("waits minMs and continues", async () => {
    vi.useFakeTimers();
    const res = fakeResponse();
    const promise = delayScenario({ req: { method: "GET", path: "/" }, res }, { minMs: 1000 });

    await vi.advanceTimersByTimeAsync(999);
    // still pending
    let settled = false;
    promise.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const result = await promise;
    vi.useRealTimers();

    expect(result).toBe("continue");
    expect(res.status).not.toHaveBeenCalled();
  });

  it("defaults to 500ms when no options given", async () => {
    vi.useFakeTimers();
    const res = fakeResponse();
    const promise = delayScenario({ req: { method: "GET", path: "/" }, res }, {});

    await vi.advanceTimersByTimeAsync(500);
    const result = await promise;
    vi.useRealTimers();

    expect(result).toBe("continue");
  });

  it("waits within [minMs, maxMs] when a range is given", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    vi.useFakeTimers();
    const res = fakeResponse();
    const promise = delayScenario({ req: { method: "GET", path: "/" }, res }, { minMs: 100, maxMs: 300 });

    await vi.advanceTimersByTimeAsync(200); // 100 + 0.5*(300-100) = 200
    const result = await promise;
    vi.useRealTimers();
    vi.restoreAllMocks();

    expect(result).toBe("continue");
  });
});
