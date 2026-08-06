import test from "node:test";
import assert from "node:assert/strict";
import { redactPath, redactPathFields } from "./privacy.js";

test("redacts repository and home paths while preserving relative paths", () => {
  const options = { repositoryRoot: "/work/ai-os", home: "/Users/test" };
  assert.equal(redactPath("/work/ai-os/config/import-sources.yaml", options), "<repo>/config/import-sources.yaml");
  assert.equal(redactPath("/Users/test/.codex/sessions/a.jsonl", options), "~/.codex/sessions/a.jsonl");
  assert.equal(redactPath("/private/provider/export.json", options), "<local>/export.json");
  assert.equal(redactPath("config/import-sources.yaml", options), "config/import-sources.yaml");
});

test("raw path exposure requires an explicit opt-in", () => {
  const path = "/Users/test/private/export.json";
  assert.equal(redactPath(path, { exposeRawPaths: true }), path);
});

test("recursively redacts path-shaped response fields", () => {
  const result = redactPathFields({
    registryPath: "/work/ai-os/config/import-sources.yaml",
    sources: [{ path: "/Users/test/.codex/session.jsonl", sourcePath: "/private/export.json" }],
    label: "/not/a/path/field",
  }, { repositoryRoot: "/work/ai-os", home: "/Users/test" });

  assert.deepEqual(result, {
    registryPath: "<repo>/config/import-sources.yaml",
    sources: [{ path: "~/.codex/session.jsonl", sourcePath: "<local>/export.json" }],
    label: "/not/a/path/field",
  });
});
