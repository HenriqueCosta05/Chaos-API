import { globToRegex } from "./state-store.js";

export type IgnorePathPattern = string | RegExp;

/**
 * True if `path` matches one of the configured ignore patterns — those requests bypass chaos
 * scenarios entirely (e.g. health checks, the control API's own routes when mounted on the same
 * server as the host app). String patterns use the same glob syntax as scenario scopes (`*`).
 */
export function isIgnoredPath(path: string, patterns?: IgnorePathPattern[]): boolean {
  if (!patterns?.length) return false;
  return patterns.some((pattern) => (typeof pattern === "string" ? globToRegex(pattern) : pattern).test(path));
}
