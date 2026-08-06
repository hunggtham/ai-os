#!/usr/bin/env node
import { copyFile, mkdir, readFile, rename, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const backupDirArg = process.argv[2];
if (!backupDirArg) throw new Error("Usage: node scripts/restore.mjs <backup-directory> [--force]");
const force = process.argv.includes("--force");
const backupDir = resolve(backupDirArg);
const manifestPath = resolve(backupDir, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.contractVersion !== 1 || !Array.isArray(manifest.files)) throw new Error("Unsupported or invalid backup manifest");

const databaseEntry = manifest.files.find((file) => file.role === "database");
if (!databaseEntry) throw new Error("Backup manifest does not contain a database file");
const backupDatabasePath = resolve(backupDir, databaseEntry.name);
const hash = createHash("sha256").update(await readFile(backupDatabasePath)).digest("hex");
const bytes = (await stat(backupDatabasePath)).size;
if (hash !== databaseEntry.sha256 || bytes !== databaseEntry.bytes) throw new Error("Backup database checksum or size does not match manifest");

const home = resolve(process.env.AI_OS_HOME ?? resolve(homedir(), ".ai-os"));
const databasePath = resolve(process.env.AI_OS_DATABASE_PATH ?? resolve(home, "data/ai-os.sqlite"));
try {
  await stat(databasePath);
  if (!force) throw new Error(`Target database already exists: ${databasePath}. Re-run with --force to replace it.`);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

await mkdir(dirname(databasePath), { recursive: true });
const temporaryPath = `${databasePath}.restore-${process.pid}.tmp`;
await copyFile(backupDatabasePath, temporaryPath);
const validationDatabase = new DatabaseSync(temporaryPath, { readOnly: true });
try {
  const result = validationDatabase.prepare("PRAGMA integrity_check;").get();
  if (!result || Object.values(result)[0] !== "ok") throw new Error("Restored database failed SQLite integrity_check");
} finally {
  validationDatabase.close();
}
await rename(temporaryPath, databasePath);

const configEntry = manifest.files.find((file) => file.role === "local-config");
let restoredConfig = false;
if (configEntry) {
  const configSource = resolve(backupDir, configEntry.name);
  const configTarget = resolve(process.env.AI_OS_IMPORT_SOURCES_PATH ?? "config/import-sources.yaml");
  try {
    await stat(configTarget);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    await mkdir(dirname(configTarget), { recursive: true });
    await copyFile(configSource, configTarget);
    restoredConfig = true;
  }
}

console.log(JSON.stringify({ restored: true, backupDir, databasePath, restoredConfig }, null, 2));
