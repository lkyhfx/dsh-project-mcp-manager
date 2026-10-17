/**
 * 项目 watcher 只打开项目根、`.dsh` 和三个配置文件。
 * depth 2 会让 chokidar 对工作区两层内的每个目录和文件调用 fs.watch，
 * Windows 上这些句柄把目录留在 delete-pending。
 */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { watch } from "chokidar";
import { projectConfigWatchKeys, projectDshJsonFile, projectMcpFile, projectMcpJsonFile } from "../lib/registry.js";

let passed = 0;
function pass(name) {
  passed += 1;
  console.log("PASS  " + name);
}

function watchOptions(roots) {
  const allow = projectConfigWatchKeys(roots);
  return {
    ignoreInitial: true,
    depth: 1,
    ignored: (candidate) => !allow.has(normalizeForAllow(candidate))
  };
}

function normalizeForAllow(candidate) {
  const resolved = resolve(candidate);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function relativesUnder(root, watched) {
  const rootResolved = resolve(root);
  const found = [];
  for (const [dir, children] of Object.entries(watched)) {
    const dirAbs = resolve(dir);
    if (!isInside(rootResolved, dirAbs)) continue;
    const dirRel = relative(rootResolved, dirAbs);
    if (dirRel !== "") found.push(dirRel);
    for (const child of children) {
      const childAbs = resolve(dirAbs, child);
      if (!isInside(rootResolved, childAbs)) continue;
      const childRel = relative(rootResolved, childAbs);
      if (childRel !== "") found.push(childRel);
    }
  }
  return found;
}

function isInside(root, abs) {
  const rel = relative(root, abs);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function hits(relatives, names) {
  return relatives.filter((rel) => names.some((name) => rel === name || rel.startsWith(name + sep)));
}

async function waitFor(predicate, timeoutMs, label) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return true;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 40));
  }
  assert.fail(label);
}

function ready(watcher) {
  return new Promise((resolveReady, rejectReady) => {
    const timer = setTimeout(() => rejectReady(new Error("watcher ready timeout")), 4000);
    watcher.on("ready", () => {
      clearTimeout(timer);
      resolveReady();
    });
    watcher.on("error", rejectReady);
  });
}

const outside = ["lib", "src", "build", ".preview", "node_modules", ".git", "stray", "package.json"];

