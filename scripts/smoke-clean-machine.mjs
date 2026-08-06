#!/usr/bin/env node
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const home = await mkdtemp(join(tmpdir(), "ai-os-smoke-"));

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, AI_OS_HOME: home },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error(`${command} ${args.join(" ")} failed with ${result.status}`);
  }
  return result.stdout;
}

try {
  run("node", ["scripts/bootstrap.mjs"]);
  const databasePath = resolve(home, "data", "ai-os.sqlite");
  const metadata = await stat(databasePath);
  if (!metadata.isFile() || metadata.size === 0) throw new Error("Bootstrap did not create a usable database");

  const doctor = run("pnpm", ["--filter", "@ai-os/cli", "exec", "node", "dist/index.js", "doctor"]);
  const parsed = JSON.parse(doctor);
  if (parsed.databaseExists !== true) throw new Error("Doctor did not detect the bootstrapped database");

  console.log(JSON.stringify({ smoke: "passed", home, databasePath }, null, 2));
} finally {
  await rm(home, { recursive: true, force: true });
}
