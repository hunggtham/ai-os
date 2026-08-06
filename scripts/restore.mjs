#!/usr/bin/env node
import { copyFile, mkdir, readFile, rename, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const backupDirArg = process.argv[2];
if (!backupDirArg) throw new Error("Usage: node scripts/restore.mjs <backup-directory> [--force]");
const force = process.argv.includes("--force");
const backupDir = resolve(backupDirArg);
const manifestPath = resolve(backupDir, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.contractVersion !== 1 || !Array.isArray(manifest.files)) throw new Error("Unsupported or invalid backup manifest");

function entryPath(entry) {
  if (!entry || typeof entry !== "object") throw new Error("Backup manifest contains an invalid file entry");
  if (typeof entry.name !== "string" || !entry.name || basename(entry.name) !== entry.name) {
    throw new Error(`Unsafe backup manifest filename: ${String(entry.name)}`);
  }
  if (typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(entry.sha256)) {
    throw new Error(`Invalid checksum metadata for backup file: ${entry.name}`);
  }
  if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0) {
    throw new Error(`Invalid size metadata for backup file: ${entry.name}`);
  }
  return resolve(backupDir, entry.name);
}

async function validateEntry(entry) {
  const path = entryPath(entry);
  const content = await readFile(path);
  const hash = createHash("sha256").update(content).digest("hex");
  const bytes = (await stat(path)).size;
  if (hash !== entry.sha256 || bytes !== entry.bytes) {
    throw new Error(`Backup file checksum or size does not match manifest: ${entry.name}`);
  }
  return path;
}

const validatedPaths = new Map();
for (const entry of manifest.files) validatedPaths.set(entry, await validateEntry(entry));

const databaseEntry = manifest.files.find((file) => file.role === "database");
if (!databaseEntry) throw new Error("Backup manifest does not contain a database file");
const backupDatabasePath = validatedPaths.get(databaseEntry);
if (!backupDatabasePath) throw new Error("Backup database was not validated");

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
  const configSource = validatedPaths.get(configEntry);
  if (!configSource) throw new Error("Backup local config was not validated");
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
