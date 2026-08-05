#!/usr/bin/env node
import { createServer } from "node:http";
import { resolve } from "node:path";
import { loadConfig } from "@ai-os/config";
import { getSystemCounts, listProjects, listSessions, openDatabase, runMigrations } from "@ai-os/database";
import { searchSessionMessages } from "@ai-os/session-store";

const config = loadConfig();
const database = openDatabase(config.databasePath);
await runMigrations(database, resolve("packages/database/migrations"));
const port = Number(process.env.AI_OS_API_PORT ?? 4310);
const host = process.env.AI_OS_API_HOST ?? "127.0.0.1";

const server = createServer((request, response) => {
  response.setHeader("content-type", "application/json; charset=utf-8");
  if (request.method !== "GET") {
    response.statusCode = 405;
    response.end(JSON.stringify({ error: "read_only_api" }));
    return;
  }

  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname === "/health") {
    response.end(JSON.stringify({ ok: true }));
    return;
  }
  if (url.pathname === "/api/status") {
    response.end(JSON.stringify({ counts: getSystemCounts(database) }));
    return;
  }
  if (url.pathname === "/api/projects") {
    response.end(JSON.stringify({ projects: listProjects(database) }));
    return;
  }
  if (url.pathname === "/api/sessions") {
    const projectId = url.searchParams.get("projectId") ?? undefined;
    const limit = Number(url.searchParams.get("limit") ?? 50);
    response.end(JSON.stringify({ sessions: listSessions(database, projectId, limit) }));
    return;
  }
  if (url.pathname === "/api/search/sessions") {
    const query = url.searchParams.get("q")?.trim();
    if (!query) {
      response.statusCode = 400;
      response.end(JSON.stringify({ error: "missing_query" }));
      return;
    }
    const projectId = url.searchParams.get("projectId") ?? undefined;
    const limit = Number(url.searchParams.get("limit") ?? 50);
    response.end(JSON.stringify({ results: searchSessionMessages(database, query, projectId, limit) }));
    return;
  }

  response.statusCode = 404;
  response.end(JSON.stringify({ error: "not_found" }));
});

server.listen(port, host, () => {
  console.log(`AI OS dashboard API listening on http://${host}:${port}`);
});
