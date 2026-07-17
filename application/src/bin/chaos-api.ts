#!/usr/bin/env node
import { ActivityLog } from "../core/activity-log.js";
import { resolveControlApiConfig } from "../core/control-api-env.js";
import { warnOnPortCollision } from "../core/safe-listen.js";
import { StateStore } from "../core/state-store.js";
import { createControlApi } from "../dashboard/server/control-api.js";
import { startDashboard } from "../dashboard/server/index.js";

const [, , command, ...rest] = process.argv;
const DEFAULT_CONTROL_PORT = 51820;

function flagValue(flag: string): string | undefined {
  const index = rest.indexOf(flag);
  return index >= 0 ? rest[index + 1] : undefined;
}

function hasFlag(flag: string): boolean {
  return rest.includes(flag);
}

if (command === "dashboard") {
  const portFlag = flagValue("--port");
  const hostFlag = flagValue("--host");
  startDashboard({ port: portFlag ? Number(portFlag) : undefined, host: hostFlag });

  if (!hasFlag("--no-control-api")) {
    const controlPortFlag = flagValue("--control-port");
    const controlHostFlag = flagValue("--control-host");
    const corsOriginFlag = flagValue("--cors-origin");
    const config = resolveControlApiConfig({
      controlPort: controlPortFlag ? Number(controlPortFlag) : undefined,
      controlHost: controlHostFlag,
      corsOrigin: corsOriginFlag,
    });
    const controlPort = config.port ?? DEFAULT_CONTROL_PORT;
    const store = new StateStore();
    const activityLog = new ActivityLog();
    const server = createControlApi(store, activityLog, { corsOrigin: config.corsOrigin }).listen(
      controlPort,
      config.host,
      () => {
        console.log(
          `[chaos-api] standalone control API running at http://${config.host}:${controlPort} ` +
            "(demo StateStore, not wired to a real app — pass --no-control-api if your app " +
            "already runs chaos({ controlPort }) itself)"
        );
      },
    );
    warnOnPortCollision(server, "standalone control API", controlPort, config.host);
  }
} else {
  console.error(
    `Unknown command: ${command ?? "(none)"}. Usage: chaos-api dashboard ` +
      "[--port <n>] [--host <addr>] [--control-port <n>] [--control-host <addr>] [--cors-origin <origin>] [--no-control-api]"
  );
  process.exit(1);
}
