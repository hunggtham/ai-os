import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import type { NormalizedMessage, NormalizedSessionArchive, ProviderSessionAdapter, SessionSource } from "./index.js";

type JsonObject = Record<string, unknown>;

const object = (value: unknown): JsonObject | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
const string = (value: unknown): string | undefined => typeof value === "string" && value.trim() ? value : undefined;
const timestamp = (value: unknown): string | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value * 1000).toISOString();
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return undefined;
};
const role = (value: unknown): NormalizedMessage["role"] => {
  const normalized = string(value)?.toLowerCase();
  return normalized === "system" || normalized === "user" || normalized === "assistant" || normalized === "tool" ? normalized : "unknown";
};
const stableId = (...parts: string[]): string => createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 24);

function textContent(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (Array.isArray(value)) {
    const parts = value.flatMap((item) => {
      if (typeof item === "string") return [item];
      const record = object(item);
      return [string(record?.text) ?? string(record?.content) ?? string(record?.input_text) ?? string(record?.output_text)].filter(Boolean) as string[];
    });
    return parts.join("\n").trim() || undefined;
  }
  const record = object(value);
  if (!record) return undefined;
  return textContent(record.parts ?? record.content ?? record.text ?? record.input_text ?? record.output_text);
}

function chatGptMessages(conversation: JsonObject): NormalizedMessage[] {
  const mapping = object(conversation.mapping);
  if (!mapping) return [];
  const currentNode = string(conversation.current_node);
  const orderedIds: string[] = [];
  const seen = new Set<string>();
  let nodeId = currentNode;
  while (nodeId && !seen.has(nodeId)) {
    seen.add(nodeId);
    orderedIds.push(nodeId);
    const node = object(mapping[nodeId]);
    nodeId = string(node?.parent);
  }
  if (!orderedIds.length) orderedIds.push(...Object.keys(mapping));
  orderedIds.reverse();
  const messages: NormalizedMessage[] = [];
  for (const id of orderedIds) {
    const node = object(mapping[id]);
    const message = object(node?.message);
    if (!message) continue;
    const author = object(message.author);
    const content = object(message.content);
    const text = textContent(content?.parts ?? content?.text ?? content);
    if (!text) continue;
    const item: NormalizedMessage = { id: string(message.id) ?? id, role: role(author?.role), content: text };
    const createdAt = timestamp(message.create_time);
    if (createdAt) item.createdAt = createdAt;
    messages.push(item);
  }
  return messages;
}

export class ChatGptExportAdapter implements ProviderSessionAdapter {
  readonly id = "chatgpt";
  async supports(source: SessionSource): Promise<boolean> {
    if (extname(source.path).toLowerCase() !== ".json") return false;
    try {
      const parsed = JSON.parse(await readFile(source.path, "utf8")) as unknown;
      const list = Array.isArray(parsed) ? parsed : Array.isArray(object(parsed)?.conversations) ? object(parsed)?.conversations as unknown[] : [];
      return list.some((item) => Boolean(object(item)?.mapping));
    } catch { return false; }
  }
  async parse(source: SessionSource): Promise<NormalizedSessionArchive[]> {
    const parsed = JSON.parse(await readFile(source.path, "utf8")) as unknown;
    const list = Array.isArray(parsed) ? parsed : Array.isArray(object(parsed)?.conversations) ? object(parsed)?.conversations as unknown[] : [];
    return list.flatMap((item, index) => {
      const conversation = object(item);
      if (!conversation) return [];
      const messages = chatGptMessages(conversation);
      if (!messages.length) return [];
      const externalId = string(conversation.id) ?? string(conversation.conversation_id) ?? String(index);
      const startedAt = timestamp(conversation.create_time) ?? messages[0]?.createdAt ?? new Date(0).toISOString();
      const endedAt = timestamp(conversation.update_time) ?? messages.at(-1)?.createdAt;
      const archive: NormalizedSessionArchive = {
        id: `chatgpt-${stableId(source.projectId, source.path, externalId)}`,
        provider: "chatgpt",
        projectId: source.projectId,
        startedAt,
        messages,
        sourcePath: source.path,
      };
      const title = string(conversation.title);
      if (title) archive.title = title;
      if (endedAt) archive.endedAt = endedAt;
      return [archive];
    });
  }
}

function codexRecordMessage(record: JsonObject): NormalizedMessage | null {
  const payload = object(record.payload) ?? object(record.message) ?? object(record.item) ?? record;
  const nested = object(payload.message) ?? object(payload.item) ?? payload;
  const content = textContent(nested.content ?? nested.text ?? nested.input ?? nested.output);
  if (!content) return null;
  const item: NormalizedMessage = { role: role(nested.role ?? payload.role ?? record.role), content };
  const id = string(nested.id) ?? string(payload.id) ?? string(record.id);
  const createdAt = timestamp(nested.timestamp ?? payload.timestamp ?? record.timestamp ?? record.created_at);
  if (id) item.id = id;
  if (createdAt) item.createdAt = createdAt;
  return item;
}

export class CodexJsonlAdapter implements ProviderSessionAdapter {
  readonly id = "codex";
  supports(source: SessionSource): boolean { return extname(source.path).toLowerCase() === ".jsonl" && source.providerHint === "codex"; }
  async parse(source: SessionSource): Promise<NormalizedSessionArchive[]> {
    const raw = await readFile(source.path, "utf8");
    const messages: NormalizedMessage[] = [];
    let sessionExternalId: string | undefined;
    let model: string | undefined;
    for (const [index, line] of raw.split(/\r?\n/).entries()) {
      if (!line.trim()) continue;
      let record: JsonObject;
      try { record = object(JSON.parse(line)) ?? {}; } catch (error) { throw new Error(`Invalid Codex JSONL at line ${index + 1}`, { cause: error }); }
      sessionExternalId ??= string(record.session_id) ?? string(object(record.payload)?.session_id);
      model ??= string(record.model) ?? string(object(record.payload)?.model);
      const message = codexRecordMessage(record);
      if (message && message.role !== "unknown") messages.push(message);
    }
    if (!messages.length) throw new Error(`No Codex messages found in ${source.path}`);
    const externalId = sessionExternalId ?? stableId(source.path);
    const archive: NormalizedSessionArchive = {
      id: `codex-${stableId(source.projectId, source.path, externalId)}`,
      provider: "codex",
      projectId: source.projectId,
      startedAt: messages[0]?.createdAt ?? new Date(0).toISOString(),
      messages,
      sourcePath: source.path,
    };
    if (model) archive.model = model;
    const endedAt = messages.at(-1)?.createdAt;
    if (endedAt) archive.endedAt = endedAt;
    return [archive];
  }
}
