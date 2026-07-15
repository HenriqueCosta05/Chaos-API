import { describe, expect, it } from "vitest";
import { staleResponseScenario } from "../../src/scenarios/stale-response.js";

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

describe("staleResponseScenario", () => {
  it("defaults to 200, a stale marker header, and a default body", () => {
    const { res, calls } = fakeResponse();
    const result = staleResponseScenario({ req: { method: "GET", path: "/" }, res }, {});

    expect(result).toBe("terminated");
    expect(calls.status).toBe(200);
    expect(calls.headers["X-Chaos-Stale"]).toBe("true");
    expect(calls.body).toEqual({ stale: true });
  });

  it("serves the configured cached body and status", () => {
    const { res, calls } = fakeResponse();
    staleResponseScenario(
      { req: { method: "GET", path: "/" }, res },
      { body: { id: 1, price: 10 }, statusCode: 200 },
    );

    expect(calls.body).toEqual({ id: 1, price: 10 });
  });

  it("sets the Age header when configured", () => {
    const { res, calls } = fakeResponse();
    staleResponseScenario({ req: { method: "GET", path: "/" }, res }, { ageSeconds: 120 });

    expect(calls.headers.Age).toBe("120");
  });
});
