export type MemoryScope = "user" | "project" | "workspace";
export type MemoryStatus = "active" | "superseded" | "deleted";

export interface DurableMemory {
  id: string;
  scope: MemoryScope;
  subjectId: string;
  kind: string;
  content: string;
  confidence?: number;
  sourceSessionId?: string;
  status: MemoryStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryQuery {
  scope?: MemoryScope;
  subjectId?: string;
  kind?: string;
  status?: MemoryStatus;
  text?: string;
  limit?: number;
}

export interface MemoryRepository {
  get(id: string): Promise<DurableMemory | null>;
  upsert(memory: DurableMemory): Promise<void>;
  search(query: MemoryQuery): Promise<DurableMemory[]>;
  supersede(id: string, replacementId: string, updatedAt: string): Promise<void>;
  delete(id: string, updatedAt: string): Promise<void>;
}

export interface MemoryBackend {
  readonly name: string;
  connect(): Promise<MemoryRepository>;
  healthcheck(): Promise<{ healthy: boolean; detail?: string }>;
}
