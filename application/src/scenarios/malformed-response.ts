import type { ScenarioHandler } from "../core/types.js";

export interface MalformedResponseOptions {
  statusCode?: number;
  /** Sent as-is; mismatched with the actual body on purpose (default: declares JSON, body is garbled text). */
  contentType?: string;
  /** JSON-serialized then truncated. Omitted = a built-in garbled JSON fragment. */
  body?: unknown;
  /** Fraction of the serialized body to keep, 0..1. Default 0.5 (cut mid-payload). */
  truncateRatio?: number;
}

const DEFAULT_GARBLED = '{"data": [{"id": 1, "nam';

function truncate(text: string, ratio: number): string {
  const clamped = Math.min(1, Math.max(0, ratio));
  return text.slice(0, Math.max(1, Math.floor(text.length * clamped)));
}

export const malformedResponseScenario: ScenarioHandler = (ctx, options) => {
  const {
    statusCode = 200,
    contentType = "application/json",
    body,
    truncateRatio = 0.5,
  } = options as MalformedResponseOptions;

  const payload = body !== undefined ? truncate(JSON.stringify(body), truncateRatio) : DEFAULT_GARBLED;

  ctx.res.header("Content-Type", contentType);
  ctx.res.status(statusCode);
  ctx.res.send(payload);
  return "terminated";
};
