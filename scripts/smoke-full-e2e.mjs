#!/usr/bin/env node
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const runtime = await mkdtemp(join(tmpdir(), "ai-os-e2e-"));
const fixtureDir = join(runtime, "fixtures");
const fixture = join(fixtureDir, "codex-session.jsonl");
const registry = join(runtime, "import-sources.yaml");
const port = 14310 + Math.floor(Math.random() * 1000);
const env = { ...process.env, AI_OS_HOME: runtime, AI_OS_IMPORT_SOURCES_PATH: registry, AI_OS_API_PORT: String(port) };
const cli = ["apps/cli/dist/index.js"];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, env, encoding: "utf8", ...options });
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error(`${command} ${args.join(" ")} failed with ${result.status}`);
  }
  return result.stdout.trim();
}

async function waitFor(url, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { const response = await fetch(url); if (response.ok) return response; } catch {}
    await new Promise(resolveDelay => setTimeout(resolveDelay, 150));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function createJsonLineReader(stream) {
  let buffer = "";
  const pending = [];
  stream.setEncoding("utf8");
  stream.on("data", chunk => {
    buffer += chunk;
    while (buffer.includes("\n")) {
      const index = buffer.indexOf("\n");
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      let value;
      try { value = JSON.parse(line); } catch { continue; }
      const waiter = pending.shift();
      if (waiter) waiter.resolve(value);
    }
  });
  return (timeoutMs = 10000) => new Promise((resolveMessage, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for MCP response")), timeoutMs);
    pending.push({
      resolve(value) { clearTimeout(timer); resolveMessage(value); },
    });
  });
}

async function callMcpTool(processHandle, name, args = {}) {
  const nextMessage = createJsonLineReader(processHandle.stdout);
  const send = value => processHandle.stdin.write(`${JSON.stringify(value)}\n`);

  send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "ai-os-e2e", version: "1.0.0" } } });
  const initialized = await nextMessage();
  if (initialized.id !== 1 || initialized.error) throw new Error(`MCP initialize failed: ${JSON.stringify(initialized)}`);
  send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
  send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } });
  const result = await nextMessage();
  if (result.id !== 2 || result.error) throw new Error(`MCP tool call failed: ${JSON.stringify(result)}`);
  return result.result;
}

let dashboard;
let mcp;
try {
  await mkdir(fixtureDir, { recursive: true });
  await writeFile(fixture, [
    JSON.stringify({ session_id: "e2e-session", model: "test-model", role: "user", content: "E2E_UNIQUE_MESSAGE from configured source", timestamp: "2026-08-06T00:00:00Z" }),
    JSON.stringify({ session_id: "e2e-session", role: "assistant", content: "E2E response", timestamp: "2026-08-06T00:00:01Z" }),
  ].join("\n") + "\n");
  await writeFile(registry, `version: 1\nsources:\n  - id: e2e-codex\n    provider: codex\n    projectId: ai-os\n    path: ${JSON.stringify(fixture)}\n    enabled: true\n`);

  run("node", ["scripts/bootstrap.mjs"]);

  const before = JSON.parse(run("node", [...cli, "provider:sources:status", registry]));
  if (before.summary.new !== 1) throw new Error(`Expected one new source, received ${JSON.stringify(before.summary)}`);

  const sync = JSON.parse(run("node", [...cli, "provider:sources:sync", registry]));
  if (sync.summary.succeeded !== 1) throw new Error(`Expected one successful sync, received ${JSON.stringify(sync.summary)}`);

  const search = JSON.parse(run("node", [...cli, "archive:search", "E2E_UNIQUE_MESSAGE", "ai-os"]));
  if (search.count < 1) throw new Error("Imported provider message was not searchable");

  const after = JSON.parse(run("node", [...cli, "provider:sources:status", registry]));
  if (after.summary.synced !== 1) throw new Error(`Expected one synced source, received ${JSON.stringify(after.summary)}`);

  run("node", ["scripts/backup.mjs"]);
  const backups = await readdir(join(runtime, "backups"));
  if (backups.length < 1) throw new Error("Backup command did not create an archive");

  dashboard = spawn("node", ["apps/dashboard-api/dist/index.js"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  const health = await (await waitFor(`http://127.0.0.1:${port}/health`)).json();
  if (health.ok !== true) throw new Error("Dashboard health endpoint failed");
  const sessions = await (await waitFor(`http://127.0.0.1:${port}/api/sessions`)).json();
  if (!Array.isArray(sessions.sessions) || sessions.sessions.length < 1) throw new Error("Dashboard data endpoint returned no sessions");

  mcp = spawn("node", ["apps/mcp/dist/index.js"], { cwd: root, env, stdio: ["pipe", "pipe", "pipe"] });
  const mcpResult = await callMcpTool(mcp, "get_system_status");
  const textContent = mcpResult?.content?.find(item => item.type === "text")?.text;
  const status = textContent ? JSON.parse(textContent) : null;
  if (!status || status.counts?.sessions < 1) throw new Error(`MCP tool returned invalid status: ${JSON.stringify(mcpResult)}`);

  console.log(JSON.stringify({ smoke: "passed", providerImport: true, search: true, sourceSync: true, backup: true, dashboard: true, mcpToolCall: true }, null, 2));
} finally {
  dashboard?.kill("SIGTERM");
  mcp?.kill("SIGTERM");
  await rm(runtime, { recursive: true, force: true });
}
