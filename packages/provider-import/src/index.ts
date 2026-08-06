import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { DatabaseSync } from "node:sqlite";
import { upsertSession } from "@ai-os/database";
import {
  assertImportableArchives,
  createDefaultAdapterRegistry,
  inspectNormalizedArchives,
} from "@ai-os/provider-adapters";
import { replaceSessionMessagesInTransaction } from "@ai-os/session-store";

export interface ProviderImportOptions {
  path: string;
  projectId: string;
  providerHint?: string | undefined;
  force?: boolean | undefined;
}

export interface ProviderImportResult {
  runId: string;
  status: "succeeded" | "skipped";
  adapter: string;
  contentHash: string;
  sessions: number;
  messages: number;
}

export interface ImportRunRow {
  id: string;
  sourcePath: string;
  projectId: string;
  provider: string;
  contentHash: string;
  status: string;
  sessionsCount: number;
  messagesCount: number;
  errorMessage?: string | undefined;
  startedAt: string;
  finishedAt?: string | undefined;
}

export interface ImportRunQuery {
  status?: string | undefined;
  provider?: string | undefined;
  projectId?: string | undefined;
  offset?: number | undefined;
  limit?: number | undefined;
}

export interface ImportRunSummary {
  total: number;
  running: number;
  succeeded: number;
  failed: number;
  skipped: number;
  latestSucceededAt?: string | undefined;
  latestFailedAt?: string | undefined;
}

type RawImportRunRow = ImportRunRow & {
  errorMessage: string | null;
  finishedAt: string | null;
};

const normalizeImportRun = (row: RawImportRunRow): ImportRunRow => ({
  id: row.id,
  sourcePath: row.sourcePath,
  projectId: row.projectId,
  provider: row.provider,
  contentHash: row.contentHash,
  status: row.status,
  sessionsCount: row.sessionsCount,
  messagesCount: row.messagesCount,
  startedAt: row.startedAt,
  ...(row.errorMessage !== null ? { errorMessage: row.errorMessage } : {}),
  ...(row.finishedAt !== null ? { finishedAt: row.finishedAt } : {}),
});

export function recoverStaleImportRuns(database: DatabaseSync, olderThan: string, recoveredAt = new Date().toISOString()): number {
  const result = database.prepare(`
    UPDATE import_runs
    SET status = 'failed',
        error_message = COALESCE(error_message, 'Recovered stale running import'),
        finished_at = ?
    WHERE status = 'running' AND started_at < ?
  `).run(recoveredAt, olderThan);
  return Number(result.changes);
}

