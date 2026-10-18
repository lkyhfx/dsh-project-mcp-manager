import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parse } from "yaml";

const root = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const ui = JSON.parse(await readFile(new URL("../packages/ui/package.json", import.meta.url), "utf8"));
const patch = parse(await readFile(new URL("../cordis.patch.yml", import.meta.url), "utf8"));

assert.equal(ui.version, root.version, "loader and UI must be released together");
assert.equal(ui.private, true, "the UI ships inside the loader tarball and is never installed on its own");
assert.equal(root.dependencies[ui.name], undefined, "a Git install cannot resolve workspace: — the loader must not depend on the UI package");
assert.equal(ui.peerDependencies?.[root.name], undefined, "UI ships inside the loader, so it has no separate peer to satisfy");
assert.equal(root.optionalDependencies?.[ui.name], undefined, "UI is shipped by default, not optional");
assert.equal(root.dsh.bundle.patch, "./cordis.patch.yml");
assert.ok(root.files.includes("cordis.patch.yml"));
assert.equal(ui.dsh.bundle, undefined, "UI must not insert another independently selected bundle layer");
assert.ok(!ui.files.includes("cordis.patch.yml"));
assert.deepEqual(patch.flatMap((item) => item.insert ?? []).map(({ id, name, disabled }) => ({ id, name, disabled })), [
  { id: "mcp-project", name: root.name, disabled: undefined },
  { id: "mcp-project-ui", name: ui.name, disabled: undefined }
]);
assert.equal(ui.dsh.client.platform, "web");
assert.equal(ui.exports["./client"], "./lib/client.js");
assert.ok(ui.files.includes("lib"));

// A Git install is packed, never built by pnpm: a Git-hosted package that
// declares any build or prepublish script (prepare, prepack, publish) is
// refused outright. Keep the local scripts, and explain the gap in INSTALL.
assert.equal(root.scripts["build:ui"], "npm --prefix packages/ui run build");
assert.equal(root.scripts.build, "npm run clean && npm run build:core && npm run build:ui");
assert.equal(root.scripts.prepack, undefined, "prepack (a prepublish script) makes pnpm refuse every Git install of this repository");
assert.equal(root.scripts.publish, undefined, "publish (a prepublish script) makes pnpm refuse every Git install of this repository");
assert.equal(root.scripts.prepare, undefined, "a prepare script makes pnpm refuse every Git install of this repository");
assert.equal(root.scripts.INSTALL, "node scripts/check-install.mjs", "the INSTALL hook must explain an unbuilt Git install");
for (const file of ["../lib/index.js", "../lib/index.d.ts", "../packages/ui/lib/index.js", "../packages/ui/lib/index.d.ts", "../packages/ui/lib/client.js"]) {
  assert.ok((await readFile(new URL(file, import.meta.url), "utf8")).length > 0, `${file} must be built before packaging`);
}
const client = await readFile(new URL("../packages/ui/lib/client.js", import.meta.url), "utf8");
assert.ok(client.includes('id: "dsh-project-mcp-ui"'), "browser module identity must stay on the full UI package name");
console.log("PASS  default bundle ships loader and same-version UI components with built artifacts");

// Profiles are initialized with autoInstallPeers: false, so the loader must
// bring its host peers as regular dependencies; otherwise the profile cannot
// load @deepseek-ai/dsh-mcp-client.
const runtime = JSON.parse(await readFile(new URL("../packages/dsh-runtime/package.json", import.meta.url), "utf8"));
assert.equal(root.dependencies[runtime.name], "file:./packages/dsh-runtime", "the loader must ship the host-peer closure via the vendored runtime package");
assert.equal(runtime.dependencies["@deepseek-ai/cordis"], "4.0.5", "DSH packages peer on cordis ~4.0.5");
assert.equal(runtime.dependencies["@deepseek-ai/dsh-mcp-client"], undefined, "the provider is the loader's own dependency, not a second copy");
for (const name of ["@deepseek-ai/dsh-mcp-client"]) {
  const peers = JSON.parse(await readFile(new URL(`../node_modules/${name}/package.json`, import.meta.url), "utf8")).peerDependencies;
  for (const [peer, range] of Object.entries(peers)) {
    if (peer === "@deepseek-ai/cordis") continue;
    assert.equal(runtime.dependencies[peer]?.replace(/[\^~]/, ""), range.replace(/[\^~]/, ""), `${peer} @${range} must be pinned in packages/dsh-runtime`);
  }
}
console.log("PASS  the loader ships the dsh-mcp-client host-peer closure");
