import { describe, expect, it, vi } from "vitest";
import { errorResponseScenario } from "../../src/scenarios/error-response.js";

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

describe("errorResponseScenario", () => {
  it("defaults to a 500 with a descriptive body", () => {
    const { res, calls } = fakeResponse();
    const result = errorResponseScenario({ req: { method: "GET", path: "/" }, res }, {});

    expect(result).toBe("terminated");
    expect(calls.status).toBe(500);
    expect(calls.body).toMatchObject({ status: 500 });
  });

  it("picks a status code from the configured list", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const { res, calls } = fakeResponse();

    errorResponseScenario({ req: { method: "GET", path: "/" }, res }, { statusCodes: [500, 502, 503] });

    expect(calls.status).toBe(503);
    vi.restoreAllMocks();
  });

  it("uses a custom body when provided", () => {
    const { res, calls } = fakeResponse();
    errorResponseScenario({ req: { method: "GET", path: "/" }, res }, { body: { custom: true } });

    expect(calls.body).toEqual({ custom: true });
  });

  it("sets custom headers when provided", () => {
    const { res, calls } = fakeResponse();
    errorResponseScenario({ req: { method: "GET", path: "/" }, res }, { headers: { "X-Chaos": "yes" } });

    expect(calls.headers["X-Chaos"]).toBe("yes");
  });

  it("skips requests whose method isn't in the configured allowlist", () => {
    const { res, calls } = fakeResponse();
    const result = errorResponseScenario(
      { req: { method: "GET", path: "/" }, res },
      { methods: ["POST", "PUT", "PATCH", "DELETE"] },
    );

    expect(result).toBe("continue");
    expect(calls.status).toBeUndefined();
  });

  it("applies to a request whose method is in the configured allowlist", () => {
    const { res, calls } = fakeResponse();
    const result = errorResponseScenario(
      { req: { method: "post", path: "/" }, res },
      { methods: ["POST"] },
    );

    expect(result).toBe("terminated");
    expect(calls.status).toBe(500);
  });
});
