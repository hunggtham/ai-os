#!/usr/bin/env node
import { createServer } from "node:http";
import { resolve } from "node:path";
import { loadConfig } from "@ai-os/config";
import { getSession, getSystemCounts, listProjects, listSessions, openDatabase, runMigrations } from "@ai-os/database";
import { inspectImportSources, loadImportSourceRegistry, summarizeImportSourceStatuses } from "@ai-os/import-sources";
import { getImportRun, getImportRunSummary, queryImportRuns } from "@ai-os/provider-import";
import { listSessionMessages, searchSessionMessages } from "@ai-os/session-store";

const config = loadConfig();
const database = openDatabase(config.databasePath);
await runMigrations(database, resolve("packages/database/migrations"));
const port = Number(process.env.AI_OS_API_PORT ?? 4310);
const host = process.env.AI_OS_API_HOST ?? "127.0.0.1";
const importSourcesPath = resolve(process.env.AI_OS_IMPORT_SOURCES_PATH ?? "config/import-sources.yaml");

const escapeHtml = (value: unknown): string => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char] ?? char);

const dashboardHtml = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI OS Dashboard</title><style>
body{font-family:system-ui,sans-serif;max-width:1100px;margin:0 auto;padding:24px;background:#f6f7f9;color:#15171a}h1{margin-bottom:4px}.muted{color:#666}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:20px 0}.card{background:white;border:1px solid #ddd;border-radius:10px;padding:16px}.controls,.tabs{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}input,select,button{padding:10px;border:1px solid #bbb;border-radius:8px;background:white}input{min-width:240px}button{cursor:pointer}.active{font-weight:700;border-color:#175cd3}.result{white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:13px}.row{border-top:1px solid #eee;padding:10px 0}.pager{display:flex;gap:8px;align-items:center;margin-top:12px}.badge{display:inline-block;padding:2px 7px;border:1px solid #bbb;border-radius:99px;font-size:12px}.path{overflow-wrap:anywhere;font-family:ui-monospace,monospace;font-size:12px}a{color:#175cd3;text-decoration:none}a:hover{text-decoration:underline}@media(max-width:700px){.grid{grid-template-columns:1fr}input{min-width:100%}}
</style></head><body>
<h1>AI OS Dashboard</h1><div class="muted">Local read-only view of projects, sessions, provider imports and configured export sources.</div>
<div id="stats" class="grid"></div>
<div class="tabs"><button id="sessionsTab" class="active">Sessions</button><button id="importsTab">Import history</button><button id="sourcesTab">Source freshness</button></div>
<div class="card">
<div id="sessionControls" class="controls"><select id="project"></select><input id="query" placeholder="Search session messages"><button id="search">Search</button><button id="sessions">Recent sessions</button></div>
<div id="importControls" class="controls" hidden><select id="importProject"></select><select id="provider"><option value="">All providers</option><option>chatgpt</option><option>codex</option><option>opencodex</option><option>gemini</option><option>claude</option><option>ollama</option></select><select id="status"><option value="">All statuses</option><option>running</option><option>succeeded</option><option>failed</option><option>skipped</option></select><button id="refreshImports">Refresh</button></div>
<div id="sourceControls" class="controls" hidden><select id="sourceState"><option value="">All states</option><option>new</option><option>changed</option><option>synced</option><option>missing</option><option>disabled</option><option>error</option></select><button id="refreshSources">Refresh</button></div>
<div id="results"></div><div id="pager" class="pager"><button id="prev">Previous</button><span id="page"></span><button id="next">Next</button></div></div>
<script>
let page=1;const pageSize=20;let mode='sessions';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function json(path){const r=await fetch(path);if(!r.ok)throw new Error(await r.text());return r.json()}
function projectOptions(projects){return '<option value="">All projects</option>'+projects.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join('')}
async function init(){const [system,projects,imports,sources]=await Promise.all([json('/api/status'),json('/api/projects'),json('/api/imports/summary'),json('/api/sources')]);const cards={...system.counts,importRuns:imports.summary.total,importFailures:imports.summary.failed,sourcesActionable:sources.summary.actionable,sourcesMissing:sources.summary.missing};stats.innerHTML=Object.entries(cards).map(([k,v])=>'<div class="card"><div class="muted">'+esc(k)+'</div><strong>'+esc(v)+'</strong></div>').join('');project.innerHTML=projectOptions(projects.projects);importProject.innerHTML=projectOptions(projects.projects);loadSessions()}
async function loadSessions(){mode='sessions';pager.hidden=false;const offset=(page-1)*pageSize;const p=new URLSearchParams({limit:String(pageSize),offset:String(offset)});if(project.value)p.set('projectId',project.value);const d=await json('/api/sessions?'+p);results.innerHTML=d.sessions.map(s=>'<div class="row"><strong>'+esc(s.provider)+'</strong> · '+esc(s.projectId)+'<br><span class="muted">'+esc(s.startedAt)+' · </span><a href="/session?id='+encodeURIComponent(s.id)+'">'+esc(s.id)+'</a></div>').join('')||'<div class="muted">No sessions</div>';updatePager(d.hasMore)}
async function runSearch(){const q=query.value.trim();if(!q)return;mode='search';pager.hidden=false;const offset=(page-1)*pageSize;const p=new URLSearchParams({q,limit:String(pageSize),offset:String(offset)});if(project.value)p.set('projectId',project.value);const d=await json('/api/search/sessions?'+p);results.innerHTML=d.results.map(r=>'<div class="row"><strong>'+esc(r.role)+'</strong> · <a href="/session?id='+encodeURIComponent(r.sessionId)+'">'+esc(r.sessionId)+'</a><div class="result">'+esc(r.content)+'</div></div>').join('')||'<div class="muted">No matches</div>';updatePager(d.hasMore)}
async function loadImports(){mode='imports';pager.hidden=false;const offset=(page-1)*pageSize;const p=new URLSearchParams({limit:String(pageSize),offset:String(offset)});if(importProject.value)p.set('projectId',importProject.value);if(provider.value)p.set('provider',provider.value);if(status.value)p.set('status',status.value);const d=await json('/api/imports?'+p);results.innerHTML=d.imports.map(r=>'<div class="row"><span class="badge">'+esc(r.status)+'</span> <strong>'+esc(r.provider)+'</strong> · '+esc(r.projectId)+'<br><a href="/import?id='+encodeURIComponent(r.id)+'">'+esc(r.id)+'</a><br><span class="muted">'+esc(r.startedAt)+' · '+esc(r.sessionsCount)+' sessions · '+esc(r.messagesCount)+' messages</span></div>').join('')||'<div class="muted">No import runs</div>';updatePager(d.hasMore)}
async function loadSources(){mode='sources';pager.hidden=true;const d=await json('/api/sources');if(!d.configured){results.innerHTML='<div class="muted">Import source registry is not configured.</div><div class="path">'+esc(d.registryPath)+'</div>';return}const selected=sourceState.value?d.sources.filter(s=>s.state===sourceState.value):d.sources;results.innerHTML=selected.map(s=>'<div class="row"><span class="badge">'+esc(s.state)+'</span> <strong>'+esc(s.id)+'</strong> · '+esc(s.provider||'auto')+' · '+esc(s.projectId)+'<br><span class="path">'+esc(s.path)+'</span><br><span class="muted">'+(s.sizeBytes===undefined?'':esc(s.sizeBytes)+' bytes · ')+(s.modifiedAt?esc(s.modifiedAt)+' · ':'')+(s.lastImportStatus?'last import '+esc(s.lastImportStatus):'never imported')+'</span>'+(s.error?'<div class="result">'+esc(s.error)+'</div>':'')+'</div>').join('')||'<div class="muted">No sources for this state</div>'}
function updatePager(hasMore){page.textContent='Page '+window.page;prev.disabled=window.page<=1;next.disabled=!hasMore}
function activate(tab,controls){[sessionsTab,importsTab,sourcesTab].forEach(x=>x.classList.remove('active'));tab.classList.add('active');[sessionControls,importControls,sourceControls].forEach(x=>x.hidden=true);controls.hidden=false;page=1}
function showSessions(){activate(sessionsTab,sessionControls);loadSessions()}function showImports(){activate(importsTab,importControls);loadImports()}function showSources(){activate(sourcesTab,sourceControls);loadSources()}
sessionsTab.onclick=showSessions;importsTab.onclick=showImports;sourcesTab.onclick=showSources;search.onclick=()=>{page=1;runSearch()};sessions.onclick=()=>{page=1;loadSessions()};project.onchange=()=>{page=1;mode==='search'?runSearch():loadSessions()};refreshImports.onclick=()=>{page=1;loadImports()};importProject.onchange=refreshImports.onclick;provider.onchange=refreshImports.onclick;status.onchange=refreshImports.onclick;refreshSources.onclick=loadSources;sourceState.onchange=loadSources;prev.onclick=()=>{if(page>1){page--;mode==='search'?runSearch():mode==='imports'?loadImports():loadSessions()}};next.onclick=()=>{page++;mode==='search'?runSearch():mode==='imports'?loadImports():loadSessions()};query.onkeydown=e=>{if(e.key==='Enter'){page=1;runSearch()}};init().catch(e=>results.textContent=e.message);
</script></body></html>`;

function sessionHtml(id: string): string | null {
  const session = getSession(database, id);
  if (!session) return null;
  const messages = listSessionMessages(database, id);
  const rows = messages.map((message) => `<article class="box"><div class="role">${escapeHtml(message.role)} · #${message.ordinal}</div><pre>${escapeHtml(message.content)}</pre></article>`).join("");
  return detailPage("Session", `<strong>${escapeHtml(session.id)}</strong><br>${escapeHtml(session.provider)} · ${escapeHtml(session.projectId)}<br>${escapeHtml(session.startedAt)}<br>${messages.length} messages`, rows || "<p>No messages indexed.</p>");
}

