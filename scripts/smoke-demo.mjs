#!/usr/bin/env node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const runtime = await mkdtemp(join(tmpdir(), "ai-os-demo-smoke-"));
const env = { ...process.env, AI_OS_HOME: runtime };
const cli = ["apps/cli/dist/index.js"];
const registry = "demo/import-sources.yaml";

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, env, encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error(`${command} ${args.join(" ")} failed with ${result.status}`);
  }
  return result.stdout.trim();
}

try {
  run("node", ["scripts/bootstrap.mjs"]);

  const before = JSON.parse(run("node", [...cli, "provider:sources:status", registry]));
  if (before.summary.new !== 1) {
    throw new Error(`Expected demo source to be new, received ${JSON.stringify(before.summary)}`);
  }

  const sync = JSON.parse(run("node", [...cli, "provider:sources:sync", registry]));
  if (sync.summary.succeeded !== 1) {
    throw new Error(`Expected one successful demo import, received ${JSON.stringify(sync.summary)}`);
  }

  const search = JSON.parse(run("node", [...cli, "archive:search", "DEMO_RELEASE_WORKFLOW", "ai-os"]));
  if (search.count < 1) throw new Error("Synthetic demo marker was not searchable");

  const after = JSON.parse(run("node", [...cli, "provider:sources:status", registry]));
  if (after.summary.synced !== 1) {
    throw new Error(`Expected demo source to be synced, received ${JSON.stringify(after.summary)}`);
  }

  console.log(JSON.stringify({ smoke: "demo", ok: true, imported: true, searchable: true, synced: true }, null, 2));
} finally {
  await rm(runtime, { recursive: true, force: true });
}
