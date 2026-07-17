export interface ControlApiEnvOptions {
  controlPort?: number;
  controlHost?: string;
  corsOrigin?: string;
}

export interface ResolvedControlApiConfig {
  port?: number;
  host: string;
  corsOrigin: string;
}

/**
 * Resolves control-API bind config: explicit `chaos()` options win, then `CHAOS_CONTROL_PORT` /
 * `CHAOS_CONTROL_HOST` / `CHAOS_CORS_ORIGIN` env vars, then hardcoded defaults. Lets ops move the
 * control API to a different port per environment (e.g. to dodge the `chaos-api dashboard`
 * CLI's demo control API, which defaults to the same 51820) without touching code.
 */
export function resolveControlApiConfig(options: ControlApiEnvOptions): ResolvedControlApiConfig {
  const envPort = process.env.CHAOS_CONTROL_PORT;
  return {
    port: options.controlPort ?? (envPort ? Number(envPort) : undefined),
    host: options.controlHost ?? process.env.CHAOS_CONTROL_HOST ?? "127.0.0.1",
    corsOrigin: options.corsOrigin ?? process.env.CHAOS_CORS_ORIGIN ?? "*",
  };
}
