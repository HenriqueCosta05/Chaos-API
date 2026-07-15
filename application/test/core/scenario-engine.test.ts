import { afterEach, describe, expect, it, vi } from "vitest";
import { ScenarioEngine } from "../../src/core/scenario-engine.js";
import { StateStore } from "../../src/core/state-store.js";
import type { ChaosResponseController } from "../../src/core/types.js";

function fakeResponse() {
  const calls: { status?: number; headers: Record<string, string>; body?: unknown } = { headers: {} };
  const res: ChaosResponseController = {
    status: (code) => {
      calls.status = code;
    },
    header: (name, value) => {
      calls.headers[name] = value;
    },
    send: (body) => {
      calls.body = body;
    },
  };
  return { res, calls };
}

describe("ScenarioEngine", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("continues when no scenario is registered for the route", async () => {
    const store = new StateStore();
    const engine = new ScenarioEngine(store);
    const { res } = fakeResponse();

    const result = await engine.resolve({ method: "GET", path: "/orders" }, res);
    expect(result).toBe("continue");
  });

  it("terminates and writes a response for error-response", async () => {
    const store = new StateStore();
    store.register({ type: "error-response", options: { statusCodes: [503] } });
    const engine = new ScenarioEngine(store);
    const { res, calls } = fakeResponse();

    const result = await engine.resolve({ method: "GET", path: "/orders" }, res);

    expect(result).toBe("terminated");
    expect(calls.status).toBe(503);
    expect(calls.body).toMatchObject({ status: 503 });
  });

  it("applies scenarios in fixed priority order (delay before error-response)", async () => {
    const store = new StateStore();
    // register error-response first to prove ordering isn't registration order
    store.register({ type: "error-response" });
    store.register({ type: "delay", options: { minMs: 1000 } });
    const engine = new ScenarioEngine(store);
    const { res, calls } = fakeResponse();

    vi.useFakeTimers();
    const promise = engine.resolve({ method: "GET", path: "/orders" }, res);

    // delay must still be pending its timer — error-response (lower priority) can't
    // have run yet, so no response should be written
    await Promise.resolve();
    expect(calls.status).toBeUndefined();

    await vi.runAllTimersAsync();
    const result = await promise;
    vi.useRealTimers();

    expect(result).toBe("terminated");
    expect(calls.status).toBe(500);
  });

  it("skips a scenario when its rate roll misses", async () => {
    const store = new StateStore();
    store.register({ type: "error-response", rate: 0.3 });
    const engine = new ScenarioEngine(store);
    const { res, calls } = fakeResponse();

    vi.spyOn(Math, "random").mockReturnValue(0.9); // 0.9 > 0.3 rate -> skip
    const result = await engine.resolve({ method: "GET", path: "/orders" }, res);

    expect(result).toBe("continue");
    expect(calls.status).toBeUndefined();
  });

  it("applies a scenario when its rate roll hits", async () => {
    const store = new StateStore();
    store.register({ type: "error-response", rate: 0.3 });
    const engine = new ScenarioEngine(store);
    const { res, calls } = fakeResponse();

    vi.spyOn(Math, "random").mockReturnValue(0.1); // 0.1 <= 0.3 rate -> apply
    const result = await engine.resolve({ method: "GET", path: "/orders" }, res);

    expect(result).toBe("terminated");
    expect(calls.status).toBe(500);
  });

  it("only applies scenarios matching the route scope", async () => {
    const store = new StateStore();
    store.register({ type: "error-response", scope: { pattern: "/orders/*" } });
    const engine = new ScenarioEngine(store);
    const { res, calls } = fakeResponse();

    const result = await engine.resolve({ method: "GET", path: "/customers/1" }, res);

    expect(result).toBe("continue");
    expect(calls.status).toBeUndefined();
  });
});
