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

const dashboardHtml = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI OS Dashboard</title><style>
body{font-family:system-ui,sans-serif;max-width:1100px;margin:0 auto;padding:24px;background:#f6f7f9;color:#15171a}h1{margin-bottom:4px}.muted{color:#666}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:20px 0}.card{background:white;border:1px solid #ddd;border-radius:10px;padding:16px}.controls{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}input,select,button{padding:10px;border:1px solid #bbb;border-radius:8px;background:white}input{min-width:280px}button{cursor:pointer}.result{white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:13px}.row{border-top:1px solid #eee;padding:10px 0}.pager{display:flex;gap:8px;align-items:center;margin-top:12px}@media(max-width:700px){.grid{grid-template-columns:1fr}input{min-width:100%}}
</style></head><body>
<h1>AI OS Dashboard</h1><div class="muted">Local read-only view of projects, sessions and indexed messages.</div>
<div id="stats" class="grid"></div>
<div class="card"><div class="controls"><select id="project"></select><input id="query" placeholder="Search session messages"><button id="search">Search</button><button id="sessions">Recent sessions</button></div><div id="results"></div><div class="pager"><button id="prev">Previous</button><span id="page"></span><button id="next">Next</button></div></div>
<script>
let page=1;const pageSize=20;let mode='sessions';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function json(path){const r=await fetch(path);if(!r.ok)throw new Error(await r.text());return r.json()}
async function init(){const [status,projects]=await Promise.all([json('/api/status'),json('/api/projects')]);stats.innerHTML=Object.entries(status.counts).map(([k,v])=>'<div class="card"><div class="muted">'+esc(k)+'</div><strong>'+esc(v)+'</strong></div>').join('');project.innerHTML='<option value="">All projects</option>'+projects.projects.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join('');loadSessions()}
async function loadSessions(){mode='sessions';const offset=(page-1)*pageSize;const p=new URLSearchParams({limit:String(pageSize),offset:String(offset)});if(project.value)p.set('projectId',project.value);const d=await json('/api/sessions?'+p);results.innerHTML=d.sessions.map(s=>'<div class="row"><strong>'+esc(s.provider)+'</strong> · '+esc(s.projectId)+'<br><span class="muted">'+esc(s.startedAt)+' · '+esc(s.id)+'</span></div>').join('')||'<div class="muted">No sessions</div>';updatePager(d.hasMore)}
async function runSearch(){const q=query.value.trim();if(!q)return;mode='search';const offset=(page-1)*pageSize;const p=new URLSearchParams({q,limit:String(pageSize),offset:String(offset)});if(project.value)p.set('projectId',project.value);const d=await json('/api/search/sessions?'+p);results.innerHTML=d.results.map(r=>'<div class="row"><strong>'+esc(r.role)+'</strong> · '+esc(r.sessionId)+'<div class="result">'+esc(r.content)+'</div></div>').join('')||'<div class="muted">No matches</div>';updatePager(d.hasMore)}
function updatePager(hasMore){document.getElementById('page').textContent='Page '+page;prev.disabled=page<=1;next.disabled=!hasMore}
search.onclick=()=>{page=1;runSearch()};sessions.onclick=()=>{page=1;loadSessions()};project.onchange=()=>{page=1;mode==='search'?runSearch():loadSessions()};prev.onclick=()=>{if(page>1){page--;mode==='search'?runSearch():loadSessions()}};next.onclick=()=>{page++;mode==='search'?runSearch():loadSessions()};query.onkeydown=e=>{if(e.key==='Enter'){page=1;runSearch()}};init().catch(e=>results.textContent=e.message);
</script></body></html>`;

function numberParam(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), 0), max) : fallback;
}
function json(response: import("node:http").ServerResponse, value: unknown, status = 200): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(value));
}

const server = createServer((request, response) => {
  if (request.method !== "GET") return json(response, { error: "read_only_api" }, 405);
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname === "/") { response.setHeader("content-type", "text/html; charset=utf-8"); response.end(dashboardHtml); return; }
  if (url.pathname === "/health") return json(response, { ok: true });
  if (url.pathname === "/api/status") return json(response, { counts: getSystemCounts(database) });
  if (url.pathname === "/api/projects") return json(response, { projects: listProjects(database) });
  if (url.pathname === "/api/sessions") {
    const projectId = url.searchParams.get("projectId") ?? undefined;
    const limit = numberParam(url.searchParams.get("limit"), 50, 100);
    const offset = numberParam(url.searchParams.get("offset"), 0, 100000);
    const rows = listSessions(database, projectId, Math.min(offset + limit + 1, 500));
    return json(response, { sessions: rows.slice(offset, offset + limit), offset, limit, hasMore: rows.length > offset + limit });
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
});

const close = (): void => { try { database.close(); } catch {} };
process.on("SIGINT", () => { close(); process.exit(0); });
process.on("SIGTERM", () => { close(); process.exit(0); });
server.listen(port, host, () => console.log(`AI OS dashboard listening on http://${host}:${port}`));
