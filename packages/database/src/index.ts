import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

export interface MigrationResult { applied: string[]; skipped: string[]; }
export interface ProjectRow { id: string; name: string; repository?: string | undefined; localPath?: string | undefined; status: string; }
export interface SessionRow { id: string; projectId: string; provider: string; model?: string | undefined; startedAt: string; endedAt?: string | undefined; archivePath: string; contentHash: string; }
export interface MemoryRow {
  id: string;
  scope: string;
  subjectId: string;
  kind: string;
  content: string;
  confidence?: number | undefined;
  sourceSessionId?: string | undefined;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export function openDatabase(databasePath: string): DatabaseSync {
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec("PRAGMA journal_mode = WAL;");
  return database;
}

export async function runMigrations(database: DatabaseSync, migrationsDir: string): Promise<MigrationResult> {
  database.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);");
  const files = (await readdir(migrationsDir)).filter((file) => /^\d+.*\.sql$/.test(file)).sort();
  const hasMigration = database.prepare("SELECT 1 FROM schema_migrations WHERE version = ?");
  const recordMigration = database.prepare("INSERT INTO schema_migrations(version) VALUES (?)");
  const result: MigrationResult = { applied: [], skipped: [] };
  for (const file of files) {
    if (hasMigration.get(file)) { result.skipped.push(file); continue; }
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
  const statement = database.prepare(`INSERT INTO projects(id,name,repository,local_path,status) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,repository=excluded.repository,local_path=excluded.local_path,status=excluded.status,updated_at=CURRENT_TIMESTAMP`);
  database.exec("BEGIN IMMEDIATE;");
  try {
    for (const project of projects) statement.run(project.id, project.name, project.repository ?? null, project.localPath ?? null, project.status);
    database.exec("COMMIT;");
    return projects.length;
  } catch (error) { database.exec("ROLLBACK;"); throw error; }
}

export function listProjects(database: DatabaseSync): ProjectRow[] {
  return database.prepare(`SELECT id,name,repository,local_path AS localPath,status FROM projects ORDER BY name`).all() as unknown as ProjectRow[];
}

export function upsertSession(database: DatabaseSync, session: SessionRow): void {
  database.prepare(`INSERT INTO sessions(id,project_id,provider,model,started_at,ended_at,archive_path,content_hash) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,provider=excluded.provider,model=excluded.model,started_at=excluded.started_at,ended_at=excluded.ended_at,archive_path=excluded.archive_path,content_hash=excluded.content_hash`).run(session.id, session.projectId, session.provider, session.model ?? null, session.startedAt, session.endedAt ?? null, session.archivePath, session.contentHash);
}

export function listSessions(database: DatabaseSync, projectId?: string, limit = 50): SessionRow[] {
  const safeLimit = Math.min(Math.max(limit, 1), 500);
  const statement = projectId
    ? database.prepare(`SELECT id,project_id AS projectId,provider,model,started_at AS startedAt,ended_at AS endedAt,archive_path AS archivePath,content_hash AS contentHash FROM sessions WHERE project_id = ? ORDER BY started_at DESC LIMIT ?`)
    : database.prepare(`SELECT id,project_id AS projectId,provider,model,started_at AS startedAt,ended_at AS endedAt,archive_path AS archivePath,content_hash AS contentHash FROM sessions ORDER BY started_at DESC LIMIT ?`);
  return (projectId ? statement.all(projectId, safeLimit) : statement.all(safeLimit)) as unknown as SessionRow[];
}

export function getSession(database: DatabaseSync, id: string): SessionRow | null {
  return (database.prepare(`SELECT id,project_id AS projectId,provider,model,started_at AS startedAt,ended_at AS endedAt,archive_path AS archivePath,content_hash AS contentHash FROM sessions WHERE id = ?`).get(id) as unknown as SessionRow | undefined) ?? null;
}

export function upsertMemory(database: DatabaseSync, memory: MemoryRow): void {
  database.prepare(`INSERT INTO memories(id,scope,subject_id,kind,content,confidence,source_session_id,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET scope=excluded.scope,subject_id=excluded.subject_id,kind=excluded.kind,content=excluded.content,confidence=excluded.confidence,source_session_id=excluded.source_session_id,status=excluded.status,updated_at=excluded.updated_at`).run(memory.id, memory.scope, memory.subjectId, memory.kind, memory.content, memory.confidence ?? null, memory.sourceSessionId ?? null, memory.status, memory.createdAt, memory.updatedAt);
}

export function listMemories(database: DatabaseSync, scope?: string, subjectId?: string, text?: string, limit = 100): MemoryRow[] {
  const conditions: string[] = [];
  const values: Array<string | number> = [];
  if (scope) { conditions.push("scope = ?"); values.push(scope); }
  if (subjectId) { conditions.push("subject_id = ?"); values.push(subjectId); }
  if (text) { conditions.push("content LIKE ?"); values.push(`%${text}%`); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  values.push(Math.min(Math.max(limit, 1), 500));
  return database.prepare(`SELECT id,scope,subject_id AS subjectId,kind,content,confidence,source_session_id AS sourceSessionId,status,created_at AS createdAt,updated_at AS updatedAt FROM memories ${where} ORDER BY updated_at DESC LIMIT ?`).all(...values) as unknown as MemoryRow[];
}

export function invalidateMemory(database: DatabaseSync, id: string, updatedAt: string): boolean {
  const result = database.prepare("UPDATE memories SET status = 'invalid', updated_at = ? WHERE id = ?").run(updatedAt, id);
  return Number(result.changes) > 0;
}

export function supersedeMemory(database: DatabaseSync, id: string, replacementId: string, updatedAt: string): boolean {
  const replacement = database.prepare("SELECT 1 FROM memories WHERE id = ?").get(replacementId);
  if (!replacement) throw new Error(`Replacement memory not found: ${replacementId}`);
  const result = database.prepare("UPDATE memories SET status = 'superseded', updated_at = ? WHERE id = ? AND id <> ?").run(updatedAt, id, replacementId);
  return Number(result.changes) > 0;
}

export function expireMemories(database: DatabaseSync, now: string): number {
  const result = database.prepare("UPDATE memories SET status = 'invalid', updated_at = ? WHERE status IN ('candidate','active') AND updated_at < ?").run(now, now);
  return Number(result.changes);
}

export function getSystemCounts(database: DatabaseSync): { projects: number; sessions: number; memories: number } {
  const count = (table: string): number => Number((database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count);
  return { projects: count("projects"), sessions: count("sessions"), memories: count("memories") };
}
