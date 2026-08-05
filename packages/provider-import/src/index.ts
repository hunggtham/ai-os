import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { DatabaseSync } from "node:sqlite";
import { upsertSession } from "@ai-os/database";
import {
  assertImportableArchives,
  createDefaultAdapterRegistry,
  inspectNormalizedArchives,
} from "@ai-os/provider-adapters";
import { replaceSessionMessages } from "@ai-os/session-store";

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

type RawImportRunRow = ImportRunRow & {
  errorMessage: string | null;
  finishedAt: string | null;
};

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
      replaceSessionMessages(database, archive);
    }

    const finishedAt = new Date().toISOString();
    database.prepare(`
      UPDATE import_runs
      SET status = 'succeeded', sessions_count = ?, messages_count = ?, finished_at = ?
      WHERE id = ?
    `).run(inspection.sessions, inspection.messages, finishedAt, runId);
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

export function listImportRuns(database: DatabaseSync, limit = 50): ImportRunRow[] {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 500);
  const rows = database.prepare(`
    SELECT id, source_path AS sourcePath, project_id AS projectId, provider,
           content_hash AS contentHash, status, sessions_count AS sessionsCount,
           messages_count AS messagesCount, error_message AS errorMessage,
           started_at AS startedAt, finished_at AS finishedAt
    FROM import_runs ORDER BY started_at DESC LIMIT ?
  `).all(safeLimit) as unknown as RawImportRunRow[];
  return rows.map((row) => ({
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
  }));
}
