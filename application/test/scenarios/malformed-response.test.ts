import { describe, expect, it } from "vitest";
import { malformedResponseScenario } from "../../src/scenarios/malformed-response.js";

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

describe("malformedResponseScenario", () => {
  it("defaults to 200, application/json content-type, and a built-in garbled body", () => {
    const { res, calls } = fakeResponse();
    const result = malformedResponseScenario({ req: { method: "GET", path: "/" }, res }, {});

    expect(result).toBe("terminated");
    expect(calls.status).toBe(200);
    expect(calls.headers["Content-Type"]).toBe("application/json");
    expect(typeof calls.body).toBe("string");
    expect(() => JSON.parse(calls.body as string)).toThrow();
  });

  it("truncates a provided body to the configured ratio", () => {
    const { res, calls } = fakeResponse();
    const full = JSON.stringify({ hello: "world" });
    malformedResponseScenario({ req: { method: "GET", path: "/" }, res }, { body: { hello: "world" }, truncateRatio: 0.5 });

    expect(calls.body).toBe(full.slice(0, Math.floor(full.length * 0.5)));
  });

  it("uses a custom status code and content type", () => {
    const { res, calls } = fakeResponse();
    malformedResponseScenario(
      { req: { method: "GET", path: "/" }, res },
      { statusCode: 502, contentType: "text/html" },
    );

    expect(calls.status).toBe(502);
    expect(calls.headers["Content-Type"]).toBe("text/html");
  });
});
