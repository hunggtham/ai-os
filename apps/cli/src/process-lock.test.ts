import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { acquireProcessLock } from "./process-lock.js";

test("process lock blocks concurrent owners and releases idempotently", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ai-os-lock-"));
  const path = join(directory, "source-sync.lock");
  try {
    const first = await acquireProcessLock(path);
    await assert.rejects(() => acquireProcessLock(path), /already held/);
    await first.release();
    await first.release();
    const second = await acquireProcessLock(path);
    await second.release();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("process lock recovers a stale lock file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ai-os-stale-lock-"));
  const path = join(directory, "source-sync.lock");
  try {
    await writeFile(path, "{\"pid\":1}\n", "utf8");
    const future = new Date(Date.now() + 10_000);
    const lock = await acquireProcessLock(path, { staleAfterMs: 1_000, now: () => future });
    await lock.release();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