const dir = await mkdtemp(join(tmpdir(), "dsh-project-watch-"));
try {
  const root = join(dir, "proj");
  await mkdir(join(root, "src", "ssh"), { recursive: true });
  await mkdir(join(root, "lib", "types"), { recursive: true });
  await mkdir(join(root, ".preview"), { recursive: true });
  await mkdir(join(root, "node_modules", "pkg"), { recursive: true });
  await mkdir(join(root, ".git", "objects"), { recursive: true });
  await mkdir(join(root, "stray", ".dsh"), { recursive: true });
  await mkdir(join(root, ".dsh"), { recursive: true });
  await writeFile(join(root, "package.json"), "{}\n");
  await writeFile(join(root, "src", "index.ts"), "export {}\n");
  await writeFile(join(root, "src", "ssh", "client.ts"), "export {}\n");
  await writeFile(join(root, "lib", "index.js"), "x\n");
  await writeFile(join(root, "lib", "types", "index.d.ts"), "x\n");
  await writeFile(join(root, ".preview", "a.txt"), "x\n");
  await writeFile(join(root, "node_modules", "pkg", "index.js"), "x\n");
  await writeFile(join(root, "stray", ".dsh", "mcp.yml"), "- insert:\n");
  await writeFile(projectMcpFile(root), "old\n");
  await writeFile(projectMcpJsonFile(root), "{}\n");

  const keys = projectConfigWatchKeys([root]);
  assert.equal(keys.has(normalizeForAllow(root)), true);
  assert.equal(keys.has(normalizeForAllow(join(root, ".dsh"))), true);
  assert.equal(keys.has(normalizeForAllow(projectMcpFile(root))), true);
  assert.equal(keys.has(normalizeForAllow(projectDshJsonFile(root))), true);
  assert.equal(keys.has(normalizeForAllow(projectMcpJsonFile(root))), true);
  assert.equal(keys.has(normalizeForAllow(join(root, "lib"))), false);
  pass("projectConfigWatchKeys lists the root, .dsh, and the three config files");

  const events = [];
  const watcher = watch(root, watchOptions([root]));
  watcher.on("all", (event, path) => events.push(`${event} ${path}`));
  try {
    await ready(watcher);
    const initial = relativesUnder(root, watcher.getWatched());
    assert.deepEqual(hits(initial, outside), [], `initial watch must stay on config paths, saw ${initial.join(", ")}`);
    pass("project watcher does not open lib, src, dot dirs, or VCS directories");

    await mkdir(join(root, "build", "sub"), { recursive: true });
    await writeFile(join(root, "build", "sub", "out.js"), "x\n");
    await writeFile(join(root, "stray", ".dsh", "mcp.yml"), "later\n");
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 400));
    const afterMkdir = relativesUnder(root, watcher.getWatched());
    assert.deepEqual(hits(afterMkdir, outside), [], `a new build directory must stay unwatched, saw ${afterMkdir.join(", ")}`);
    pass("directories created after the watcher is ready stay unwatched");

    await writeFile(projectMcpFile(root), "new\n");
    await writeFile(projectMcpJsonFile(root), "{\"a\":1}\n");
    await waitFor(
      () => events.some((item) => item.startsWith("change ") && item.endsWith(projectMcpFile(root)))
        && events.some((item) => item.startsWith("change ") && item.endsWith(projectMcpJsonFile(root))),
      2500,
      `expected change events for mcp.yml and .mcp.json, saw ${events.join(" | ")}`
    );
    pass("edits to .dsh/mcp.yml and .mcp.json are delivered");
  } finally {
    await watcher.close();
  }

  const lateRoot = join(dir, "late");
  await mkdir(lateRoot, { recursive: true });
  await writeFile(join(lateRoot, "package.json"), "{}\n");
  const lateEvents = [];
  const lateWatcher = watch(lateRoot, watchOptions([lateRoot]));
  lateWatcher.on("all", (event, path) => lateEvents.push(`${event} ${path}`));
  try {
    await ready(lateWatcher);
    await mkdir(join(lateRoot, ".dsh"), { recursive: true });
    await writeFile(projectMcpFile(lateRoot), "created\n");
    await writeFile(projectDshJsonFile(lateRoot), "{}\n");
    await writeFile(projectMcpJsonFile(lateRoot), "{}\n");
    const has = (kind, path) => lateEvents.some((item) => item.startsWith(`${kind} `) && item.endsWith(path));
    await waitFor(
      () => has("add", projectMcpFile(lateRoot)) && has("add", projectDshJsonFile(lateRoot)) && has("add", projectMcpJsonFile(lateRoot)),
      3000,
      `expected add events for config files created with .dsh, saw ${lateEvents.join(" | ")}`
    );
    await writeFile(projectMcpFile(lateRoot), "edited\n");
    await waitFor(
      () => has("change", projectMcpFile(lateRoot)),
      2500,
      `expected a change event after .dsh was created later, saw ${lateEvents.join(" | ")}`
    );
    await rm(projectMcpJsonFile(lateRoot));
    await waitFor(
      () => has("unlink", projectMcpJsonFile(lateRoot)),
      2500,
      `expected an unlink event for .mcp.json, saw ${lateEvents.join(" | ")}`
    );
    const lateWatched = relativesUnder(lateRoot, lateWatcher.getWatched());
    assert.deepEqual(hits(lateWatched, ["lib", "src", "package.json"]), [], `late watch leaked ${lateWatched.join(", ")}`);
    pass("config files created after .dsh still emit add, change, and unlink");
  } finally {
    await lateWatcher.close();
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log("\n" + passed + " passed, 0 failed");
console.log("ALL PROJECT WATCH TESTS PASSED");
