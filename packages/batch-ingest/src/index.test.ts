import assert from "node:assert/strict";
import test from "node:test";
import { deterministicSessionId } from "./index.js";

test("deterministic session IDs are stable and path-sensitive", () => {
  const first = deterministicSessionId("ai-os", "codex", "2026/session.md");
  const repeated = deterministicSessionId("ai-os", "codex", "2026/session.md");
  const different = deterministicSessionId("ai-os", "codex", "2026/other.md");

  assert.equal(first, repeated);
  assert.notEqual(first, different);
  assert.match(first, /^session-[a-f0-9]{24}$/);
});
