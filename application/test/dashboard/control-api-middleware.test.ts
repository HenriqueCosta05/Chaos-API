import express from "express";
import Fastify from "fastify";
import Koa from "koa";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createControlApiFastifyPlugin } from "../../src/adapters/fastify.js";
import { createControlApiKoaMiddleware } from "../../src/adapters/koa.js";
import { StateStore } from "../../src/core/state-store.js";
import { createControlApiMiddleware } from "../../src/dashboard/server/control-api.js";

describe("createControlApiMiddleware (Express/Nest)", () => {
  function buildApp(store: StateStore) {
    const app = express();
    app.use(createControlApiMiddleware(store));
    app.get("/orders", (_req, res) => res.status(200).json({ ok: true }));
    return app;
  }

  it("serves control API routes", async () => {
    const store = new StateStore();
    store.register({ type: "delay" });
    const app = buildApp(store);

    const res = await request(app).get("/api/scenarios");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("falls through to the host's own routes untouched", async () => {
    const store = new StateStore();
    const app = buildApp(store);

    const res = await request(app).get("/orders");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("still resolves control API routes when mounted under a host base path", async () => {
    const store = new StateStore();
    store.register({ type: "delay" });
    const app = express();
    app.use("/api/v1/notebooks", createControlApiMiddleware(store));
    app.get("/orders", (_req, res) => res.status(200).json({ ok: true }));

    const res = await request(app).get("/api/v1/notebooks/api/scenarios");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("404s for an unknown path with no host route registered", async () => {
    const store = new StateStore();
    const app = buildApp(store);

    const res = await request(app).get("/nope");
    expect(res.status).toBe(404);
  });
});

describe("createControlApiFastifyPlugin", () => {
  it("serves control API routes and falls through to the host's own routes", async () => {
    const store = new StateStore();
    store.register({ type: "delay" });
    const app = Fastify();
    await app.register(createControlApiFastifyPlugin(store));
    app.get("/orders", async () => ({ ok: true }));
    await app.ready();

    const apiRes = await app.inject({ method: "GET", url: "/api/scenarios" });
    expect(apiRes.statusCode).toBe(200);
    expect(apiRes.json()).toHaveLength(1);

    const hostRes = await app.inject({ method: "GET", url: "/orders" });
    expect(hostRes.statusCode).toBe(200);
    expect(hostRes.json()).toEqual({ ok: true });
  });
});

describe("createControlApiKoaMiddleware", () => {
  it("serves control API routes and falls through to the host's own routes", async () => {
    const store = new StateStore();
    store.register({ type: "delay" });
    const app = new Koa();
    app.use(createControlApiKoaMiddleware(store));
    app.use(async (ctx) => {
      if (ctx.path === "/orders") {
        ctx.body = { ok: true };
      }
    });

    const server = app.listen(0);
    const port = (server.address() as { port: number }).port;

    const apiRes = await fetch(`http://127.0.0.1:${port}/api/scenarios`);
    expect(apiRes.status).toBe(200);
    expect(await apiRes.json()).toHaveLength(1);

    const hostRes = await fetch(`http://127.0.0.1:${port}/orders`);
    expect(hostRes.status).toBe(200);
    expect(await hostRes.json()).toEqual({ ok: true });

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
