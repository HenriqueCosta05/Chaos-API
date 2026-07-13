import { cp } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, "..", "src", "dashboard", "ui");
const dest = path.join(__dirname, "..", "dist", "dashboard", "ui");

await cp(src, dest, { recursive: true });
console.log(`copied dashboard-ui: ${src} -> ${dest}`);
