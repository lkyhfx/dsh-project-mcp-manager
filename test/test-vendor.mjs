import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

// DSH profiles are initialized with `autoInstallPeers: false`, so the plugin
// must carry the host @deepseek-ai/dsh-mcp-client needs. lib/ imports the
// provider through the manifest imports map, which points at vendor/loader.mjs.
const core = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const spec = JSON.parse(await readFile(new URL("../vendor/implementation.json", import.meta.url), "utf8"));
const provider = JSON.parse(await readFile(new URL(`../vendor/${spec.package}/package.json`, import.meta.url), "utf8"));

assert.equal(spec.version, provider.version, "vendor/implementation.json must track the pinned provider");
assert.equal(core.imports?.["#dsh-mcp-client"]?.default, "./vendor/loader.mjs", "lib must load the vendored provider through the imports map");
assert.ok(core.imports["#dsh-mcp-client"].types, "the alias needs a types target for tsc");
assert.equal(core.dependencies[spec.package], undefined, "the provider is vendored, not a registry dependency the profile must resolve");
assert.equal(core.devDependencies[spec.package], spec.version, "the checkout must install the provider version the vendor step copies");
assert.ok(core.files.includes("vendor"), "the tarball must ship the vendored host");
assert.equal(core.scripts["bundle:deps"], "node scripts/bundle-deps.mjs");

// Every host peer of the provider is pinned and resolvable from the provider's
// own node_modules, which is where Node looks first.
const pins = spec.hosts;
assert.equal(pins["@deepseek-ai/cordis"], "4.0.5", "every DSH package peers on cordis ~4.0.5");
for (const [peer, range] of Object.entries(provider.peerDependencies ?? {})) {
  const want = range.replace(/^[\^~]/, "");
  assert.ok(pins[peer]?.startsWith(want), `${peer} must stay pinned around ${want}, found ${pins[peer]}`);
  await access(new URL(`../vendor/${spec.package}/node_modules/${peer}/package.json`, import.meta.url)).catch(() =>
    assert.fail(`${peer} must be copied into the provider's own node_modules`),
  );
}
for (const [name, version] of Object.entries(pins)) {
  assert.equal(JSON.parse(await readFile(new URL(`../vendor/${name}/package.json`, import.meta.url), "utf8")).version, version, `${name} must be vendored at ${version}`);
}

const compiled = await readFile(new URL("../lib/registry.js", import.meta.url), "utf8");
assert.ok(compiled.includes('"#dsh-mcp-client"'), "the compiled host must use the vendored import, not the bare package name");
console.log("PASS  the plugin ships the dsh-mcp-client host its profile will not install");
