import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { homedir } from "node:os";
import {
  getSession,
  getSystemCounts,
  listMemories,
  listProjects,
  listSessions,
  openDatabase,
} from "@ai-os/database";
import { inspectImportSources, loadImportSourceRegistry, summarizeImportSourceStatuses } from "@ai-os/import-sources";
import { getImportRunSummary, queryImportRuns } from "@ai-os/provider-import";
import { listSessionMessages, searchSessionMessages } from "@ai-os/session-store";

type Database = ReturnType<typeof openDatabase>;

export interface PageInput {
  limit?: number;
  offset?: number;
}

export interface ReadLayerOptions {
  repositoryRoot?: string;
  home?: string;
  exposeRawPaths?: boolean;
  importSourcesPath?: string;
}

function page(input: PageInput, max = 200): { limit: number; offset: number } {
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 50), 1), max);
  const offset = Math.max(Math.trunc(input.offset ?? 0), 0);
  return { limit, offset };
}

function aliasPath(value: string, options: ReadLayerOptions): string {
  if (options.exposeRawPaths || !isAbsolute(value)) return value;
  for (const [root, prefix] of [[options.repositoryRoot, "<repo>"], [options.home ?? homedir(), "~"]] as const) {
    if (!root) continue;
    const candidate = relative(root, value);
    if (candidate === "") return prefix;
    if (candidate !== ".." && !candidate.startsWith(`..${sep}`) && !isAbsolute(candidate)) {
      return `${prefix}/${candidate.split(sep).join("/")}`;
    }
  }
  return `<local>/${basename(value)}`;
}

function redact<T>(value: T, options: ReadLayerOptions): T {
  if (Array.isArray(value)) return value.map((item) => redact(item, options)) as T;
  if (!value || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.replace(/[_-]/g, "").toLowerCase();
    output[key] = typeof item === "string" && (normalized.endsWith("path") || normalized.endsWith("root") || normalized.endsWith("directory"))
      ? aliasPath(item, options)
      : redact(item, options);
  }
  return output as T;
}

export function createReadLayer(database: Database, options: ReadLayerOptions = {}) {
  const safe = <T>(value: T): T => redact(value, options);

  return {
    listProjects: () => safe({ projects: listProjects(database) }),
    listSessions: (input: { projectId?: string } & PageInput = {}) => {
      const { limit, offset } = page(input, 500);
      const rows = listSessions(database, input.projectId, Math.min(offset + limit + 1, 1000));
      return safe({ sessions: rows.slice(offset, offset + limit), limit, offset, hasMore: rows.length > offset + limit });
    },
    getSession: (id: string) => safe({ session: getSession(database, id) }),
    listMessages: (input: { sessionId: string } & PageInput) => {
      const { limit, offset } = page(input, 500);
      const rows = listSessionMessages(database, input.sessionId);
      return { messages: rows.slice(offset, offset + limit), limit, offset, hasMore: rows.length > offset + limit };
    },
    searchMessages: (input: { query: string; projectId?: string } & PageInput) => {
      const { limit, offset } = page(input, 200);
      const rows = searchSessionMessages(database, input.query, input.projectId, Math.min(offset + limit + 1, 500));
      return { results: rows.slice(offset, offset + limit), limit, offset, hasMore: rows.length > offset + limit };
    },
    listMemories: (input: { scope?: string; subjectId?: string; text?: string } & PageInput = {}) => {
      const { limit, offset } = page(input, 500);
      const rows = listMemories(database, input.scope, input.subjectId, input.text, Math.min(offset + limit + 1, 1000));
      return { memories: rows.slice(offset, offset + limit), limit, offset, hasMore: rows.length > offset + limit };
    },
    importHealth: (input: { projectId?: string; provider?: string; status?: string } & PageInput = {}) => {
      const { limit, offset } = page(input, 100);
      const rows = queryImportRuns(database, {
        limit: limit + 1,
        offset,
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.provider ? { provider: input.provider } : {}),
        ...(input.status ? { status: input.status } : {}),
      });
      return safe({ summary: getImportRunSummary(database), imports: rows.slice(0, limit), limit, offset, hasMore: rows.length > limit });
    },
    sourceFreshness: async (sourceId?: string) => {
      const registryPath = resolve(options.importSourcesPath ?? "config/import-sources.yaml");
      try {
        const registry = await loadImportSourceRegistry(registryPath);
        const sources = await inspectImportSources(database, registry, sourceId);
        return safe({ configured: true, registryPath, summary: summarizeImportSourceStatuses(sources), sources });
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? String(error.code) : undefined;
        if (code === "ENOENT") return safe({ configured: false, registryPath, summary: summarizeImportSourceStatuses([]), sources: [] });
        throw error;
      }
    },
    systemStatus: () => safe({ counts: getSystemCounts(database), rawPathsExposed: options.exposeRawPaths === true }),
  };
}
