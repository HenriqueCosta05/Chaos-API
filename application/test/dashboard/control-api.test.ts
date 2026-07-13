import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createControlApi } from "../../src/dashboard/server/control-api.js";
import { StateStore } from "../../src/core/state-store.js";

describe("control API", () => {
  let store: StateStore;
  let server: ReturnType<typeof createControlApi>;
  let baseUrl: string;

  beforeEach(async () => {
    store = new StateStore();
    server = createControlApi(store);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("GET /api/scenarios lists registered scenarios", async () => {
    store.register({ type: "delay" });

    const res = await fetch(`${baseUrl}/api/scenarios`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].type).toBe("delay");
  });

  it("POST /api/scenarios registers a scenario", async () => {
    const res = await fetch(`${baseUrl}/api/scenarios`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "unavailable-503", rate: 0.5 }),
    });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.type).toBe("unavailable-503");
    expect(store.list()).toHaveLength(1);
  });

  it("POST /api/scenarios rejects an invalid body", async () => {
    const res = await fetch(`${baseUrl}/api/scenarios`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    expect(res.status).toBe(400);
  });

  it("PATCH /api/scenarios/:id updates a scenario", async () => {
    const scenario = store.register({ type: "delay" });

    const res = await fetch(`${baseUrl}/api/scenarios/${scenario.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.enabled).toBe(false);
  });

  it("PATCH /api/scenarios/:id returns 404 for an unknown id", async () => {
    const res = await fetch(`${baseUrl}/api/scenarios/missing`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });

    expect(res.status).toBe(404);
  });

  it("DELETE /api/scenarios/:id removes a scenario", async () => {
    const scenario = store.register({ type: "delay" });

    const res = await fetch(`${baseUrl}/api/scenarios/${scenario.id}`, { method: "DELETE" });

    expect(res.status).toBe(204);
    expect(store.list()).toHaveLength(0);
  });

  it("responds to CORS preflight", async () => {
    const res = await fetch(`${baseUrl}/api/scenarios`, { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});
