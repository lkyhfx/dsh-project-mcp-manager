// Reject a Git install after fetch when the checkout cannot
// produce a working plugin.
//
// A Git-hosted dependency is packed from the checked-out tree, never built in
// place: pnpm runs scripts only for a package that declares `prepare`, and a
// DeepSeek Harness profile cannot allow that for a Git source. `prepack` and
// `prepare` therefore stay out of the root manifest, and the tested plugin is
// the published tarball (`pnpm pack` folds the built UI into it). This hook
// explains that instead of letting the install fail later with a raw
// MODULE_NOT_FOUND.
import { existsSync, readFileSync } from "node:fs";

const root = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const ui = JSON.parse(readFileSync(new URL("../packages/ui/package.json", import.meta.url), "utf8"));

if (ui.private !== true) {
  throw new Error("packages/ui must stay private: it ships inside the loader tarball, never installed on its own");
}
if (root.dependencies[ui.name] !== undefined) {
  throw new Error(
    `the ${root.name} manifest must not depend on ${ui.name}: a Git install cannot resolve workspace: dependencies. ` +
      "Run `pnpm install && pnpm run build`, then `pnpm pack`.",
  );
}
if (root.dependencies["@deepseek-ai/dsh-mcp-client"] === undefined) {
  throw new Error("the loader must declare @deepseek-ai/dsh-mcp-client so its peer closure installs with the plugin");
}

const missing = ["lib/index.js", "packages/ui/lib/index.js", "packages/ui/lib/client.js"].filter(
  (file) => !existsSync(new URL(`../${file}`, import.meta.url)),
);
if (missing.length === 0) process.exit(0);

// A published tarball always carries the build output, so this only happens for
// a Git checkout, a `link:`, or a stale pack. Name what is missing and fail the
// install rather than let the profile mount a broken bundle.
process.stderr.write(
  [
    `dsh-project-mcp-manager: ${missing.join(", ")} missing from this install.`,
    "Git installs of this repository are not built: pnpm never runs a Git package's build scripts.",
    `Install the published tarball instead: dsh plugin --profile web add ${root.name}@latest`,
    "Or for a local checkout: pnpm install && pnpm run build, then dsh plugin --profile web add link:<checkout>",
    "",
  ].join("\n"),
);
process.exit(1);
