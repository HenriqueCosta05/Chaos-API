import { describe, expect, it } from "vitest";
import { unavailableScenario } from "../../src/scenarios/unavailable.js";

function fakeResponse() {
  const calls: { status?: number; headers: Record<string, string>; body?: unknown } = { headers: {} };
  return {
    res: {
      status: (code: number) => {
        calls.status = code;
      },
      header: (name: string, value: string) => {
        calls.headers[name] = value;
      },
      send: (body: unknown) => {
        calls.body = body;
      },
    },
    calls,
  };
}

describe("unavailableScenario", () => {
  it("responds 503 without Retry-After by default", () => {
    const { res, calls } = fakeResponse();
    const result = unavailableScenario({ req: { method: "GET", path: "/" }, res }, {});

    expect(result).toBe("terminated");
    expect(calls.status).toBe(503);
    expect(calls.headers["Retry-After"]).toBeUndefined();
  });

  it("sets Retry-After when configured", () => {
    const { res, calls } = fakeResponse();
    unavailableScenario({ req: { method: "GET", path: "/" }, res }, { retryAfterSeconds: 30 });

    expect(calls.headers["Retry-After"]).toBe("30");
  });

  it("uses a configured status code (507, 429, etc.)", () => {
    const { res, calls } = fakeResponse();
    unavailableScenario({ req: { method: "GET", path: "/" }, res }, { statusCode: 429 });

    expect(calls.status).toBe(429);
  });
});
