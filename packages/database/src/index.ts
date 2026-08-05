import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

export interface ProjectRow {
  id: string;
  name: string;
  repository?: string | undefined;
  localPath?: string | undefined;
  status: string;
}

export interface SessionRow {
  id: string;
  projectId: string;
  provider: string;
  model?: string | undefined;
  startedAt: string;
  endedAt?: string | undefined;
  archivePath: string;
  contentHash: string;
}

export function openDatabase(databasePath: string): DatabaseSync {
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec("PRAGMA journal_mode = WAL;");
  return database;
}

export async function runMigrations(
  database: DatabaseSync,
  migrationsDir: string,
): Promise<MigrationResult> {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const files = (await readdir(migrationsDir))
    .filter((file) => /^\d+.*\.sql$/.test(file))
    .sort((left, right) => left.localeCompare(right));

  const hasMigration = database.prepare(
    "SELECT 1 FROM schema_migrations WHERE version = ?",
  );
  const recordMigration = database.prepare(
    "INSERT INTO schema_migrations(version) VALUES (?)",
  );

  const result: MigrationResult = { applied: [], skipped: [] };

  for (const file of files) {
    if (hasMigration.get(file)) {
      result.skipped.push(file);
      continue;
    }

    const sql = await readFile(join(migrationsDir, file), "utf8");
    database.exec("BEGIN IMMEDIATE;");
    try {
      database.exec(sql);
      recordMigration.run(file);
      database.exec("COMMIT;");
      result.applied.push(file);
    } catch (error) {
      database.exec("ROLLBACK;");
      throw new Error(`Failed to apply migration ${file}`, { cause: error });
    }
  }

  return result;
}

export function upsertProjects(database: DatabaseSync, projects: ProjectRow[]): number {
  const statement = database.prepare(`
    INSERT INTO projects(id, name, repository, local_path, status)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      repository = excluded.repository,
      local_path = excluded.local_path,
      status = excluded.status,
      updated_at = CURRENT_TIMESTAMP
  `);

  database.exec("BEGIN IMMEDIATE;");
  try {
    for (const project of projects) {
      statement.run(
        project.id,
        project.name,
        project.repository ?? null,
        project.localPath ?? null,
        project.status,
      );
    }
    database.exec("COMMIT;");
    return projects.length;
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }
}

export function upsertSession(database: DatabaseSync, session: SessionRow): void {
  database.prepare(`
    INSERT INTO sessions(
      id, project_id, provider, model, started_at, ended_at, archive_path, content_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      project_id = excluded.project_id,
      provider = excluded.provider,
      model = excluded.model,
      started_at = excluded.started_at,
      ended_at = excluded.ended_at,
      archive_path = excluded.archive_path,
      content_hash = excluded.content_hash
  `).run(
    session.id,
    session.projectId,
    session.provider,
    session.model ?? null,
    session.startedAt,
    session.endedAt ?? null,
    session.archivePath,
    session.contentHash,
  );
}
