import type { DatabaseSync } from "node:sqlite";
import type { NormalizedSessionArchive } from "@ai-os/provider-adapters";

export interface SessionMessageRow {
  id: string;
  sessionId: string;
  ordinal: number;
  role: string;
  content: string;
  createdAt?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface SessionSearchResult {
  messageId: string;
  sessionId: string;
  role: string;
  content: string;
  rank: number;
}

export function replaceSessionMessages(
  database: DatabaseSync,
  archive: NormalizedSessionArchive,
): number {
  const deleteFts = database.prepare("DELETE FROM session_messages_fts WHERE session_id = ?");
  const deleteMessages = database.prepare("DELETE FROM session_messages WHERE session_id = ?");
  const insertMessage = database.prepare(`
    INSERT INTO session_messages(id, session_id, ordinal, role, content, created_at, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertFts = database.prepare(`
    INSERT INTO session_messages_fts(message_id, session_id, role, content)
    VALUES (?, ?, ?, ?)
  `);

  database.exec("BEGIN IMMEDIATE;");
  try {
    deleteFts.run(archive.id);
    deleteMessages.run(archive.id);
    archive.messages.forEach((message, ordinal) => {
      const id = `${archive.id}:${ordinal}`;
      insertMessage.run(
        id,
        archive.id,
        ordinal,
        message.role,
        message.content,
        message.createdAt ?? null,
        message.metadata ? JSON.stringify(message.metadata) : null,
      );
      insertFts.run(id, archive.id, message.role, message.content);
    });
    database.exec("COMMIT;");
    return archive.messages.length;
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }
}

export function listSessionMessages(
  database: DatabaseSync,
  sessionId: string,
): SessionMessageRow[] {
  const rows = database.prepare(`
    SELECT id, session_id AS sessionId, ordinal, role, content,
           created_at AS createdAt, metadata_json AS metadataJson
    FROM session_messages
    WHERE session_id = ?
    ORDER BY ordinal
  `).all(sessionId) as Array<{
    id: string;
    sessionId: string;
    ordinal: number;
    role: string;
    content: string;
    createdAt: string | null;
    metadataJson: string | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    sessionId: row.sessionId,
    ordinal: row.ordinal,
    role: row.role,
    content: row.content,
    ...(row.createdAt ? { createdAt: row.createdAt } : {}),
    ...(row.metadataJson
      ? { metadata: JSON.parse(row.metadataJson) as Record<string, unknown> }
      : {}),
  }));
}

export function searchSessionMessages(
  database: DatabaseSync,
  query: string,
  projectId?: string,
  limit = 50,
): SessionSearchResult[] {
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const sql = projectId
    ? `
      SELECT f.message_id AS messageId, f.session_id AS sessionId, f.role,
             f.content, bm25(session_messages_fts) AS rank
      FROM session_messages_fts f
      JOIN sessions s ON s.id = f.session_id
      WHERE session_messages_fts MATCH ? AND s.project_id = ?
      ORDER BY rank
      LIMIT ?
    `
    : `
      SELECT message_id AS messageId, session_id AS sessionId, role,
             content, bm25(session_messages_fts) AS rank
      FROM session_messages_fts
      WHERE session_messages_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `;
  const statement = database.prepare(sql);
  return (projectId
    ? statement.all(query, projectId, safeLimit)
    : statement.all(query, safeLimit)) as unknown as SessionSearchResult[];
}
