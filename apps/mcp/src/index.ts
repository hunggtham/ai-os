#!/usr/bin/env node
import { resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { loadConfig } from "@ai-os/config";
import {
  getSession,
  getSystemCounts,
  listMemories,
  listProjects,
  listSessions,
  openDatabase,
  runMigrations,
} from "@ai-os/database";
import { searchSessionMessages } from "@ai-os/session-store";

const config = loadConfig();
const database = openDatabase(config.databasePath);
await runMigrations(database, resolve("packages/database/migrations"));

const server = new McpServer(
  { name: "ai-os", version: "0.3.0" },
  { instructions: "Read-only access to local AI OS projects, sessions, messages, memories, and status." },
);

function text(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

server.registerTool("list_projects", {
  description: "List projects synchronized into the local AI OS database.",
  inputSchema: z.object({}),
}, async () => text(listProjects(database)));

server.registerTool("list_sessions", {
  description: "List recent AI sessions, optionally filtered by project.",
  inputSchema: z.object({
    projectId: z.string().optional(),
    limit: z.number().int().min(1).max(500).default(50),
  }),
}, async ({ projectId, limit }) => text(listSessions(database, projectId, limit)));

server.registerTool("get_session", {
  description: "Get one session metadata record by ID.",
  inputSchema: z.object({ id: z.string().min(1) }),
}, async ({ id }) => text(getSession(database, id)));

server.registerTool("search_sessions", {
  description: "Full-text search imported session messages, optionally filtered by project.",
  inputSchema: z.object({
    query: z.string().min(1),
    projectId: z.string().optional(),
    limit: z.number().int().min(1).max(200).default(50),
  }),
}, async ({ query, projectId, limit }) => text(searchSessionMessages(database, query, projectId, limit)));

server.registerTool("search_memories", {
  description: "Search durable memories by scope, subject and text.",
  inputSchema: z.object({
    scope: z.string().optional(),
    subjectId: z.string().optional(),
    text: z.string().optional(),
    limit: z.number().int().min(1).max(500).default(100),
  }),
}, async ({ scope, subjectId, text: queryText, limit }) =>
  text(listMemories(database, scope, subjectId, queryText, limit)));

server.registerTool("get_system_status", {
  description: "Return local AI OS paths and indexed record counts.",
  inputSchema: z.object({}),
}, async () => text({
  home: config.home,
  dataDir: config.dataDir,
  databasePath: config.databasePath,
  counts: getSystemCounts(database),
}));

const close = (): void => {
  try { database.close(); } catch { /* already closed */ }
};
process.on("exit", close);
process.on("SIGINT", () => { close(); process.exit(0); });
process.on("SIGTERM", () => { close(); process.exit(0); });

const transport = new StdioServerTransport();
await server.connect(transport);
