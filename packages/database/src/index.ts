import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

export interface MigrationResult {
  applied: string[];
  skipped: string[];
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
