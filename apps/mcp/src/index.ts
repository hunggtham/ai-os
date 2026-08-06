#!/usr/bin/env node
import { resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { loadConfig } from "@ai-os/config";
import { openDatabase, runMigrations } from "@ai-os/database";
import { createReadLayer } from "./read-layer.js";

const config = loadConfig();
const database = openDatabase(config.databasePath);
await runMigrations(database, resolve("packages/database/migrations"));

const read = createReadLayer(database, {
  repositoryRoot: process.cwd(),
  home: process.env.HOME,
  exposeRawPaths: process.env.AI_OS_EXPOSE_RAW_PATHS === "1",
  importSourcesPath: process.env.AI_OS_IMPORT_SOURCES_PATH,
});

const server = new McpServer(
  { name: "ai-os", version: "0.4.0" },
  { instructions: "Privacy-safe, read-only access to local AI OS projects, sessions, messages, memories, import health, and configured source freshness." },
);

function text(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

const pageSchema = {
  limit: z.number().int().min(1).max(500).default(50),
  offset: z.number().int().min(0).default(0),
};

server.registerTool("list_projects", {
  description: "List projects synchronized into the local AI OS database.",
  inputSchema: z.object({}),
}, async () => text(read.listProjects()));

server.registerTool("list_sessions", {
  description: "List sessions with stable pagination and optional project filtering.",
  inputSchema: z.object({ projectId: z.string().min(1).optional(), ...pageSchema }),
}, async (input) => text(read.listSessions(input)));

server.registerTool("get_session", {
  description: "Get one session metadata record by ID. Local archive paths are redacted by default.",
  inputSchema: z.object({ id: z.string().min(1) }),
}, async ({ id }) => text(read.getSession(id)));

server.registerTool("list_session_messages", {
  description: "List messages for one session with pagination.",
  inputSchema: z.object({ sessionId: z.string().min(1), ...pageSchema }),
}, async (input) => text(read.listMessages(input)));

server.registerTool("search_session_messages", {
  description: "Full-text search imported session messages with optional project filtering and pagination.",
  inputSchema: z.object({
    query: z.string().min(1),
    projectId: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(200).default(50),
    offset: z.number().int().min(0).default(0),
  }),
}, async (input) => text(read.searchMessages(input)));

server.registerTool("list_memories", {
  description: "List durable memories by scope, subject, and text with pagination.",
  inputSchema: z.object({
    scope: z.string().min(1).optional(),
    subjectId: z.string().min(1).optional(),
    text: z.string().min(1).optional(),
    ...pageSchema,
  }),
}, async (input) => text(read.listMemories(input)));

server.registerTool("get_import_health", {
  description: "Return provider-import summary and paginated audit history.",
  inputSchema: z.object({
    projectId: z.string().min(1).optional(),
    provider: z.string().min(1).optional(),
    status: z.enum(["running", "succeeded", "failed", "skipped"]).optional(),
    limit: z.number().int().min(1).max(100).default(50),
    offset: z.number().int().min(0).default(0),
  }),
}, async (input) => text(read.importHealth(input)));

server.registerTool("inspect_source_freshness", {
  description: "Inspect configured provider export sources and report new, changed, synced, missing, disabled, or error states.",
  inputSchema: z.object({ sourceId: z.string().min(1).optional() }),
}, async ({ sourceId }) => text(await read.sourceFreshness(sourceId)));

server.registerTool("get_system_status", {
  description: "Return indexed record counts and privacy mode without exposing runtime paths.",
  inputSchema: z.object({}),
}, async () => text(read.systemStatus()));

const close = (): void => {
  try { database.close(); } catch { /* already closed */ }
};
process.on("exit", close);
process.on("SIGINT", () => { close(); process.exit(0); });
process.on("SIGTERM", () => { close(); process.exit(0); });

const transport = new StdioServerTransport();
await server.connect(transport);
