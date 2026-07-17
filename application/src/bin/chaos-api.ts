#!/usr/bin/env node
import { ActivityLog } from "../core/activity-log.js";
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
    const controlPort = controlPortFlag ? Number(controlPortFlag) : DEFAULT_CONTROL_PORT;
    const controlHost = controlHostFlag ?? "127.0.0.1";
    const store = new StateStore();
    const activityLog = new ActivityLog();
    createControlApi(store, activityLog, { corsOrigin: corsOriginFlag }).listen(controlPort, controlHost, () => {
      console.log(
        `[chaos-api] standalone control API running at http://${controlHost}:${controlPort} ` +
          "(demo StateStore, not wired to a real app — pass --no-control-api if your app " +
          "already runs chaos({ controlPort }) itself)"
      );
    });
  }
} else {
  console.error(
    `Unknown command: ${command ?? "(none)"}. Usage: chaos-api dashboard ` +
      "[--port <n>] [--host <addr>] [--control-port <n>] [--control-host <addr>] [--cors-origin <origin>] [--no-control-api]"
  );
  process.exit(1);
}
