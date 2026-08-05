#!/usr/bin/env node
import { access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "@ai-os/config";
import { openDatabase, runMigrations } from "@ai-os/database";
import { loadProjectRegistry } from "@ai-os/project-registry";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function doctor(): Promise<void> {
  const config = loadConfig();
  await mkdir(config.dataDir, { recursive: true });
  console.log(JSON.stringify({
    node: process.version,
    platform: process.platform,
    home: config.home,
    dataDir: config.dataDir,
    databasePath: config.databasePath,
    databaseExists: await exists(config.databasePath),
  }, null, 2));
}

async function migrate(migrationsArgument?: string): Promise<void> {
  const config = loadConfig();
  const migrationsDir = resolve(
    migrationsArgument ?? "packages/database/migrations",
  );
  const database = openDatabase(config.databasePath);
  try {
    const result = await runMigrations(database, migrationsDir);
    console.log(JSON.stringify({ databasePath: config.databasePath, migrationsDir, ...result }, null, 2));
  } finally {
    database.close();
  }
}

async function validateRegistry(registryArgument?: string): Promise<void> {
  const path = resolve(registryArgument ?? "projects/registry.yaml");
  const registry = await loadProjectRegistry(path);
  console.log(JSON.stringify({ path, valid: true, projects: registry.projects.length }, null, 2));
}

const [command, argument] = process.argv.slice(2);

try {
  switch (command) {
    case "doctor":
      await doctor();
      break;
    case "db:migrate":
      await migrate(argument);
      break;
    case "registry:validate":
      await validateRegistry(argument);
      break;
    default:
      console.error("Usage: ai-os <doctor|db:migrate|registry:validate> [path]");
      process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
