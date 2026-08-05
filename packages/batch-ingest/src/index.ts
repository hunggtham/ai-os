import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { parseArchive } from "@ai-os/archive-ingest";
import { upsertSession } from "@ai-os/database";
import { replaceSessionMessages } from "@ai-os/session-store";

export interface BatchImportOptions {
  directory: string;
  projectId: string;
  provider: string;
}

export interface BatchImportItem {
  path: string;
  sessionId: string;
  messages: number;
}

export interface BatchImportResult {
  discovered: number;
  imported: BatchImportItem[];
  failed: Array<{ path: string; error: string }>;
}

const supportedExtensions = new Set([".md", ".markdown", ".jsonl"]);

export function deterministicSessionId(
  projectId: string,
  provider: string,
  relativePath: string,
): string {
  const digest = createHash("sha256")
    .update(`${projectId}\n${provider}\n${relativePath.replaceAll("\\", "/")}`)
    .digest("hex")
    .slice(0, 24);
  return `session-${digest}`;
}

export async function discoverArchives(directory: string): Promise<string[]> {
  const root = resolve(directory);
  const discovered: string[] = [];

  async function walk(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile() && supportedExtensions.has(extname(entry.name).toLowerCase())) {
        discovered.push(path);
      }
    }
  }

  await walk(root);
  return discovered;
}

export async function importArchiveDirectory(
  database: DatabaseSync,
  options: BatchImportOptions,
): Promise<BatchImportResult> {
  const directory = resolve(options.directory);
  const paths = await discoverArchives(directory);
  const result: BatchImportResult = { discovered: paths.length, imported: [], failed: [] };

  for (const path of paths) {
    const relativePath = relative(directory, path).replaceAll("\\", "/");
    const sessionId = deterministicSessionId(options.projectId, options.provider, relativePath);
    try {
      const [file, fileStat] = await Promise.all([readFile(path), stat(path)]);
      const contentHash = createHash("sha256").update(file).digest("hex");
      const startedAt = fileStat.birthtimeMs > 0
        ? fileStat.birthtime.toISOString()
        : fileStat.mtime.toISOString();
      const archive = await parseArchive(
        {
          path,
          projectId: options.projectId,
          providerHint: options.provider,
        },
        sessionId,
        startedAt,
      );

      upsertSession(database, {
        id: archive.id,
        projectId: archive.projectId,
        provider: archive.provider,
        startedAt: archive.startedAt,
        archivePath: path,
        contentHash,
      });
      const messages = replaceSessionMessages(database, archive);
      result.imported.push({ path, sessionId, messages });
    } catch (error) {
      result.failed.push({
        path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}
