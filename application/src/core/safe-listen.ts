import type { Server } from "node:http";

/**
 * Attaches an `error` handler that turns EADDRINUSE into a clear, actionable log line instead of
 * an unhandled-exception crash of the whole process. Two chaos-api control APIs easily end up on
 * the same port (e.g. `chaos-api dashboard`'s demo control API defaults to 51820, same as the
 * README's `chaos({ controlPort: 51820 })` example) — without this, whichever `.listen()` call
 * loses the race silently kills its entire process, and the dashboard ends up talking to
 * whichever StateStore *did* win the bind, with no indication anything went wrong.
 */
export function warnOnPortCollision(server: Server, label: string, port: number, host: string): Server {
  server.on("error", (err) => {
    if ((err as NodeJS.ErrnoException).code !== "EADDRINUSE") throw err;
    console.error(
      `[chaos-api] ${label} could not bind ${host}:${port} — address already in use. ` +
        "Another chaos-api process is likely already bound there (e.g. `chaos-api dashboard` " +
        "without --no-control-api running next to an app that already runs chaos({ controlPort }))." +
        " Pick a different port (CHAOS_CONTROL_PORT env var or the controlPort/--control-port option).",
    );
  });
  return server;
}
