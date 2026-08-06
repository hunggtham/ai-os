import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { openDatabase, runMigrations, upsertProjects } from "@ai-os/database";
import { importProviderExport } from "@ai-os/provider-import";
import { inspectImportSources, loadImportSourceRegistry, summarizeImportSourceStatuses, syncActionableImportSources } from "./index.js";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = resolve(packageDirectory, "../database/migrations");

test("loads import sources, resolves relative paths and honors disabled entries", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ai-os-import-sources-"));
  const path = join(directory, "sources.yaml");
  try {
    await writeFile(path, `version: 1
sources:
  - id: codex-main
    path: ./exports/codex.jsonl
    projectId: ai-os
    provider: codex
  - id: chatgpt-archive
    path: \${AI_OS_EXPORT_ROOT}/conversations.json
    projectId: ai-os
    enabled: false
`);
    process.env.AI_OS_EXPORT_ROOT = join(directory, "external");
    const registry = await loadImportSourceRegistry(path);
    assert.equal(registry.sources.length, 2);
    assert.equal(registry.sources[0]?.enabled, true);
    assert.equal(registry.sources[0]?.path, join(directory, "exports/codex.jsonl"));
    assert.equal(registry.sources[1]?.enabled, false);
    assert.equal(registry.sources[1]?.path, join(directory, "external/conversations.json"));
  } finally {
    delete process.env.AI_OS_EXPORT_ROOT;
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects duplicate source IDs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ai-os-import-sources-"));
  const path = join(directory, "sources.yaml");
  try {
    await writeFile(path, `version: 1
sources:
  - id: duplicate
    path: one.jsonl
    projectId: ai-os
  - id: duplicate
    path: two.jsonl
    projectId: ai-os
`);
    await assert.rejects(() => loadImportSourceRegistry(path), /Duplicate import source id/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("reports and summarizes provider source freshness", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ai-os-import-source-status-"));
  const database = openDatabase(join(directory, "ai-os.db"));
  const sourcePath = join(directory, "codex.jsonl");
  try {
    await runMigrations(database, migrationsDirectory);
    upsertProjects(database, [{ id: "ai-os", name: "AI OS", status: "active" }]);
    await writeFile(sourcePath, JSON.stringify({ role: "user", content: "hello", timestamp: "2026-08-06T00:00:00Z" }));
    const registry = { version: 1 as const, sources: [
      { id: "codex", path: sourcePath, projectId: "ai-os", provider: "codex", enabled: true },
      { id: "missing", path: join(directory, "missing.jsonl"), projectId: "ai-os", provider: "codex", enabled: true },
      { id: "disabled", path: join(directory, "disabled.jsonl"), projectId: "ai-os", enabled: false },
    ] };

    const initial = await inspectImportSources(database, registry);
    assert.deepEqual(initial.map((source) => source.state), ["new", "missing", "disabled"]);
    assert.deepEqual(summarizeImportSourceStatuses(initial), {
      total: 3,
      actionable: 1,
      healthy: false,
      disabled: 1,
      missing: 1,
      new: 1,
      changed: 0,
      synced: 0,
      error: 0,
    });

    await importProviderExport(database, { path: sourcePath, projectId: "ai-os", providerHint: "codex" });
    const synced = await inspectImportSources(database, registry, "codex");
    assert.equal(synced[0]?.state, "synced");
    assert.equal(summarizeImportSourceStatuses(synced).healthy, true);

    await writeFile(sourcePath, JSON.stringify({ role: "user", content: "changed", timestamp: "2026-08-06T00:00:00Z" }));
    const changed = await inspectImportSources(database, registry, "codex");
    assert.equal(changed[0]?.state, "changed");
    assert.equal(summarizeImportSourceStatuses(changed).actionable, 1);
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("synchronizes only new or changed sources and blocks unhealthy inputs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ai-os-actionable-sync-"));
  const database = openDatabase(join(directory, "ai-os.db"));
  const sourcePath = join(directory, "codex.jsonl");
  try {
    await runMigrations(database, migrationsDirectory);
    upsertProjects(database, [{ id: "ai-os", name: "AI OS", status: "active" }]);
    await writeFile(sourcePath, JSON.stringify({ role: "user", content: "hello", timestamp: "2026-08-06T00:00:00Z" }));
    const registry = { version: 1 as const, sources: [
      { id: "codex", path: sourcePath, projectId: "ai-os", provider: "codex", enabled: true },
      { id: "missing", path: join(directory, "missing.jsonl"), projectId: "ai-os", provider: "codex", enabled: true },
      { id: "disabled", path: join(directory, "disabled.jsonl"), projectId: "ai-os", enabled: false },
    ] };

    const first = await syncActionableImportSources(database, registry);
    assert.deepEqual(first.map((result) => result.status), ["succeeded", "blocked", "disabled"]);
    assert.deepEqual(first.map((result) => result.sourceState), ["new", "missing", "disabled"]);

    const second = await syncActionableImportSources(database, registry);
    assert.deepEqual(second.map((result) => result.status), ["unchanged", "blocked", "disabled"]);

    await writeFile(sourcePath, JSON.stringify({ role: "user", content: "changed", timestamp: "2026-08-06T00:00:00Z" }));
    const third = await syncActionableImportSources(database, registry, "codex");
    assert.equal(third[0]?.sourceState, "changed");
    assert.equal(third[0]?.status, "succeeded");
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});
