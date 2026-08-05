import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { upsertProjects, upsertSession } from "./index.js";

function createDatabase(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      repository TEXT,
      local_path TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      archive_path TEXT NOT NULL UNIQUE,
      content_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );
  `);
  return database;
}

test("project synchronization and session import are idempotent", () => {
  const database = createDatabase();
  try {
    const project = { id: "ai-os", name: "AI OS", status: "active" };
    assert.equal(upsertProjects(database, [project]), 1);
    assert.equal(upsertProjects(database, [{ ...project, name: "AI OS Platform" }]), 1);

    upsertSession(database, {
      id: "session-1",
      projectId: "ai-os",
      provider: "codex",
      startedAt: "2026-08-05T00:00:00Z",
      archivePath: "sessions/session-1.md",
      contentHash: "hash-1",
    });
    upsertSession(database, {
      id: "session-1",
      projectId: "ai-os",
      provider: "codex",
      model: "gpt",
      startedAt: "2026-08-05T00:00:00Z",
      archivePath: "sessions/session-1.md",
      contentHash: "hash-2",
    });

    const projectRow = database.prepare("SELECT name FROM projects WHERE id = ?").get("ai-os") as { name: string };
    const sessionRow = database.prepare("SELECT model, content_hash FROM sessions WHERE id = ?").get("session-1") as { model: string; content_hash: string };
    assert.equal(projectRow.name, "AI OS Platform");
    assert.deepEqual(sessionRow, { model: "gpt", content_hash: "hash-2" });
  } finally {
    database.close();
  }
});
