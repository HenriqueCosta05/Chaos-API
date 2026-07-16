import Koa from "koa";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chaosKoaMiddleware } from "../../src/adapters/koa.js";
import { StateStore } from "../../src/core/state-store.js";
import { resetGuardrailWarning } from "../../src/guardrail.js";

function buildApp(store: StateStore) {
  const app = new Koa();
  app.use(chaosKoaMiddleware({ store }));
  app.use((ctx) => {
    if (ctx.path === "/orders" || ctx.path === "/customers") {
      ctx.status = 200;
      ctx.body = { ok: true };
    }
  });
  return app;
}

describe("chaosKoaMiddleware", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    resetGuardrailWarning();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("passes requests through untouched when no scenario is active", async () => {
    const store = new StateStore();
    const res = await request(buildApp(store).callback()).get("/orders");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("returns the injected error for error-response", async () => {
    const store = new StateStore();
    store.register({ type: "error-response", options: { statusCodes: [503] } });

    const res = await request(buildApp(store).callback()).get("/orders");
    expect(res.status).toBe(503);
  });

  it("only affects the matching route", async () => {
    const store = new StateStore();
    store.register({ type: "error-response", scope: { pattern: "/orders" } });
    const app = buildApp(store).callback();

    const affected = await request(app).get("/orders");
    const unaffected = await request(app).get("/customers");

    expect(affected.status).toBe(500);
    expect(unaffected.status).toBe(200);
  });

  it("sets Retry-After for unavailable", async () => {
    const store = new StateStore();
    store.register({ type: "unavailable", options: { retryAfterSeconds: 15 } });

    const res = await request(buildApp(store).callback()).get("/orders");
    expect(res.status).toBe(503);
    expect(res.headers["retry-after"]).toBe("15");
  });

  it("is blocked by the guardrail in production", async () => {
    process.env.NODE_ENV = "production";
    const store = new StateStore();
    store.register({ type: "error-response" });

    const res = await request(buildApp(store).callback()).get("/orders");
    expect(res.status).toBe(200);
  });

  it("exposes store and activityLog", () => {
    const store = new StateStore();
    const middleware = chaosKoaMiddleware({ store });

    expect(middleware.store).toBe(store);
    expect(middleware.activityLog).toBeDefined();
  });
});
