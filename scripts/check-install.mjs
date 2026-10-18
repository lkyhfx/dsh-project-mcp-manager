// Explain an unbuilt install instead of letting the profile mount a broken
// plugin.
//
// A Git-hosted dependency is packed from the checked-out tree and pnpm refuses
// any Git source that declares a build or prepublish script (prepare, prepack,
// publish); a DeepSeek Harness profile cannot allow that. Those scripts stay out
// of the root manifest, so a Git install can never contain this repository's
// build output — including the vendored DSH host under vendor/.
import { existsSync, readFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname;
const core = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const spec = JSON.parse(readFileSync(new URL("../vendor/implementation.json", import.meta.url), "utf8"));

if (core.imports?.["#dsh-mcp-client"]?.default !== "./vendor/loader.mjs") {
  throw new Error("package.json must map #dsh-mcp-client to ./vendor/loader.mjs");
}
if (core.dependencies[spec.package] !== undefined) {
  throw new Error(`${spec.package} must stay a development dependency: the vendored copy under vendor/ is the one the plugin loads`);
}

const missing = [
  "lib/index.js",
  "packages/ui/lib/index.js",
  "packages/ui/lib/client.js",
  `vendor/${spec.package}/${spec.entry}`,
  "vendor/@deepseek-ai/dsh-scope/package.json",
].filter((file) => !existsSync(new URL(`../${file}`, import.meta.url)));
if (missing.length === 0) process.exit(0);

// A published tarball always carries the build output and the vendored host, so
// this only happens for a Git checkout, a `link:`, or a stale pack. Name what
// is missing and fail the install.
process.stderr.write(
  [
    `dsh-project-mcp-manager: ${missing.join(", ")} missing from this install.`,
    "Git installs of this repository are not built: pnpm never runs a Git package's build scripts.",
    `Install the published tarball instead: dsh plugin --profile web add ${core.name}@latest`,
    "Or for a local checkout: pnpm install && pnpm run build, then dsh plugin --profile web add link:<checkout>",
    "",
  ].join("\n"),
);
process.exit(1);
