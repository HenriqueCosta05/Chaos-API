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
  startDashboard({ port: portFlag ? Number(portFlag) : undefined });

  if (!hasFlag("--no-control-api")) {
    const controlPortFlag = flagValue("--control-port");
    const controlPort = controlPortFlag ? Number(controlPortFlag) : DEFAULT_CONTROL_PORT;
    const store = new StateStore();
    const activityLog = new ActivityLog();
    createControlApi(store, activityLog).listen(controlPort, () => {
      console.log(
        `[chaos-api] standalone control API running at http://localhost:${controlPort} ` +
          "(demo StateStore, not wired to a real app — pass --no-control-api if your app " +
          "already runs chaos({ controlPort }) itself)"
      );
    });
  }
} else {
  console.error(
    `Unknown command: ${command ?? "(none)"}. Usage: chaos-api dashboard [--port <n>] [--control-port <n>] [--no-control-api]`
  );
  process.exit(1);
}
