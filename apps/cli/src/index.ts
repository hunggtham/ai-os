#!/usr/bin/env node
import { access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "@ai-os/config";
import {
  openDatabase,
  runMigrations,
  upsertProjects,
  upsertSession,
} from "@ai-os/database";
import { loadProjectRegistry } from "@ai-os/project-registry";
import { loadAndValidateSession } from "@ai-os/session-core";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function migrationsPath(): string {
  return resolve("packages/database/migrations");
}

async function withMigratedDatabase<T>(work: (database: ReturnType<typeof openDatabase>) => Promise<T> | T): Promise<T> {
  const config = loadConfig();
  const database = openDatabase(config.databasePath);
  try {
    await runMigrations(database, migrationsPath());
    return await work(database);
  } finally {
    database.close();
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
  const migrationsDir = resolve(migrationsArgument ?? migrationsPath());
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

async function syncRegistry(registryArgument?: string): Promise<void> {
  const path = resolve(registryArgument ?? "projects/registry.yaml");
  const registry = await loadProjectRegistry(path);
  const count = await withMigratedDatabase((database) => upsertProjects(
    database,
    registry.projects.map((project) => ({
      id: project.id,
      name: project.name,
      repository: project.repository,
      localPath: project.local_path,
      status: project.status,
    })),
  ));
  console.log(JSON.stringify({ path, synced: count }, null, 2));
}

async function validateSession(manifestArgument?: string): Promise<void> {
  if (!manifestArgument) throw new Error("session:validate requires a manifest JSON path");
  const manifestPath = resolve(manifestArgument);
  const result = await loadAndValidateSession(manifestPath, resolve("schemas/session.schema.json"));
  if (!result.valid || !result.value) {
    console.error(JSON.stringify({ valid: false, errors: result.errors }, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify({
    valid: true,
    id: result.value.manifest.id,
    contentHash: result.value.contentHash,
  }, null, 2));
}

async function importSession(manifestArgument?: string): Promise<void> {
  if (!manifestArgument) throw new Error("session:import requires a manifest JSON path");
  const manifestPath = resolve(manifestArgument);
  const result = await loadAndValidateSession(manifestPath, resolve("schemas/session.schema.json"));
  if (!result.valid || !result.value) {
    console.error(JSON.stringify({ imported: false, errors: result.errors }, null, 2));
    process.exitCode = 1;
    return;
  }

  const { manifest, contentHash } = result.value;
  await withMigratedDatabase((database) => upsertSession(database, {
    id: manifest.id,
    projectId: manifest.project_id,
    provider: manifest.provider,
    model: manifest.model,
    startedAt: manifest.started_at,
    endedAt: manifest.ended_at,
    archivePath: manifest.archive_path,
    contentHash,
  }));

  console.log(JSON.stringify({ imported: true, id: manifest.id, contentHash }, null, 2));
}

const [command, argument] = process.argv.slice(2);

try {
  switch (command) {
    case "doctor": await doctor(); break;
    case "db:migrate": await migrate(argument); break;
    case "registry:validate": await validateRegistry(argument); break;
    case "registry:sync": await syncRegistry(argument); break;
    case "session:validate": await validateSession(argument); break;
    case "session:import": await importSession(argument); break;
    default:
      console.error("Usage: ai-os <doctor|db:migrate|registry:validate|registry:sync|session:validate|session:import> [path]");
      process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
