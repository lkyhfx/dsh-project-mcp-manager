// Remove build output: the core, the UI, and the vendored host copy (which is
// regenerated from node_modules by bundle-deps.mjs).
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
for (const dir of ["lib", "packages/ui/lib"]) rmSync(join(root, dir), { recursive: true, force: true });
const vendor = join(root, "vendor");
for (const entry of readdirSync(vendor)) {
  if (entry === "implementation.json" || entry === "loader.d.mts" || entry === "loader.mjs") continue;
  rmSync(join(vendor, entry), { recursive: true, force: true });
}
