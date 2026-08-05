import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { ChatGptExportAdapter, CodexJsonlAdapter } from "./builtin.js";

test("ChatGPT export adapter follows the active conversation branch", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ai-os-chatgpt-"));
  try {
    const path = join(directory, "conversations.json");
    await writeFile(path, JSON.stringify([{
      id: "conversation-1",
      title: "Architecture",
      create_time: 1,
      update_time: 3,
      current_node: "assistant",
      mapping: {
        root: { parent: null, message: null },
        user: { parent: "root", message: { id: "m1", author: { role: "user" }, create_time: 2, content: { parts: ["Design AI OS"] } } },
        assistant: { parent: "user", message: { id: "m2", author: { role: "assistant" }, create_time: 3, content: { parts: ["Use Git as source of truth"] } } },
      },
    }]));
    const adapter = new ChatGptExportAdapter();
    assert.equal(await adapter.supports({ path, projectId: "ai-os" }), true);
    const archives = await adapter.parse({ path, projectId: "ai-os" });
    assert.equal(archives.length, 1);
    assert.equal(archives[0]?.title, "Architecture");
    assert.deepEqual(archives[0]?.messages.map((message) => message.role), ["user", "assistant"]);
    assert.equal(archives[0]?.messages[1]?.content, "Use Git as source of truth");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("Codex adapter extracts role-based JSONL messages", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ai-os-codex-"));
  try {
    const path = join(directory, "session.jsonl");
    await writeFile(path, [
      JSON.stringify({ session_id: "session-1", model: "gpt", role: "user", content: "Inspect CI", timestamp: "2026-08-05T00:00:00Z" }),
      JSON.stringify({ role: "assistant", content: [{ type: "output_text", text: "CI is green" }], timestamp: "2026-08-05T00:01:00Z" }),
    ].join("\n"));
    const adapter = new CodexJsonlAdapter();
    const source = { path, projectId: "ai-os", providerHint: "codex" };
    assert.equal(adapter.supports(source), true);
    const archives = await adapter.parse(source);
    assert.equal(archives[0]?.model, "gpt");
    assert.deepEqual(archives[0]?.messages.map((message) => message.content), ["Inspect CI", "CI is green"]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