export async function importProviderExport(
  database: DatabaseSync,
  options: ProviderImportOptions,
): Promise<ProviderImportResult> {
  const bytes = await readFile(options.path);
  const contentHash = createHash("sha256").update(bytes).digest("hex");
  const registry = await createDefaultAdapterRegistry();
  const source = options.providerHint
    ? { path: options.path, projectId: options.projectId, providerHint: options.providerHint }
    : { path: options.path, projectId: options.projectId };
  const adapter = await registry.resolve(source);

  if (!options.force) {
    const previous = database.prepare(`
      SELECT id FROM import_runs
      WHERE source_path = ? AND project_id = ? AND provider = ?
        AND content_hash = ? AND status = 'succeeded'
      ORDER BY started_at DESC LIMIT 1
    `).get(options.path, options.projectId, adapter.id, contentHash);
    if (previous) {
      const runId = randomUUID();
      const now = new Date().toISOString();
      database.prepare(`
        INSERT INTO import_runs(
          id, source_path, project_id, provider, content_hash, status,
          sessions_count, messages_count, started_at, finished_at
        ) VALUES (?, ?, ?, ?, ?, 'skipped', 0, 0, ?, ?)
      `).run(runId, options.path, options.projectId, adapter.id, contentHash, now, now);
      return { runId, status: "skipped", adapter: adapter.id, contentHash, sessions: 0, messages: 0 };
    }
  }

  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  database.prepare(`
    INSERT INTO import_runs(id, source_path, project_id, provider, content_hash, status, started_at)
    VALUES (?, ?, ?, ?, ?, 'running', ?)
  `).run(runId, options.path, options.projectId, adapter.id, contentHash, startedAt);

  try {
    const archives = await adapter.parse(source);
    assertImportableArchives(archives);
    const inspection = inspectNormalizedArchives(archives);
    const finishedAt = new Date().toISOString();

    database.exec("BEGIN IMMEDIATE;");
    try {
      for (const archive of archives) {
        upsertSession(database, {
          id: archive.id,
          projectId: archive.projectId,
          provider: archive.provider,
          ...(archive.model !== undefined ? { model: archive.model } : {}),
          startedAt: archive.startedAt,
          ...(archive.endedAt !== undefined ? { endedAt: archive.endedAt } : {}),
          archivePath: `${options.path}#${archive.id}`,
          contentHash,
        });
        replaceSessionMessagesInTransaction(database, archive);
      }

      database.prepare(`
        UPDATE import_runs
        SET status = 'succeeded', sessions_count = ?, messages_count = ?, finished_at = ?
        WHERE id = ?
      `).run(inspection.sessions, inspection.messages, finishedAt, runId);
      database.exec("COMMIT;");
    } catch (error) {
      database.exec("ROLLBACK;");
      throw error;
    }

    return {
      runId,
      status: "succeeded",
      adapter: adapter.id,
      contentHash,
      sessions: inspection.sessions,
      messages: inspection.messages,
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : String(error);
    database.prepare(`
      UPDATE import_runs SET status = 'failed', error_message = ?, finished_at = ? WHERE id = ?
    `).run(message, finishedAt, runId);
    throw error;
  }
}

export function queryImportRuns(database: DatabaseSync, query: ImportRunQuery = {}): ImportRunRow[] {
  const conditions: string[] = [];
  const values: Array<string | number> = [];
  if (query.status) { conditions.push("status = ?"); values.push(query.status); }
  if (query.provider) { conditions.push("provider = ?"); values.push(query.provider); }
  if (query.projectId) { conditions.push("project_id = ?"); values.push(query.projectId); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const offset = Math.min(Math.max(Math.trunc(query.offset ?? 0), 0), 100000);
  const limit = Math.min(Math.max(Math.trunc(query.limit ?? 50), 1), 500);
  values.push(limit, offset);
  const rows = database.prepare(`
    SELECT id, source_path AS sourcePath, project_id AS projectId, provider,
           content_hash AS contentHash, status, sessions_count AS sessionsCount,
           messages_count AS messagesCount, error_message AS errorMessage,
           started_at AS startedAt, finished_at AS finishedAt
    FROM import_runs ${where} ORDER BY started_at DESC LIMIT ? OFFSET ?
  `).all(...values) as unknown as RawImportRunRow[];
  return rows.map(normalizeImportRun);
}

export function getImportRun(database: DatabaseSync, id: string): ImportRunRow | null {
  const row = database.prepare(`
    SELECT id, source_path AS sourcePath, project_id AS projectId, provider,
           content_hash AS contentHash, status, sessions_count AS sessionsCount,
           messages_count AS messagesCount, error_message AS errorMessage,
           started_at AS startedAt, finished_at AS finishedAt
    FROM import_runs WHERE id = ?
  `).get(id) as unknown as RawImportRunRow | undefined;
  return row ? normalizeImportRun(row) : null;
}

export function getImportRunSummary(database: DatabaseSync): ImportRunSummary {
  const row = database.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running,
      SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END) AS succeeded,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped,
      MAX(CASE WHEN status = 'succeeded' THEN finished_at END) AS latestSucceededAt,
      MAX(CASE WHEN status = 'failed' THEN finished_at END) AS latestFailedAt
    FROM import_runs
  `).get() as unknown as {
    total: number;
    running: number | null;
    succeeded: number | null;
    failed: number | null;
    skipped: number | null;
    latestSucceededAt: string | null;
    latestFailedAt: string | null;
  };
  return {
    total: Number(row.total),
    running: Number(row.running ?? 0),
    succeeded: Number(row.succeeded ?? 0),
    failed: Number(row.failed ?? 0),
    skipped: Number(row.skipped ?? 0),
    ...(row.latestSucceededAt !== null ? { latestSucceededAt: row.latestSucceededAt } : {}),
    ...(row.latestFailedAt !== null ? { latestFailedAt: row.latestFailedAt } : {}),
  };
}

export function listImportRuns(database: DatabaseSync, limit = 50): ImportRunRow[] {
  return queryImportRuns(database, { limit });
}
