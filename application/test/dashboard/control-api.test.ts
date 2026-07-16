import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createControlApi } from "../../src/dashboard/server/control-api.js";
import { ActivityLog } from "../../src/core/activity-log.js";
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
      // legacy v1 type name — StateStore normalizes it to the v2 primitive "unavailable"
      body: JSON.stringify({ type: "unavailable-503", rate: 0.5 }),
    });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.type).toBe("unavailable");
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

  it("GET /api/activity returns an empty list when no ActivityLog was passed in", async () => {
    const res = await fetch(`${baseUrl}/api/activity`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual([]);
  });
});

describe("control API activity feed (docs/PRD.md 6.5)", () => {
  let store: StateStore;
  let activityLog: ActivityLog;
  let server: ReturnType<typeof createControlApi>;
  let baseUrl: string;

  beforeEach(async () => {
    store = new StateStore();
    activityLog = new ActivityLog();
    server = createControlApi(store, activityLog);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("GET /api/activity lists recorded events, newest first", async () => {
    activityLog.record({ scenarioId: "s1", scenarioType: "delay", direction: "inbound", method: "GET", path: "/a" });
    activityLog.record({
      scenarioId: "s2",
      scenarioType: "unavailable",
      direction: "outbound",
      method: "GET",
      path: "api.stripe.com",
    });

    const res = await fetch(`${baseUrl}/api/activity`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(2);
    expect(body[0].scenarioId).toBe("s2");
  });

  it("GET /api/activity?limit=1 caps the returned events", async () => {
    activityLog.record({ scenarioId: "s1", scenarioType: "delay", direction: "inbound", method: "GET", path: "/a" });
    activityLog.record({ scenarioId: "s2", scenarioType: "delay", direction: "inbound", method: "GET", path: "/b" });

    const res = await fetch(`${baseUrl}/api/activity?limit=1`);
    const body = await res.json();

    expect(body).toHaveLength(1);
    expect(body[0].scenarioId).toBe("s2");
  });
});
