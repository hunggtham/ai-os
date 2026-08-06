#!/usr/bin/env node
import { createServer, type ServerResponse } from "node:http";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { loadConfig } from "@ai-os/config";
import { getSession, getSystemCounts, listProjects, listSessions, openDatabase, runMigrations } from "@ai-os/database";
import { inspectImportSources, loadImportSourceRegistry, summarizeImportSourceStatuses } from "@ai-os/import-sources";
import { getImportRun, getImportRunSummary, queryImportRuns } from "@ai-os/provider-import";
import { listSessionMessages, searchSessionMessages } from "@ai-os/session-store";
import { redactPath, redactPathFields, type PathRedactionOptions } from "./privacy.js";

const repositoryRoot = resolve(".");
const config = loadConfig();
const database = openDatabase(config.databasePath);
await runMigrations(database, resolve("packages/database/migrations"));

const port = Number(process.env.AI_OS_API_PORT ?? 4310);
const host = process.env.AI_OS_API_HOST ?? "127.0.0.1";
const importSourcesPath = resolve(process.env.AI_OS_IMPORT_SOURCES_PATH ?? "config/import-sources.yaml");
const exposeRawPaths = ["1", "true", "yes"].includes((process.env.AI_OS_EXPOSE_RAW_PATHS ?? "").toLowerCase());
const redactionOptions: PathRedactionOptions = { repositoryRoot, home: homedir(), exposeRawPaths };

const escapeHtml = (value: unknown): string => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char] ?? char);

const dashboardHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI OS Dashboard</title><style>body{font-family:system-ui,sans-serif;max-width:1100px;margin:auto;padding:24px;background:#f6f7f9;color:#15171a}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.card,.row{background:#fff;border:1px solid #ddd;border-radius:10px;padding:14px;margin:10px 0}.muted{color:#666}.tabs{display:flex;gap:8px;margin:18px 0}button,select,input{padding:9px;border:1px solid #bbb;border-radius:8px;background:#fff}.path,pre{white-space:pre-wrap;overflow-wrap:anywhere;font-family:ui-monospace,monospace}@media(max-width:700px){.grid{grid-template-columns:1fr}}</style></head><body><h1>AI OS Dashboard</h1><p class="muted">Local read-only project, session, provider-import and source-freshness view. Local filesystem paths are redacted by default.</p><div id="stats" class="grid"></div><div class="tabs"><button onclick="loadSessions()">Sessions</button><button onclick="loadImports()">Imports</button><button onclick="loadSources()">Sources</button></div><div id="results"></div><script>const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));async function api(p){const r=await fetch(p);if(!r.ok)throw new Error(await r.text());return r.json()}async function init(){const [s,i,x]=await Promise.all([api('/api/status'),api('/api/imports/summary'),api('/api/sources')]);const cards={...s.counts,importRuns:i.summary.total,importFailures:i.summary.failed,sourcesActionable:x.summary.actionable,sourcesMissing:x.summary.missing};stats.innerHTML=Object.entries(cards).map(([k,v])=>'<div class="card"><div class="muted">'+esc(k)+'</div><strong>'+esc(v)+'</strong></div>').join('');loadSessions()}async function loadSessions(){const d=await api('/api/sessions?limit=50');results.innerHTML=d.sessions.map(s=>'<div class="row"><strong>'+esc(s.provider)+'</strong> · '+esc(s.projectId)+'<br><a href="/session?id='+encodeURIComponent(s.id)+'">'+esc(s.id)+'</a><br><span class="muted">'+esc(s.startedAt)+'</span></div>').join('')||'<p>No sessions</p>'}async function loadImports(){const d=await api('/api/imports?limit=50');results.innerHTML=d.imports.map(r=>'<div class="row"><strong>'+esc(r.status)+' · '+esc(r.provider)+'</strong><br><a href="/import?id='+encodeURIComponent(r.id)+'">'+esc(r.id)+'</a><br><span class="muted">'+esc(r.startedAt)+'</span></div>').join('')||'<p>No imports</p>'}async function loadSources(){const d=await api('/api/sources');if(!d.configured){results.innerHTML='<p>Registry not configured: <span class="path">'+esc(d.registryPath)+'</span></p>';return}results.innerHTML=d.sources.map(s=>'<div class="row"><strong>'+esc(s.state)+' · '+esc(s.id)+'</strong><br><span class="path">'+esc(s.path)+'</span></div>').join('')||'<p>No sources</p>'}init().catch(e=>results.textContent=e.message)</script></body></html>`;

function detailPage(title: string, metadata: string, content = ""): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · AI OS</title><style>body{font-family:system-ui,sans-serif;max-width:980px;margin:auto;padding:24px;background:#f6f7f9}.box,.meta{background:#fff;border:1px solid #ddd;border-radius:10px;padding:16px;margin:14px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body><a href="/">← Dashboard</a><h1>${escapeHtml(title)}</h1><section class="meta">${metadata}</section>${content}</body></html>`;
}

function sessionHtml(id: string): string | null {
  const session = getSession(database, id);
  if (!session) return null;
  const safeSession = redactPathFields(session, redactionOptions);
  const messages = listSessionMessages(database, id);
  const rows = messages.map((message) => `<article class="box"><strong>${escapeHtml(message.role)} · #${message.ordinal}</strong><pre>${escapeHtml(message.content)}</pre></article>`).join("");
  return detailPage("Session", `<strong>${escapeHtml(safeSession.id)}</strong><br>${escapeHtml(safeSession.provider)} · ${escapeHtml(safeSession.projectId)}<br>${escapeHtml(safeSession.startedAt)}<br>Archive: ${escapeHtml(safeSession.archivePath)}<br>${messages.length} messages`, rows || "<p>No messages indexed.</p>");
}

function importHtml(id: string): string | null {
  const run = getImportRun(database, id);
  if (!run) return null;
  const safeRun = redactPathFields(run, redactionOptions);
  const error = safeRun.errorMessage ? `<h2>Error</h2><pre>${escapeHtml(safeRun.errorMessage)}</pre>` : "";
  const body = `<strong>${escapeHtml(safeRun.id)}</strong><br>${escapeHtml(safeRun.status)} · ${escapeHtml(safeRun.provider)} · ${escapeHtml(safeRun.projectId)}<br>${escapeHtml(safeRun.startedAt)} → ${escapeHtml(safeRun.finishedAt ?? "running")}<br>${safeRun.sessionsCount} sessions · ${safeRun.messagesCount} messages<h2>Source</h2><pre>${escapeHtml(safeRun.sourcePath)}</pre><h2>SHA-256</h2><pre>${escapeHtml(safeRun.contentHash)}</pre>${error}`;
  return detailPage("Import run", body);
}

function numberParam(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), 0), max) : fallback;
}

