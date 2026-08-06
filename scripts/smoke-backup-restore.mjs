#!/usr/bin/env node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const root = resolve(new URL("..", import.meta.url).pathname);
const temporaryRoot = await mkdtemp(resolve(tmpdir(), "ai-os-dr-"));
const sourceHome = resolve(temporaryRoot, "source-home");
const restoredHome = resolve(temporaryRoot, "restored-home");
const backupRoot = resolve(temporaryRoot, "backups");

function execute(script, args, env) {
  return spawnSync(process.execPath, [resolve(root, script), ...args], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

function run(script, args, env) {
  const result = execute(script, args, env);
  if (result.status !== 0) throw new Error(`${script} failed:\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

function expectFailure(script, args, env, pattern) {
  const result = execute(script, args, env);
  if (result.status === 0) throw new Error(`${script} unexpectedly succeeded`);
  const output = `${result.stdout}\n${result.stderr}`;
  if (!pattern.test(output)) throw new Error(`${script} failed for an unexpected reason:\n${output}`);
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

    const manifestPath = resolve(backupOutput.backupDir, "manifest.json");
    const manifestText = await readFile(manifestPath, "utf8");
    const manifest = JSON.parse(manifestText);
    const configEntry = manifest.files.find((file) => file.role === "local-config");
    if (configEntry) {
      const configPath = resolve(backupOutput.backupDir, configEntry.name);
      const configText = await readFile(configPath, "utf8");
      await writeFile(configPath, `${configText}\n# tampered\n`, "utf8");
      expectFailure(
        "scripts/restore.mjs",
        [backupOutput.backupDir],
        { AI_OS_HOME: resolve(temporaryRoot, "tampered-home") },
        /checksum or size does not match manifest/,
      );
      await writeFile(configPath, configText, "utf8");
    }

    const unsafeManifest = JSON.parse(manifestText);
    const databaseEntry = unsafeManifest.files.find((file) => file.role === "database");
    databaseEntry.name = `../${databaseEntry.name}`;
    await writeFile(manifestPath, `${JSON.stringify(unsafeManifest, null, 2)}\n`, "utf8");
    expectFailure(
      "scripts/restore.mjs",
      [backupOutput.backupDir],
      { AI_OS_HOME: resolve(temporaryRoot, "unsafe-home") },
      /Unsafe backup manifest filename/,
    );
    await writeFile(manifestPath, manifestText, "utf8");

    console.log(JSON.stringify({ smoke: "backup-restore", ok: true, projects: restoredCount, files: manifest.files.length, tamperRejected: true, traversalRejected: true }, null, 2));
  } finally {
    sourceDb.close();
    restoredDb.close();
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
