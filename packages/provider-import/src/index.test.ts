import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { openDatabase, runMigrations, upsertProjects } from "@ai-os/database";
import { getImportRun, getImportRunSummary, importProviderExport, listImportRuns, queryImportRuns } from "./index.js";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = resolve(packageDirectory, "../database/migrations");

test("skips an unchanged successful provider export and queries audit history", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ai-os-provider-import-"));
  const database = openDatabase(join(directory, "ai-os.db"));
  const sourcePath = join(directory, "codex.jsonl");
  try {
    await runMigrations(database, migrationsDirectory);
    upsertProjects(database, [{ id: "ai-os", name: "AI OS", status: "active" }]);
    await writeFile(sourcePath, [
      JSON.stringify({ role: "user", content: "hello", timestamp: "2026-08-05T00:00:00Z" }),
      JSON.stringify({ role: "assistant", content: "world", timestamp: "2026-08-05T00:00:01Z" }),
    ].join("\n"));

    const first = await importProviderExport(database, {
      path: sourcePath,
      projectId: "ai-os",
      providerHint: "codex",
    });
    const second = await importProviderExport(database, {
      path: sourcePath,
      projectId: "ai-os",
      providerHint: "codex",
    });

    assert.equal(first.status, "succeeded");
    assert.equal(first.sessions, 1);
    assert.equal(second.status, "skipped");
    assert.deepEqual(listImportRuns(database, 10).map((run) => run.status), ["skipped", "succeeded"]);
    assert.deepEqual(queryImportRuns(database, { status: "succeeded" }).map((run) => run.id), [first.runId]);
    assert.deepEqual(queryImportRuns(database, { provider: "codex", projectId: "ai-os", offset: 1, limit: 1 }).map((run) => run.id), [first.runId]);
    assert.equal(getImportRun(database, second.runId)?.status, "skipped");
    assert.equal(getImportRun(database, "missing"), null);

    const summary = getImportRunSummary(database);
    assert.equal(summary.total, 2);
    assert.equal(summary.succeeded, 1);
    assert.equal(summary.skipped, 1);
    assert.equal(summary.failed, 0);
    assert.equal(summary.running, 0);
    assert.ok(summary.latestSucceededAt);
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});
