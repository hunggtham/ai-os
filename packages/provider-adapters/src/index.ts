export type ProviderId =
  | "chatgpt"
  | "codex"
  | "opencodex"
  | "gemini"
  | "claude"
  | "ollama"
  | string;

export interface NormalizedMessage {
  id?: string;
  role: "system" | "user" | "assistant" | "tool" | "unknown";
  content: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

export interface NormalizedSessionArchive {
  id: string;
  provider: ProviderId;
  projectId: string;
  model?: string;
  title?: string;
  startedAt: string;
  endedAt?: string;
  messages: NormalizedMessage[];
  sourcePath: string;
  metadata?: Record<string, unknown>;
}

export interface SessionSource {
  path: string;
  format?: string;
  providerHint?: ProviderId;
  projectId: string;
}

export interface ProviderSessionAdapter {
  readonly id: ProviderId;
  supports(source: SessionSource): Promise<boolean> | boolean;
  parse(source: SessionSource): Promise<NormalizedSessionArchive[]>;
}

export class AdapterRegistry {
  readonly #adapters = new Map<ProviderId, ProviderSessionAdapter>();

  register(adapter: ProviderSessionAdapter): void {
    if (this.#adapters.has(adapter.id)) {
      throw new Error(`Provider adapter already registered: ${adapter.id}`);
    }
    this.#adapters.set(adapter.id, adapter);
  }

  list(): ProviderSessionAdapter[] {
    return [...this.#adapters.values()];
  }

  async resolve(source: SessionSource): Promise<ProviderSessionAdapter> {
    if (source.providerHint) {
      const hinted = this.#adapters.get(source.providerHint);
      if (hinted && await hinted.supports(source)) return hinted;
    }

    for (const adapter of this.#adapters.values()) {
      if (await adapter.supports(source)) return adapter;
    }
    throw new Error(`No provider adapter supports ${source.path}`);
  }
}