function json(response: ServerResponse, value: unknown, statusCode = 200): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(redactPathFields(value, redactionOptions)));
}

async function sourceSnapshot(sourceId?: string): Promise<unknown> {
  try {
    const registry = await loadImportSourceRegistry(importSourcesPath);
    const sources = await inspectImportSources(database, registry, sourceId);
    return { configured: true, registryPath: importSourcesPath, summary: summarizeImportSourceStatuses(sources), sources };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : undefined;
    if (code === "ENOENT") return { configured: false, registryPath: importSourcesPath, summary: summarizeImportSourceStatuses([]), sources: [] };
    throw error;
  }
}

const server = createServer(async (request, response) => {
  try {
    if (request.method !== "GET") return json(response, { error: "read_only_api" }, 405);
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname === "/") { response.setHeader("content-type", "text/html; charset=utf-8"); response.end(dashboardHtml); return; }
    if (url.pathname === "/session" || url.pathname === "/import") {
      const id = url.searchParams.get("id")?.trim();
      if (!id) return json(response, { error: "missing_id" }, 400);
      const html = url.pathname === "/session" ? sessionHtml(id) : importHtml(id);
      if (!html) return json(response, { error: "not_found" }, 404);
      response.setHeader("content-type", "text/html; charset=utf-8"); response.end(html); return;
    }
    if (url.pathname === "/health") return json(response, { ok: true, rawPathsExposed: exposeRawPaths });
    if (url.pathname === "/api/status") return json(response, { counts: getSystemCounts(database), privacy: { rawPathsExposed: exposeRawPaths } });
    if (url.pathname === "/api/projects") return json(response, { projects: listProjects(database) });
    if (url.pathname === "/api/sources") return json(response, await sourceSnapshot(url.searchParams.get("sourceId") ?? undefined));
    if (url.pathname === "/api/imports/summary") return json(response, { summary: getImportRunSummary(database) });
    if (url.pathname === "/api/imports") {
      const limit = numberParam(url.searchParams.get("limit"), 50, 100);
      const offset = numberParam(url.searchParams.get("offset"), 0, 100000);
      const rows = queryImportRuns(database, { limit: limit + 1, offset,
        ...(url.searchParams.get("projectId") ? { projectId: url.searchParams.get("projectId") ?? undefined } : {}),
        ...(url.searchParams.get("provider") ? { provider: url.searchParams.get("provider") ?? undefined } : {}),
        ...(url.searchParams.get("status") ? { status: url.searchParams.get("status") ?? undefined } : {}),
      });
      return json(response, { imports: rows.slice(0, limit), offset, limit, hasMore: rows.length > limit });
    }
    if (url.pathname.startsWith("/api/imports/")) {
      const run = getImportRun(database, decodeURIComponent(url.pathname.slice("/api/imports/".length)));
      return run ? json(response, { import: run }) : json(response, { error: "import_not_found" }, 404);
    }
    if (url.pathname === "/api/sessions") {
      const projectId = url.searchParams.get("projectId") ?? undefined;
      const limit = numberParam(url.searchParams.get("limit"), 50, 100);
      const offset = numberParam(url.searchParams.get("offset"), 0, 100000);
      const rows = listSessions(database, projectId, limit + 1, offset);
      return json(response, { sessions: rows.slice(0, limit), offset, limit, hasMore: rows.length > limit });
    }
    if (url.pathname.startsWith("/api/sessions/") && url.pathname.endsWith("/messages")) {
      const id = decodeURIComponent(url.pathname.slice("/api/sessions/".length, -"/messages".length));
      const session = getSession(database, id);
      if (!session) return json(response, { error: "session_not_found" }, 404);
      return json(response, { session, messages: listSessionMessages(database, id) });
    }
    if (url.pathname === "/api/search/sessions") {
      const query = url.searchParams.get("q")?.trim();
      if (!query) return json(response, { error: "missing_query" }, 400);
      const projectId = url.searchParams.get("projectId") ?? undefined;
      const limit = numberParam(url.searchParams.get("limit"), 50, 100);
      const offset = numberParam(url.searchParams.get("offset"), 0, 100000);
      const rows = searchSessionMessages(database, query, projectId, limit + 1, offset);
      return json(response, { results: rows.slice(0, limit), offset, limit, hasMore: rows.length > limit });
    }
    return json(response, { error: "not_found" }, 404);
  } catch (error) {
    return json(response, { error: "internal_error", message: error instanceof Error ? error.message : String(error) }, 500);
  }
});

const close = (): void => { try { database.close(); } catch {} };
process.on("SIGINT", () => { close(); process.exit(0); });
process.on("SIGTERM", () => { close(); process.exit(0); });
server.listen(port, host, () => console.log(`AI OS dashboard listening on http://${host}:${port}`));
