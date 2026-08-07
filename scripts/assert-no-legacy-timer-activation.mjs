import fs from "node:fs";
import path from "node:path";

const roots = ["src/app", "src/lib", "src/components"];
const forbidden = /activateTimersForUser\s*\(/;
const offenders = [];

function visit(file) {
  if (!fs.statSync(file).isFile() || !/\.(ts|tsx)$/.test(file)) return;
  const text = fs.readFileSync(file, "utf8");
  if (forbidden.test(text) && !file.endsWith("response-timer.service.ts")) offenders.push(file);
}
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    entry.isDirectory() ? walk(file) : visit(file);
  }
}
roots.forEach((root) => walk(root));
if (offenders.length) {
  console.error("Legacy timer activation remains in:", offenders.join(", "));
  process.exit(1);
}
console.log("No legacy timer activation call sites found");
