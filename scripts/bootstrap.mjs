#!/usr/bin/env node
import { copyFile, mkdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const home = resolve(process.env.AI_OS_HOME ?? resolve(homedir(), ".ai-os"));
const configDir = resolve(root, "config");
const localRegistry = resolve(configDir, "import-sources.yaml");
const exampleRegistry = resolve(configDir, "import-sources.example.yaml");

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

function run(args) {
  const result = spawnSync("pnpm", ["--filter", "@ai-os/cli", "exec", "node", "dist/index.js", ...args], {
    cwd: root,
    env: { ...process.env, AI_OS_HOME: home },
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

await mkdir(resolve(home, "data"), { recursive: true });
await mkdir(resolve(home, "reports"), { recursive: true });
await mkdir(resolve(home, "backups"), { recursive: true });

let createdRegistry = false;
if (!(await exists(localRegistry)) && await exists(exampleRegistry)) {
  await copyFile(exampleRegistry, localRegistry);
  createdRegistry = true;
}

run(["db:migrate"]);
run(["registry:sync", "projects/registry.yaml"]);
run(["doctor"]);

console.log(JSON.stringify({
  bootstrapped: true,
  home,
  createdRegistry,
  next: [
    "Review config/import-sources.yaml and replace example paths.",
    "Run: pnpm provider:sources:status",
    "Run: pnpm dev:api",
  ],
}, null, 2));
