import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { openDatabase, runMigrations, upsertProjects } from "@ai-os/database";
import { importProviderExport, listImportRuns } from "./index.js";

test("skips an unchanged successful provider export", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ai-os-provider-import-"));
  const database = openDatabase(join(directory, "ai-os.db"));
  const sourcePath = join(directory, "codex.jsonl");
  try {
    await runMigrations(database, resolve("packages/database/migrations"));
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
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});
