import { describe, expect, it } from "vitest";
import { unavailable503Scenario } from "../../src/scenarios/unavailable-503.js";

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

describe("unavailable503Scenario", () => {
  it("responds 503 without Retry-After by default", () => {
    const { res, calls } = fakeResponse();
    const result = unavailable503Scenario({ req: { method: "GET", path: "/" }, res }, {});

    expect(result).toBe("terminated");
    expect(calls.status).toBe(503);
    expect(calls.headers["Retry-After"]).toBeUndefined();
  });

  it("sets Retry-After when configured", () => {
    const { res, calls } = fakeResponse();
    unavailable503Scenario({ req: { method: "GET", path: "/" }, res }, { retryAfterSeconds: 30 });

    expect(calls.headers["Retry-After"]).toBe("30");
  });
});
