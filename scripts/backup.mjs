#!/usr/bin/env node
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const home = resolve(process.env.AI_OS_HOME ?? resolve(homedir(), ".ai-os"));
const databasePath = resolve(process.env.AI_OS_DATABASE_PATH ?? resolve(home, "data/ai-os.sqlite"));
const backupRoot = resolve(process.argv[2] ?? resolve(home, "backups"));
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = resolve(backupRoot, timestamp);
const backupDatabasePath = resolve(backupDir, "ai-os.sqlite");
const manifestPath = resolve(backupDir, "manifest.json");
const configPath = resolve(process.env.AI_OS_IMPORT_SOURCES_PATH ?? "config/import-sources.yaml");

function sqlString(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

await mkdir(backupDir, { recursive: true });
const database = new DatabaseSync(databasePath);
try {
  database.exec("PRAGMA wal_checkpoint(FULL);");
  database.exec(`VACUUM INTO ${sqlString(backupDatabasePath)};`);
} finally {
  database.close();
}

const databaseStat = await stat(backupDatabasePath);
const files = [{
  role: "database",
  name: basename(backupDatabasePath),
  bytes: databaseStat.size,
  sha256: await sha256(backupDatabasePath),
}];

try {
  const configTarget = resolve(backupDir, "import-sources.yaml");
  await copyFile(configPath, configTarget);
  const configStat = await stat(configTarget);
  files.push({ role: "local-config", name: basename(configTarget), bytes: configStat.size, sha256: await sha256(configTarget) });
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const manifest = {
  contractVersion: 1,
  createdAt: new Date().toISOString(),
  source: { home, databasePath },
  backupDirectory: backupDir,
  files,
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ backedUp: true, backupDir, manifestPath, files }, null, 2));
