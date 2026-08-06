#!/usr/bin/env node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const root = resolve(new URL("..", import.meta.url).pathname);
const temporaryRoot = await mkdtemp(resolve(tmpdir(), "ai-os-dr-"));
const sourceHome = resolve(temporaryRoot, "source-home");
const restoredHome = resolve(temporaryRoot, "restored-home");
const backupRoot = resolve(temporaryRoot, "backups");

function run(script, args, env) {
  const result = spawnSync(process.execPath, [resolve(root, script), ...args], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`${script} failed:\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

try {
  run("scripts/bootstrap.mjs", [], { AI_OS_HOME: sourceHome });
  const backupOutput = JSON.parse(run("scripts/backup.mjs", [backupRoot], { AI_OS_HOME: sourceHome }));
  run("scripts/restore.mjs", [backupOutput.backupDir], { AI_OS_HOME: restoredHome });

  const sourceDb = new DatabaseSync(resolve(sourceHome, "data/ai-os.sqlite"), { readOnly: true });
  const restoredDb = new DatabaseSync(resolve(restoredHome, "data/ai-os.sqlite"), { readOnly: true });
  try {
    const sourceCount = Number(sourceDb.prepare("SELECT COUNT(*) AS count FROM projects").get().count);
    const restoredCount = Number(restoredDb.prepare("SELECT COUNT(*) AS count FROM projects").get().count);
    const integrity = Object.values(restoredDb.prepare("PRAGMA integrity_check").get())[0];
    if (sourceCount !== restoredCount || integrity !== "ok") throw new Error("Backup/restore round trip validation failed");
    const manifest = JSON.parse(await readFile(resolve(backupOutput.backupDir, "manifest.json"), "utf8"));
    console.log(JSON.stringify({ smoke: "backup-restore", ok: true, projects: restoredCount, files: manifest.files.length }, null, 2));
  } finally {
    sourceDb.close();
    restoredDb.close();
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
