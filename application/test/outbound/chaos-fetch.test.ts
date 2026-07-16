import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StateStore } from "../../src/core/state-store.js";
import { createChaosFetch } from "../../src/outbound/chaos-fetch.js";
import { resetGuardrailWarning } from "../../src/guardrail.js";

describe("createChaosFetch", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    resetGuardrailWarning();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    vi.restoreAllMocks();
  });

  it("calls through to the real fetch when no outbound scenario matches the host", async () => {
    const store = new StateStore();
    const baseFetch = vi.fn().mockResolvedValue(new Response("ok"));
    const chaosFetch = createChaosFetch(store, { baseFetch });

    const res = await chaosFetch("https://api.stripe.com/v1/charges");

    expect(baseFetch).toHaveBeenCalledOnce();
    expect(await res.text()).toBe("ok");
  });

  it("short-circuits with a synthesized Response for a matching error-response outbound scenario", async () => {
    const store = new StateStore();
    store.register({
      type: "error-response",
      direction: "outbound",
      scope: { pattern: "api.stripe.com" },
      options: { statusCodes: [502], body: { error: "stripe down" } },
    });
    const baseFetch = vi.fn();
    const chaosFetch = createChaosFetch(store, { baseFetch });

    const res = await chaosFetch("https://api.stripe.com/v1/charges");

    expect(baseFetch).not.toHaveBeenCalled();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "stripe down" });
  });

  it("throws for a matching connection-reset outbound scenario", async () => {
    const store = new StateStore();
    store.register({ type: "connection-reset", direction: "outbound", scope: { pattern: "api.stripe.com" } });
    const baseFetch = vi.fn();
    const chaosFetch = createChaosFetch(store, { baseFetch });

    await expect(chaosFetch("https://api.stripe.com/v1/charges")).rejects.toThrow(TypeError);
    expect(baseFetch).not.toHaveBeenCalled();
  });

  it("ignores outbound scenarios scoped to a different host", async () => {
    const store = new StateStore();
    store.register({ type: "unavailable", direction: "outbound", scope: { pattern: "api.stripe.com" } });
    const baseFetch = vi.fn().mockResolvedValue(new Response("ok"));
    const chaosFetch = createChaosFetch(store, { baseFetch });

    await chaosFetch("https://s3.amazonaws.com/bucket/key");

    expect(baseFetch).toHaveBeenCalledOnce();
  });

  it("is blocked by the guardrail in production", async () => {
    process.env.NODE_ENV = "production";
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = new StateStore();
    store.register({ type: "unavailable", direction: "outbound" });
    const baseFetch = vi.fn().mockResolvedValue(new Response("ok"));
    const chaosFetch = createChaosFetch(store, { baseFetch });

    await chaosFetch("https://api.stripe.com/v1/charges");

    expect(baseFetch).toHaveBeenCalledOnce();
  });
});
