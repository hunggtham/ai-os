import { readFile } from "node:fs/promises";
import { createValidator, type ValidationResult } from "@ai-os/contracts";

export type MemoryScope = "global" | "user" | "project" | "agent";
export type MemoryStatus = "candidate" | "active" | "superseded" | "invalid" | "deleted";
export type MemoryCategory = "preference" | "goal" | "convention" | "fact" | "relationship";

export interface DurableMemoryRecord {
  schemaVersion: "1.0.0";
  id: string;
  scope: { type: MemoryScope; id: string };
  category: MemoryCategory;
  content: string;
  status: MemoryStatus;
  confidence?: number;
  createdAt: string;
  updatedAt?: string | null;
  expiresAt?: string | null;
  supersedes?: string | null;
  tags?: string[];
  provenance: {
    sourceType: "explicit-user" | "session" | "document" | "system" | "import";
    sourceId: string;
    excerpt?: string | null;
    recordedBy?: string | null;
  };
}

export async function loadAndValidateMemory(
  memoryPath: string,
  schemaPath: string,
): Promise<ValidationResult<DurableMemoryRecord>> {
  const [memoryText, schemaText] = await Promise.all([
    readFile(memoryPath, "utf8"),
    readFile(schemaPath, "utf8"),
  ]);
  const memory = JSON.parse(memoryText) as unknown;
  const schema = JSON.parse(schemaText) as object;
  return createValidator<DurableMemoryRecord>(schema)(memory);
}

export interface MemoryQuery {
  scope?: MemoryScope;
  subjectId?: string;
  category?: MemoryCategory;
  status?: MemoryStatus;
  text?: string;
  limit?: number;
}

export interface MemoryRepository {
  get(id: string): Promise<DurableMemoryRecord | null>;
  upsert(memory: DurableMemoryRecord): Promise<void>;
  search(query: MemoryQuery): Promise<DurableMemoryRecord[]>;
  invalidate(id: string, updatedAt: string): Promise<void>;
}

export interface MemoryBackend {
  readonly name: string;
  connect(): Promise<MemoryRepository>;
  healthcheck(): Promise<{ healthy: boolean; detail?: string }>;
}
