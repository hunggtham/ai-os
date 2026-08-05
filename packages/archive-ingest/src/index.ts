import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import type { NormalizedMessage, NormalizedSessionArchive, SessionSource } from "@ai-os/provider-adapters";

interface JsonlRecord {
  role?: string;
  content?: string;
  text?: string;
  createdAt?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

function normalizeRole(role?: string): NormalizedMessage["role"] {
  switch (role?.toLowerCase()) {
    case "system": return "system";
    case "user": return "user";
    case "assistant": return "assistant";
    case "tool": return "tool";
    default: return "unknown";
  }
}

export async function parseJsonlArchive(
  source: SessionSource,
  sessionId: string,
  startedAt: string,
): Promise<NormalizedSessionArchive> {
  const text = await readFile(source.path, "utf8");
  const messages: NormalizedMessage[] = [];

  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let record: JsonlRecord;
    try {
      record = JSON.parse(line) as JsonlRecord;
    } catch (error) {
      throw new Error(`Invalid JSONL at line ${index + 1}`, { cause: error });
    }

    const content = record.content ?? record.text;
    if (!content) continue;

    const message: NormalizedMessage = {
      role: normalizeRole(record.role),
      content,
    };
    const createdAt = record.createdAt ?? record.timestamp;
    if (createdAt) message.createdAt = createdAt;
    if (record.metadata) message.metadata = record.metadata;
    messages.push(message);
  }

  return {
    id: sessionId,
    provider: source.providerHint ?? "unknown",
    projectId: source.projectId,
    startedAt,
    messages,
    sourcePath: source.path,
  };
}

export async function parseMarkdownArchive(
  source: SessionSource,
  sessionId: string,
  startedAt: string,
): Promise<NormalizedSessionArchive> {
  const text = await readFile(source.path, "utf8");
  const messages: NormalizedMessage[] = [];
  const heading = /^###\s+(system|user|assistant|tool)\s*$/gim;
  const matches = [...text.matchAll(heading)];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    if (!match || match.index === undefined) continue;
    const next = matches[index + 1];
    const start = match.index + match[0].length;
    const end = next?.index ?? text.length;
    const content = text.slice(start, end).trim();
    if (!content) continue;
    messages.push({ role: normalizeRole(match[1]), content });
  }

  return {
    id: sessionId,
    provider: source.providerHint ?? "unknown",
    projectId: source.projectId,
    startedAt,
    messages,
    sourcePath: source.path,
  };
}

export async function parseArchive(
  source: SessionSource,
  sessionId: string,
  startedAt: string,
): Promise<NormalizedSessionArchive> {
  const extension = extname(source.path).toLowerCase();
  if (extension === ".jsonl") return parseJsonlArchive(source, sessionId, startedAt);
  if (extension === ".md" || extension === ".markdown") {
    return parseMarkdownArchive(source, sessionId, startedAt);
  }
  throw new Error(`Unsupported archive format: ${extension || "unknown"}`);
}
