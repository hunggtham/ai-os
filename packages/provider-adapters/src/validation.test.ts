import assert from "node:assert/strict";
import test from "node:test";
import {
  assertImportableArchives,
  inspectNormalizedArchives,
  type NormalizedSessionArchive,
} from "./index.js";

const archive = (id: string, messages: NormalizedSessionArchive["messages"]): NormalizedSessionArchive => ({
  id,
  provider: "chatgpt",
  projectId: "ai-os",
  startedAt: "2026-08-05T00:00:00.000Z",
  messages,
  sourcePath: "/tmp/conversations.json",
});

test("inspectNormalizedArchives summarizes providers, roles and time range", () => {
  const result = inspectNormalizedArchives([
    archive("one", [
      { role: "user", content: "Question" },
      { role: "assistant", content: "Answer" },
    ]),
    { ...archive("two", [{ role: "user", content: "Next" }]), provider: "codex", startedAt: "2026-08-06T00:00:00.000Z" },
  ]);

  assert.equal(result.sessions, 2);
  assert.equal(result.messages, 3);
  assert.deepEqual(result.providers, { chatgpt: 1, codex: 1 });
  assert.deepEqual(result.roles, { user: 2, assistant: 1 });
  assert.equal(result.earliestStartedAt, "2026-08-05T00:00:00.000Z");
  assert.equal(result.latestStartedAt, "2026-08-06T00:00:00.000Z");
});

test("assertImportableArchives rejects empty and duplicate sessions", () => {
  assert.throws(() => assertImportableArchives([]), /no sessions/i);
  assert.throws(
    () => assertImportableArchives([archive("empty", [])]),
    /empty sessions/i,
  );
  assert.throws(
    () => assertImportableArchives([
      archive("duplicate", [{ role: "user", content: "one" }]),
      archive("duplicate", [{ role: "assistant", content: "two" }]),
    ]),
    /duplicate session IDs/i,
  );
});
