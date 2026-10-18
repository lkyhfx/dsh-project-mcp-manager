// Vendor the DSH packages @deepseek-ai/dsh-mcp-client needs into the plugin, so
// a profile can install the plugin while keeping the official
// `autoInstallPeers: false`.
//
// The provider declares its host (cordis, dsh-scope, dsh-tools, …) as peer
// dependencies, and a DSH profile never installs peers, so the plugin would
// fail to load with `Cannot find package '@deepseek-ai/dsh-scope'`. This script
// copies one pinned version of each closure package under `vendor/<name>/`,
// plus that package's declared dependencies inside its own
// `vendor/<name>/node_modules`. Symlinks are not used: npm-packlist drops them
// from the tarball. Instead, `vendor/loader.mjs` is imported through the
// manifest `imports` map and re-exports the provider, so the provider resolves
// through its vendored tree with plain static imports.
//
// Every host package gets its own declared dependencies under its node_modules,
// and the provider gets the pinned host packages there too: Node resolves a
// package's own node_modules before anything above it, so the vendored copies
// win over whatever the profile has installed, and the singleton services DSH
// shares (cordis, util-values, …) stay single instances.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const root = new URL("..", import.meta.url).pathname;
const specPath = join(root, "vendor/implementation.json");
if (!existsSync(specPath)) throw new Error("vendor/implementation.json is missing (the clean step removed vendor/); restore it from Git and rerun");
const implementation = JSON.parse(readFileSync(specPath, "utf8"));
const VERSION = implementation.version;
const PROVIDER = implementation.package;

// The host closure (name → pinned version) lives in vendor/implementation.json.
const RUNTIME = implementation.hosts;

/**
 * Copy compiled output keeping only the files Node loads. Declarations (*.d.ts)
 * and source maps are for editors, never read at runtime, and make up most of
 * the vendored size.
 */
function copyDist(source, target) {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (/\.(d\.(m|c)?ts|map)$/.test(entry.name)) continue;
    const from = join(source, entry.name);
    const to = join(target, entry.name);
    if (entry.isDirectory()) copyDist(from, to);
    else cpSync(from, to, { dereference: true });
  }
}

/** Copy one installed package's tree without its own node_modules. */
function copyPackage(source, target) {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = join(source, entry.name);
    const to = join(target, entry.name);
    if (entry.name === "node_modules" || entry.name.endsWith(".tsbuildinfo")) continue;
    if (entry.isDirectory() && ["dist", "lib", "build"].includes(entry.name)) {
      copyDist(from, to);
      continue;
    }
    if (entry.isFile() && /\.(d\.(m|c)?ts|map)$/.test(entry.name)) continue;
    cpSync(from, to, { recursive: true, dereference: true });
  }
}

/** Resolve `name` from `fromDir`, falling back to the hoisted tree or the pnpm virtual store. */
function locate(name, fromDir) {
  const manifestOf = (dir) => join(dir, "package.json");
  try {
    return dirname(realpathSync(require.resolve(name + "/package.json", { paths: [fromDir] })));
  } catch {}
  const hoisted = join(root, "node_modules", name);
  if (existsSync(manifestOf(hoisted))) return realpathSync(hoisted);
  const store = join(root, "node_modules", ".pnpm");
  if (!existsSync(store)) return undefined;
  const escaped = name.replace("/", "+");
  for (const entry of readdirSync(store)) {
    if (entry !== escaped && !entry.startsWith(`${escaped}@`)) continue;
    const candidate = join(store, entry, "node_modules", name);
    if (existsSync(manifestOf(candidate))) return realpathSync(candidate);
  }
  return undefined;
}

/**
 * Copy a package's declared dependencies (and theirs) into its own
 * node_modules, where Node resolves them before anything else. The vendored
 * copy of a host package therefore wins over a profile-installed one.
 */
function vendorDependencies(packageRoot, source, seen = new Set()) {
  const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  for (const name of Object.keys(manifest.dependencies ?? {})) {
    const target = join(packageRoot, "node_modules", name);
    if (existsSync(join(target, "package.json"))) continue;
    const from = locate(name, source);
    if (from === undefined) throw new Error(`${name} (dependency of ${manifest.name}) is not installed`);
    copyPackage(from, target);
    if (!seen.has(name)) {
      seen.add(name);
      vendorDependencies(target, from, seen);
    }
  }
}

const providerSource = locate(PROVIDER, root);
if (providerSource === undefined) throw new Error(`${PROVIDER} is not installed in this checkout — run pnpm install first`);
const providerManifest = JSON.parse(readFileSync(join(providerSource, "package.json"), "utf8"));
const core = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const range = core.devDependencies?.[PROVIDER] ?? core.dependencies?.[PROVIDER];
if (range === undefined) throw new Error(`${PROVIDER} must stay a development dependency of this checkout`);
const wanted = range.replace(/^[\^~]/, "");
if (!providerManifest.version.startsWith(wanted)) throw new Error(`${PROVIDER}: manifest asks for ${wanted}, installed ${providerManifest.version}`);
if (!implementation.version.startsWith(wanted)) throw new Error(`vendor/implementation.json targets ${implementation.version}, manifest asks for ${wanted}`);

const providerRoot = join(root, "vendor", PROVIDER);
copyPackage(providerSource, providerRoot);
vendorDependencies(providerRoot, providerSource);

for (const [name, version] of Object.entries(RUNTIME)) {
  const source = locate(name, root);
  if (source === undefined) throw new Error(`${name} is not installed in this checkout — run pnpm install first`);
  const installed = JSON.parse(readFileSync(join(source, "package.json"), "utf8")).version;
  if (installed !== version) throw new Error(`${name}: expected ${version}, installed ${installed}`);
  const target = join(root, "vendor", name);
  copyPackage(source, target);
  vendorDependencies(target, source);
}

// The provider's host imports are peers. Node resolves a package's own imports
// before anything in an ancestor directory, so the pinned host packages go into
// the provider's node_modules; the provider's regular dependencies above stay
// as they are, since peers never share a name with them.
const providerModules = join(providerRoot, "node_modules");
for (const name of Object.keys(RUNTIME)) {
  cpSync(join(root, "vendor", name), join(providerModules, name), { recursive: true, dereference: true });
}

stamp(rawLoader(implementation));
console.log(`bundled ${PROVIDER} and ${Object.keys(RUNTIME).length} host packages into vendor/`);

/** Write the two small files the manifest imports point at (see the `imports` map). */
function rawLoader(spec) {
  return [
    "// Loader of the vendored DSH host copy of " + spec.package + ".",
    "//",
    "// The manifest maps this file to the import specifier \"#dsh-mcp-client\" and",
    "// lib imports that specifier instead of the bare package name, so the plugin",
    "// works in a profile that keeps the official autoInstallPeers: false: the",
    "// provider and every host package it needs resolve from vendor/ (see",
    "// scripts/bundle-deps.mjs), independently of what the profile has installed.",
    'export * from "./' + spec.package + "/" + spec.entry + '";',
    "",
  ].join("\n");
}

function stamp(loader) {
  writeFileSync(join(root, "vendor/loader.mjs"), loader);
  writeFileSync(join(root, "vendor/loader.d.mts"), 'export * from "./' + implementation.package + "/" + implementation.entry + '";\n');
}
