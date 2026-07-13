import { describe, expect, it, vi } from "vitest";
import { randomErrorScenario } from "../../src/scenarios/random-error.js";

function fakeResponse() {
  const calls: { status?: number; body?: unknown } = {};
  return {
    res: {
      status: (code: number) => {
        calls.status = code;
      },
      header: vi.fn(),
      send: (body: unknown) => {
        calls.body = body;
      },
    },
    calls,
  };
}

describe("randomErrorScenario", () => {
  it("defaults to a 500 with a descriptive body", () => {
    const { res, calls } = fakeResponse();
    const result = randomErrorScenario({ req: { method: "GET", path: "/" }, res }, {});

    expect(result).toBe("terminated");
    expect(calls.status).toBe(500);
    expect(calls.body).toMatchObject({ status: 500 });
  });

  it("picks a status code from the configured list", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const { res, calls } = fakeResponse();

    randomErrorScenario({ req: { method: "GET", path: "/" }, res }, { statusCodes: [500, 502, 503] });

    expect(calls.status).toBe(503);
    vi.restoreAllMocks();
  });

  it("uses a custom body when provided", () => {
    const { res, calls } = fakeResponse();
    randomErrorScenario({ req: { method: "GET", path: "/" }, res }, { body: { custom: true } });

    expect(calls.body).toEqual({ custom: true });
  });
});
