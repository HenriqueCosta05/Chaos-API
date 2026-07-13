#!/usr/bin/env node
import { startDashboard } from "../dashboard/server/index.js";

const [, , command, ...rest] = process.argv;

function flagValue(flag: string): string | undefined {
  const index = rest.indexOf(flag);
  return index >= 0 ? rest[index + 1] : undefined;
}

if (command === "dashboard") {
  const portFlag = flagValue("--port");
  startDashboard({ port: portFlag ? Number(portFlag) : undefined });
} else {
  console.error(`Unknown command: ${command ?? "(none)"}. Usage: chaos-api dashboard [--port <n>]`);
  process.exit(1);
}
