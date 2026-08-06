import test from "node:test";
import assert from "node:assert/strict";
import { redactResponseBody } from "./response-privacy.js";

const options = { repositoryRoot: "/work/ai-os", home: "/Users/test" };

test("redacts path fields in JSON API responses", () => {
  const body = JSON.stringify({
    registryPath: "/work/ai-os/config/import-sources.yaml",
    import: { sourcePath: "/Users/test/private/export.json" },
    session: { archivePath: "/private/archive.jsonl" },
  });
  assert.deepEqual(JSON.parse(redactResponseBody(body, "application/json", options)), {
    registryPath: "<repo>/config/import-sources.yaml",
    import: { sourcePath: "~/private/export.json" },
    session: { archivePath: "<local>/archive.jsonl" },
  });
});

test("redacts dashboard path display regions", () => {
  const html = '<span class="path">/Users/test/.codex/a.jsonl</span><pre>/private/export.json</pre>';
  assert.equal(
    redactResponseBody(html, "text/html; charset=utf-8", options),
    '<span class="path">~/.codex/a.jsonl</span><pre><local>/export.json</pre>',
  );
});

test("explicit raw-path opt-in bypasses response redaction", () => {
  const body = JSON.stringify({ sourcePath: "/private/export.json" });
  assert.equal(
    redactResponseBody(body, "application/json", { ...options, exposeRawPaths: true }),
    body,
  );
});
