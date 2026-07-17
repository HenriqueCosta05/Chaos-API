import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chaos } from "../../src/adapters/express.js";
import { StateStore } from "../../src/core/state-store.js";
import { resetGuardrailWarning } from "../../src/guardrail.js";

function buildApp(store: StateStore) {
  const app = express();
  app.use(chaos({ store }));
  app.get("/orders", (_req, res) => res.status(200).json({ ok: true }));
  app.get("/customers", (_req, res) => res.status(200).json({ ok: true }));
  return app;
}

describe("chaos() express adapter", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    resetGuardrailWarning();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("passes requests through untouched when no scenario is active", async () => {
    const store = new StateStore();
    const app = buildApp(store);

    const res = await request(app).get("/orders");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("returns the injected error for random-error", async () => {
    const store = new StateStore();
    store.register({ type: "random-error", options: { statusCodes: [503] } });
    const app = buildApp(store);

    const res = await request(app).get("/orders");
    expect(res.status).toBe(503);
  });

  it("only affects the matching route", async () => {
    const store = new StateStore();
    store.register({ type: "random-error", scope: { pattern: "/orders" } });
    const app = buildApp(store);

    const affected = await request(app).get("/orders");
    const unaffected = await request(app).get("/customers");

    expect(affected.status).toBe(500);
    expect(unaffected.status).toBe(200);
  });

  it("sets Retry-After for unavailable-503", async () => {
    const store = new StateStore();
    store.register({ type: "unavailable-503", options: { retryAfterSeconds: 15 } });
    const app = buildApp(store);

    const res = await request(app).get("/orders");
    expect(res.status).toBe(503);
    expect(res.headers["retry-after"]).toBe("15");
  });

  it("is blocked by the guardrail in production", async () => {
    process.env.NODE_ENV = "production";
    const store = new StateStore();
    store.register({ type: "random-error" });
    const app = buildApp(store);

    const res = await request(app).get("/orders");
    expect(res.status).toBe(200);
  });

  it("bypasses chaos scenarios for ignorePaths, even when the scenario matches", async () => {
    const store = new StateStore();
    store.register({ type: "random-error" });
    const app = express();
    app.use(chaos({ store, ignorePaths: ["/health*"] }));
    app.get("/health", (_req, res) => res.status(200).json({ ok: true }));
    app.get("/orders", (_req, res) => res.status(200).json({ ok: true }));

    const health = await request(app).get("/health");
    const orders = await request(app).get("/orders");

    expect(health.status).toBe(200);
    expect(orders.status).toBe(500);
  });
});
