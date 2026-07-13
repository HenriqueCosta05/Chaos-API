import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chaosFastifyPlugin } from "../../src/adapters/fastify.js";
import { StateStore } from "../../src/core/state-store.js";
import { resetGuardrailWarning } from "../../src/guardrail.js";

async function buildApp(store: StateStore) {
  const app = Fastify();
  await app.register(chaosFastifyPlugin({ store }));
  app.get("/orders", async () => ({ ok: true }));
  app.get("/customers", async () => ({ ok: true }));
  await app.ready();
  return app;
}

describe("chaosFastifyPlugin", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    resetGuardrailWarning();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("passes requests through untouched when no scenario is active", async () => {
    const store = new StateStore();
    const app = await buildApp(store);

    const res = await app.inject({ method: "GET", url: "/orders" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it("returns the injected error for random-error", async () => {
    const store = new StateStore();
    store.register({ type: "random-error", options: { statusCodes: [503] } });
    const app = await buildApp(store);

    const res = await app.inject({ method: "GET", url: "/orders" });
    expect(res.statusCode).toBe(503);
  });

  it("only affects the matching route", async () => {
    const store = new StateStore();
    store.register({ type: "random-error", scope: { pattern: "/orders" } });
    const app = await buildApp(store);

    const affected = await app.inject({ method: "GET", url: "/orders" });
    const unaffected = await app.inject({ method: "GET", url: "/customers" });

    expect(affected.statusCode).toBe(500);
    expect(unaffected.statusCode).toBe(200);
  });

  it("sets Retry-After for unavailable-503", async () => {
    const store = new StateStore();
    store.register({ type: "unavailable-503", options: { retryAfterSeconds: 15 } });
    const app = await buildApp(store);

    const res = await app.inject({ method: "GET", url: "/orders" });
    expect(res.statusCode).toBe(503);
    expect(res.headers["retry-after"]).toBe("15");
  });

  it("is blocked by the guardrail in production", async () => {
    process.env.NODE_ENV = "production";
    const store = new StateStore();
    store.register({ type: "random-error" });
    const app = await buildApp(store);

    const res = await app.inject({ method: "GET", url: "/orders" });
    expect(res.statusCode).toBe(200);
  });
});
