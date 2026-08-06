import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase, runMigrations, upsertProjects, upsertSession } from "@ai-os/database";
import { createReadLayer } from "./read-layer.js";

const migrations = fileURLToPath(new URL("../../../packages/database/migrations", import.meta.url));

test("read layer paginates real SQLite data and redacts local paths", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ai-os-mcp-"));
  const databasePath = join(directory, "data", "ai-os.sqlite");
  const database = openDatabase(databasePath);
  try {
    await runMigrations(database, migrations);
    upsertProjects(database, [{ id: "ai-os", name: "AI OS", status: "active", localPath: join(directory, "repo") }]);
    upsertSession(database, {
      id: "session-1",
      projectId: "ai-os",
      provider: "codex",
      startedAt: "2026-08-06T00:00:00.000Z",
      archivePath: join(directory, "sessions", "session-1.md"),
      contentHash: "hash-1",
    });
    database.prepare(`
      INSERT INTO import_runs(id,source_path,project_id,provider,content_hash,status,error_message,started_at,finished_at)
      VALUES (?,?,?,?,?,'failed',?,?,?)
    `).run(
      "import-1",
      join(directory, "private", "export.jsonl"),
      "ai-os",
      "codex",
      "hash-import",
      `ENOENT opening ${join(directory, "private", "export.jsonl")}`,
      "2026-08-06T00:00:00.000Z",
      "2026-08-06T00:00:01.000Z",
    );

    const read = createReadLayer(database, { home: directory, repositoryRoot: join(directory, "repo") });
    const projects = read.listProjects();
    const sessions = read.listSessions({ projectId: "ai-os", limit: 1, offset: 0 });
    const detail = read.getSession("session-1");
    const imports = read.importHealth({ limit: 10 });

    assert.equal(projects.projects.length, 1);
    assert.equal(projects.projects[0]?.localPath, "<repo>");
    assert.equal(sessions.sessions.length, 1);
    assert.equal(sessions.limit, 1);
    assert.equal(detail.session?.archivePath, "~/sessions/session-1.md");
    assert.equal(imports.imports[0]?.sourcePath, "~/private/export.jsonl");
    assert.equal(imports.imports[0]?.errorMessage, "ENOENT opening ~/private/export.jsonl");
    assert.equal(read.systemStatus().rawPathsExposed, false);
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("session pagination continues beyond the legacy 500-row cap", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ai-os-mcp-pagination-"));
  const database = openDatabase(join(directory, "ai-os.sqlite"));
  try {
    await runMigrations(database, migrations);
    upsertProjects(database, [{ id: "ai-os", name: "AI OS", status: "active" }]);
    const base = Date.parse("2026-08-06T00:00:00.000Z");
    for (let index = 0; index < 530; index += 1) {
      upsertSession(database, {
        id: `session-${String(index).padStart(3, "0")}`,
        projectId: "ai-os",
        provider: "codex",
        startedAt: new Date(base + index * 1000).toISOString(),
        archivePath: join(directory, "sessions", `${index}.jsonl`),
        contentHash: `hash-${index}`,
      });
    }

    const page = createReadLayer(database, { home: directory }).listSessions({ projectId: "ai-os", limit: 10, offset: 510 });
    assert.equal(page.sessions.length, 10);
    assert.equal(page.offset, 510);
    assert.equal(page.limit, 10);
    assert.equal(page.hasMore, true);
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});
