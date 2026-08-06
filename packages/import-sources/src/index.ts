import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { importProviderExport, type ProviderImportResult } from "@ai-os/provider-import";
import { parse } from "yaml";

export interface ImportSourceDefinition {
  id: string;
  path: string;
  projectId: string;
  provider?: string | undefined;
  enabled: boolean;
}

export interface ImportSourceRegistry {
  version: 1;
  sources: ImportSourceDefinition[];
}

export interface ImportSourceSyncResult {
  id: string;
  path: string;
  status: "succeeded" | "skipped" | "failed" | "disabled";
  result?: ProviderImportResult | undefined;
  error?: string | undefined;
}

export interface ImportSourceStatus {
  id: string;
  path: string;
  projectId: string;
  provider?: string | undefined;
  enabled: boolean;
  state: "disabled" | "missing" | "new" | "changed" | "synced" | "error";
  exists: boolean;
  sizeBytes?: number | undefined;
  modifiedAt?: string | undefined;
  contentHash?: string | undefined;
  lastImportStatus?: string | undefined;
  lastImportedAt?: string | undefined;
  error?: string | undefined;
}

interface RawImportAuditRow {
  status: string;
  contentHash: string;
  startedAt: string;
}

function expandEnvironment(value: string): string {
  return value.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/gi, (_match, name: string) => {
    const resolved = process.env[name];
    if (resolved === undefined) throw new Error(`Missing environment variable: ${name}`);
    return resolved;
  });
}

export function resolveImportSourcePath(value: string, registryPath: string): string {
  const expanded = expandEnvironment(value);
  const homeExpanded = expanded === "~" ? homedir() : expanded.startsWith("~/") ? resolve(homedir(), expanded.slice(2)) : expanded;
  return isAbsolute(homeExpanded) ? homeExpanded : resolve(dirname(registryPath), homeExpanded);
}

export async function loadImportSourceRegistry(path: string): Promise<ImportSourceRegistry> {
  const raw = parse(await readFile(path, "utf8")) as unknown;
  if (!raw || typeof raw !== "object") throw new Error("Import source registry must be a YAML object");
  const value = raw as Record<string, unknown>;
  if (value.version !== 1) throw new Error("Import source registry version must be 1");
  if (!Array.isArray(value.sources)) throw new Error("Import source registry requires a sources array");
  const ids = new Set<string>();
  const sources = value.sources.map((entry, index): ImportSourceDefinition => {
    if (!entry || typeof entry !== "object") throw new Error(`sources[${index}] must be an object`);
    const source = entry as Record<string, unknown>;
    const id = typeof source.id === "string" ? source.id.trim() : "";
    const sourcePath = typeof source.path === "string" ? source.path.trim() : "";
    const projectId = typeof source.projectId === "string" ? source.projectId.trim() : "";
    const provider = typeof source.provider === "string" ? source.provider.trim() : undefined;
    if (!id) throw new Error(`sources[${index}].id is required`);
    if (ids.has(id)) throw new Error(`Duplicate import source id: ${id}`);
    if (!sourcePath) throw new Error(`sources[${index}].path is required`);
    if (!projectId) throw new Error(`sources[${index}].projectId is required`);
    ids.add(id);
    return {
      id,
      path: resolveImportSourcePath(sourcePath, path),
      projectId,
      ...(provider ? { provider } : {}),
      enabled: source.enabled !== false,
    };
  });
  return { version: 1, sources };
}

function latestImport(database: DatabaseSync, source: ImportSourceDefinition): RawImportAuditRow | undefined {
  const conditions = ["source_path = ?", "project_id = ?"];
  const values: string[] = [source.path, source.projectId];
  if (source.provider) {
    conditions.push("provider = ?");
    values.push(source.provider);
  }
  return database.prepare(`
    SELECT status, content_hash AS contentHash, started_at AS startedAt
    FROM import_runs
    WHERE ${conditions.join(" AND ")}
    ORDER BY started_at DESC
    LIMIT 1
  `).get(...values) as unknown as RawImportAuditRow | undefined;
}

export async function inspectImportSources(
  database: DatabaseSync,
  registry: ImportSourceRegistry,
  sourceId?: string,
): Promise<ImportSourceStatus[]> {
  const selected = sourceId ? registry.sources.filter((source) => source.id === sourceId) : registry.sources;
  if (sourceId && selected.length === 0) throw new Error(`Import source not found: ${sourceId}`);
  const results: ImportSourceStatus[] = [];
  for (const source of selected) {
    if (!source.enabled) {
      results.push({ id: source.id, path: source.path, projectId: source.projectId, ...(source.provider ? { provider: source.provider } : {}), enabled: false, state: "disabled", exists: false });
      continue;
    }
    try {
      const metadata = await stat(source.path);
      if (!metadata.isFile()) {
        results.push({ id: source.id, path: source.path, projectId: source.projectId, ...(source.provider ? { provider: source.provider } : {}), enabled: true, state: "error", exists: true, error: "Source path is not a regular file" });
        continue;
      }
      const contentHash = createHash("sha256").update(await readFile(source.path)).digest("hex");
      const previous = latestImport(database, source);
      const state = previous === undefined ? "new" : previous.status === "succeeded" && previous.contentHash === contentHash ? "synced" : "changed";
      results.push({
        id: source.id,
        path: source.path,
        projectId: source.projectId,
        ...(source.provider ? { provider: source.provider } : {}),
        enabled: true,
        state,
        exists: true,
        sizeBytes: metadata.size,
        modifiedAt: metadata.mtime.toISOString(),
        contentHash,
        ...(previous ? { lastImportStatus: previous.status, lastImportedAt: previous.startedAt } : {}),
      });
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : undefined;
      results.push({
        id: source.id,
        path: source.path,
        projectId: source.projectId,
        ...(source.provider ? { provider: source.provider } : {}),
        enabled: true,
        state: code === "ENOENT" ? "missing" : "error",
        exists: false,
        ...(code === "ENOENT" ? {} : { error: error instanceof Error ? error.message : String(error) }),
      });
    }
  }
  return results;
}

export async function syncImportSources(
  database: DatabaseSync,
  registry: ImportSourceRegistry,
  options: { force?: boolean | undefined; sourceId?: string | undefined } = {},
): Promise<ImportSourceSyncResult[]> {
  const selected = options.sourceId ? registry.sources.filter((source) => source.id === options.sourceId) : registry.sources;
  if (options.sourceId && selected.length === 0) throw new Error(`Import source not found: ${options.sourceId}`);
  const results: ImportSourceSyncResult[] = [];
  for (const source of selected) {
    if (!source.enabled) {
      results.push({ id: source.id, path: source.path, status: "disabled" });
      continue;
    }
    try {
      const result = await importProviderExport(database, {
        path: source.path,
        projectId: source.projectId,
        ...(source.provider ? { providerHint: source.provider } : {}),
        ...(options.force ? { force: true } : {}),
      });
      results.push({ id: source.id, path: source.path, status: result.status, result });
    } catch (error) {
      results.push({
        id: source.id,
        path: source.path,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}
