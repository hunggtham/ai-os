import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadImportSourceRegistry } from "./index.js";

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
