import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

test("process lock recovers a stale lock only when its owner is not alive", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ai-os-stale-lock-"));
  const path = join(directory, "source-sync.lock");
  try {
    await writeFile(path, JSON.stringify({ pid: 2_147_483_647, acquiredAt: "2026-08-01T00:00:00.000Z", ownerToken: "dead-owner" }), "utf8");
    const future = new Date(Date.now() + 10_000);
    const lock = await acquireProcessLock(path, { staleAfterMs: 1_000, now: () => future });
    await lock.release();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("process lock does not steal an old lock from a live process", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ai-os-live-lock-"));
  const path = join(directory, "source-sync.lock");
  try {
    await writeFile(path, JSON.stringify({ pid: process.pid, acquiredAt: "2026-08-01T00:00:00.000Z", ownerToken: "live-owner" }), "utf8");
    const future = new Date(Date.now() + 10_000);
    await assert.rejects(() => acquireProcessLock(path, { staleAfterMs: 1_000, now: () => future }), /already held/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("release never removes a replacement lock owned by another process", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ai-os-replaced-lock-"));
  const path = join(directory, "source-sync.lock");
  try {
    const lock = await acquireProcessLock(path);
    const replacement = JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString(), ownerToken: "replacement-owner" });
    await writeFile(path, replacement, "utf8");
    await lock.release();
    assert.equal(await readFile(path, "utf8"), replacement);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
