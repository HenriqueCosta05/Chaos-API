import { ScenarioEngine } from "../core/scenario-engine.js";
import type { StateStore } from "../core/state-store.js";
import type { ChaosResponseController } from "../core/types.js";
import { isBlockedByGuardrail, type GuardrailOptions } from "../guardrail.js";

export interface ChaosFetchOptions extends GuardrailOptions {
  /** Real fetch to call through to when no outbound scenario applies. Defaults to global `fetch`. */
  baseFetch?: typeof fetch;
}

function extractHost(input: string | URL | Request): string {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return new URL(url).host;
}

function bodyToString(body: unknown): string {
  return typeof body === "string" ? body : JSON.stringify(body ?? null);
}

interface RecordedResponse {
  status?: number;
  headers: Record<string, string>;
  body?: unknown;
}

/**
 * Wraps `fetch` so outbound calls can be intercepted by chaos scenarios scoped to a
 * destination host (docs/PRD.md 6.4) — same `StateStore` the inbound middleware uses, scenarios
 * registered with `{ direction: "outbound" }`. Fast-path: calls straight through to the real
 * fetch when no outbound scenario matches the destination host, same no-op principle as inbound.
 */
export function createChaosFetch(store: StateStore, options: ChaosFetchOptions = {}): typeof fetch {
  const baseFetch = options.baseFetch ?? fetch;
  const engine = new ScenarioEngine(store);

  return (async (input: string | URL | Request, init?: RequestInit) => {
    const host = extractHost(input);

    if (isBlockedByGuardrail(options) || store.getActiveOutbound(host).length === 0) {
      return baseFetch(input, init);
    }

    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const recorded: RecordedResponse = { headers: {} };
    const controller: ChaosResponseController = {
      status: (code) => {
        recorded.status = code;
      },
      header: (name, value) => {
        recorded.headers[name] = value;
      },
      send: (body) => {
        recorded.body = body;
      },
    };

    const result = await engine.resolveOutbound({ method, path: host }, controller);
    if (result === "continue") {
      return baseFetch(input, init);
    }

    if (recorded.status === undefined) {
      // connection-reset: no response was ever written — simulate a dropped/failed connection.
      throw new TypeError("chaos-api: simulated network failure (connection-reset)");
    }

    const headers = new Headers(recorded.headers);
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    return new Response(bodyToString(recorded.body), { status: recorded.status, headers });
  }) as typeof fetch;
}
