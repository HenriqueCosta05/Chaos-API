import { afterEach, describe, expect, it } from "vitest";
import { resolveControlApiConfig } from "../../src/core/control-api-env.js";

describe("resolveControlApiConfig", () => {
  const keys = ["CHAOS_CONTROL_PORT", "CHAOS_CONTROL_HOST", "CHAOS_CORS_ORIGIN"] as const;
  const originalEnv: Record<string, string | undefined> = {};
  for (const key of keys) originalEnv[key] = process.env[key];

  afterEach(() => {
    for (const key of keys) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  it("defaults to 127.0.0.1 / '*' and an undefined port when nothing is set", () => {
    delete process.env.CHAOS_CONTROL_PORT;
    delete process.env.CHAOS_CONTROL_HOST;
    delete process.env.CHAOS_CORS_ORIGIN;

    expect(resolveControlApiConfig({})).toEqual({ port: undefined, host: "127.0.0.1", corsOrigin: "*" });
  });

  it("falls back to env vars when no options are passed", () => {
    process.env.CHAOS_CONTROL_PORT = "8787";
    process.env.CHAOS_CONTROL_HOST = "0.0.0.0";
    process.env.CHAOS_CORS_ORIGIN = "http://localhost:3000";

    expect(resolveControlApiConfig({})).toEqual({
      port: 8787,
      host: "0.0.0.0",
      corsOrigin: "http://localhost:3000",
    });
  });

  it("prefers explicit options over env vars", () => {
    process.env.CHAOS_CONTROL_PORT = "8787";
    process.env.CHAOS_CONTROL_HOST = "0.0.0.0";
    process.env.CHAOS_CORS_ORIGIN = "http://localhost:3000";

    expect(
      resolveControlApiConfig({ controlPort: 51820, controlHost: "127.0.0.1", corsOrigin: "https://dash.example" }),
    ).toEqual({ port: 51820, host: "127.0.0.1", corsOrigin: "https://dash.example" });
  });
});
