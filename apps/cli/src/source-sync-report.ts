#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadConfig } from "@ai-os/config";
import { openDatabase, runMigrations } from "@ai-os/database";
import { loadImportSourceRegistry, syncActionableImportSources } from "@ai-os/import-sources";

interface SyncReportSummary {
  total: number;
  succeeded: number;
  skipped: number;
  unchanged: number;
  disabled: number;
  blocked: number;
  failed: number;
  ok: boolean;
}

function readOption(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.slice(2).find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function summarize(results: Awaited<ReturnType<typeof syncActionableImportSources>>): SyncReportSummary {
  const summary: SyncReportSummary = {
    total: results.length,
    succeeded: 0,
    skipped: 0,
    unchanged: 0,
    disabled: 0,
    blocked: 0,
    failed: 0,
    ok: true,
  };
  for (const result of results) summary[result.status] += 1;
  summary.ok = summary.blocked === 0 && summary.failed === 0;
  return summary;
}

const startedAt = new Date();
const registryPath = resolve(readOption("registry") ?? "config/import-sources.yaml");
const sourceId = readOption("source");
const outputPath = readOption("output");
const config = loadConfig();
const database = openDatabase(config.databasePath);

try {
  await runMigrations(database, resolve("packages/database/migrations"));
  const registry = await loadImportSourceRegistry(registryPath);
  const results = await syncActionableImportSources(database, registry, sourceId);
  const finishedAt = new Date();
  const report = {
    version: 1,
    command: "provider:sources:sync-actionable",
    registryPath,
    ...(sourceId ? { sourceId } : {}),
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    summary: summarize(results),
    results,
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (outputPath) {
    const resolvedOutput = resolve(outputPath);
    await mkdir(dirname(resolvedOutput), { recursive: true });
    await writeFile(resolvedOutput, serialized, "utf8");
  }
  process.stdout.write(serialized);
  if (!report.summary.ok) process.exitCode = 1;
} catch (error) {
  const finishedAt = new Date();
  const report = {
    version: 1,
    command: "provider:sources:sync-actionable",
    registryPath,
    ...(sourceId ? { sourceId } : {}),
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    summary: { total: 0, succeeded: 0, skipped: 0, unchanged: 0, disabled: 0, blocked: 0, failed: 1, ok: false },
    error: error instanceof Error ? error.message : String(error),
    results: [],
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (outputPath) {
    const resolvedOutput = resolve(outputPath);
    await mkdir(dirname(resolvedOutput), { recursive: true });
    await writeFile(resolvedOutput, serialized, "utf8");
  }
  process.stderr.write(serialized);
  process.exitCode = 1;
} finally {
  database.close();
}
