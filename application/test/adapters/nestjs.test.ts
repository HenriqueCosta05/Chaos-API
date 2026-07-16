import express from "express";
import request from "supertest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createChaosNestMiddleware } from "../../src/adapters/nestjs.js";
import { StateStore } from "../../src/core/state-store.js";
import { resetGuardrailWarning } from "../../src/guardrail.js";

describe("createChaosNestMiddleware — platform-express shape (res.status/res.send)", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    resetGuardrailWarning();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  function buildApp(store: StateStore) {
    const app = express();
    app.use(createChaosNestMiddleware({ store }));
    app.get("/orders", (_req, res) => res.status(200).json({ ok: true }));
    return app;
  }

  it("passes requests through untouched when no scenario is active", async () => {
    const store = new StateStore();
    const res = await request(buildApp(store)).get("/orders");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("applies an active error-response scenario", async () => {
    const store = new StateStore();
    store.register({ type: "error-response", options: { statusCodes: [503] } });

    const res = await request(buildApp(store)).get("/orders");
    expect(res.status).toBe(503);
  });

  it("is blocked by the guardrail in production", async () => {
    process.env.NODE_ENV = "production";
    const store = new StateStore();
    store.register({ type: "error-response" });

    const res = await request(buildApp(store)).get("/orders");
    expect(res.status).toBe(200);
  });

  it("exposes store and activityLog", () => {
    const store = new StateStore();
    const middleware = createChaosNestMiddleware({ store });

    expect(middleware.store).toBe(store);
    expect(middleware.activityLog).toBeDefined();
  });
});

describe("createChaosNestMiddleware — platform-fastify shape (raw http.ServerResponse)", () => {
  it("falls back to statusCode/end when res has no status()/send()", async () => {
    const store = new StateStore();
    store.register({ type: "error-response", options: { statusCodes: [503], body: "down" } });
    const middleware = createChaosNestMiddleware({ store });

    const server = createServer((req, res) => {
      middleware(req, res, () => {
        res.statusCode = 200;
        res.end("ok");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;

    const res = await fetch(`http://127.0.0.1:${port}/orders`);
    const text = await res.text();

    await new Promise<void>((resolve) => server.close(() => resolve()));

    expect(res.status).toBe(503);
    expect(text).toBe("down");
  });
});
