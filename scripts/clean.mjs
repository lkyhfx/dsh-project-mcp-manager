// Remove build output: the core and the UI. The vendored host under vendor/ is
// re-copied by bundle-deps.mjs on every build, after this step, so it can go.
import { rmSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
for (const dir of ["lib", "packages/ui/lib"]) rmSync(join(root, dir), { recursive: true, force: true });