function importHtml(id: string): string | null {
  const run = getImportRun(database, id);
  if (!run) return null;
  const error = run.errorMessage ? `<h2>Error</h2><pre>${escapeHtml(run.errorMessage)}</pre>` : "";
  const body = `<strong>${escapeHtml(run.id)}</strong><br><span class="badge">${escapeHtml(run.status)}</span> ${escapeHtml(run.provider)} · ${escapeHtml(run.projectId)}<br>${escapeHtml(run.startedAt)} → ${escapeHtml(run.finishedAt ?? "running")}<br>${run.sessionsCount} sessions · ${run.messagesCount} messages<h2>Source</h2><pre>${escapeHtml(run.sourcePath)}</pre><h2>SHA-256</h2><pre>${escapeHtml(run.contentHash)}</pre>${error}`;
  return detailPage("Import run", body, "");
}

function detailPage(title: string, metadata: string, content: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · AI OS</title><style>body{font-family:system-ui,sans-serif;max-width:980px;margin:0 auto;padding:24px;background:#f6f7f9;color:#15171a}a{color:#175cd3}.meta,.box{background:white;border:1px solid #ddd;border-radius:10px;padding:16px;margin:14px 0}.role{font-weight:700;text-transform:uppercase;font-size:12px;color:#555}.badge{display:inline-block;padding:2px 7px;border:1px solid #bbb;border-radius:99px;font-size:12px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-family:ui-monospace,monospace;font-size:13px;line-height:1.5}</style></head><body><a href="/">← Dashboard</a><h1>${escapeHtml(title)}</h1><section class="meta">${metadata}</section>${content}</body></html>`;
}

function numberParam(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), 0), max) : fallback;
}
function json(response: import("node:http").ServerResponse, value: unknown, statusCode = 200): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(value));
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
    if (url.pathname === "/health") return json(response, { ok: true });
    if (url.pathname === "/api/status") return json(response, { counts: getSystemCounts(database) });
    if (url.pathname === "/api/projects") return json(response, { projects: listProjects(database) });
    if (url.pathname === "/api/sources") return json(response, await sourceSnapshot(url.searchParams.get("sourceId") ?? undefined));
    if (url.pathname === "/api/imports/summary") return json(response, { summary: getImportRunSummary(database) });
    if (url.pathname === "/api/imports") {
      const limit = numberParam(url.searchParams.get("limit"), 50, 100);
      const offset = numberParam(url.searchParams.get("offset"), 0, 100000);
      const rows = queryImportRuns(database, {
        limit: limit + 1,
        offset,
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
      const rows = listSessions(database, projectId, Math.min(offset + limit + 1, 500));
      return json(response, { sessions: rows.slice(offset, offset + limit), offset, limit, hasMore: rows.length > offset + limit });
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
      const offset = numberParam(url.searchParams.get("offset"), 0, 190);
      const rows = searchSessionMessages(database, query, projectId, Math.min(offset + limit + 1, 200));
      return json(response, { results: rows.slice(offset, offset + limit), offset, limit, hasMore: rows.length > offset + limit });
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
