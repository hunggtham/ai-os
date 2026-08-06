import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";

export interface ProcessLock {
  path: string;
  acquiredAt: string;
  release(): Promise<void>;
}

export interface ProcessLockOptions {
  staleAfterMs?: number;
  now?: () => Date;
}

interface LockPayload {
  pid: number;
  acquiredAt: string;
  ownerToken: string;
}

function parsePayload(value: string): LockPayload | null {
  try {
    const parsed = JSON.parse(value) as Partial<LockPayload>;
    if (!Number.isInteger(parsed.pid) || typeof parsed.acquiredAt !== "string" || typeof parsed.ownerToken !== "string") return null;
    return { pid: parsed.pid as number, acquiredAt: parsed.acquiredAt, ownerToken: parsed.ownerToken };
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : undefined;
    return code === "EPERM";
  }
}

async function removeIfStale(path: string, staleAfterMs: number, now: Date): Promise<boolean> {
  try {
    const metadata = await stat(path);
    if (now.getTime() - metadata.mtimeMs <= staleAfterMs) return false;
    const payload = parsePayload(await readFile(path, "utf8"));
    if (payload && isProcessAlive(payload.pid)) return false;
    await rm(path, { force: true });
    return true;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : undefined;
    if (code === "ENOENT") return true;
    throw error;
  }
}

export async function acquireProcessLock(path: string, options: ProcessLockOptions = {}): Promise<ProcessLock> {
  const staleAfterMs = Math.max(options.staleAfterMs ?? 60 * 60 * 1000, 1_000);
  const now = options.now?.() ?? new Date();
  await mkdir(dirname(path), { recursive: true });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(path, "wx", 0o600);
      const payload: LockPayload = { pid: process.pid, acquiredAt: now.toISOString(), ownerToken: randomUUID() };
      await handle.writeFile(`${JSON.stringify(payload)}\n`, "utf8");
      await handle.close();
      let released = false;
      return {
        path,
        acquiredAt: payload.acquiredAt,
        async release(): Promise<void> {
          if (released) return;
          released = true;
          try {
            const current = parsePayload(await readFile(path, "utf8"));
            if (!current || current.ownerToken !== payload.ownerToken) return;
            await rm(path, { force: true });
          } catch (error) {
            const code = error && typeof error === "object" && "code" in error ? String(error.code) : undefined;
            if (code !== "ENOENT") throw error;
          }
        },
      };
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : undefined;
      if (code !== "EEXIST") throw error;
      if (attempt === 0 && await removeIfStale(path, staleAfterMs, now)) continue;
      let owner = "unknown";
      try { owner = (await readFile(path, "utf8")).trim() || "unknown"; } catch {}
      throw new Error(`Process lock is already held: ${path}; owner=${owner}`);
    }
  }

  throw new Error(`Unable to acquire process lock: ${path}`);
}
