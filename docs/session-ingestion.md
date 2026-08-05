# Session archive ingestion

Phase 2 introduces a provider-neutral ingestion boundary for archived AI sessions.

## Supported source formats

### Markdown

Messages are separated by role headings:

```markdown
### user
Explain the architecture.

### assistant
The architecture uses Git as the source of truth.
```

Supported role headings are `system`, `user`, `assistant`, and `tool`.

### JSONL

Each non-empty line is an independent JSON object:

```json
{"role":"user","content":"Explain the architecture.","createdAt":"2026-08-05T09:00:00Z"}
{"role":"assistant","content":"The architecture uses Git as the source of truth."}
```

The parser accepts `content` or `text`, and `createdAt` or `timestamp`.

## Normalized contract

All provider adapters produce a `NormalizedSessionArchive` containing:

- session and project identifiers;
- provider and optional model metadata;
- start/end timestamps;
- normalized messages;
- the original source path;
- optional provider-specific metadata.

Provider-specific exporters must implement `ProviderSessionAdapter`. The ingestion layer does not depend on ChatGPT, Codex, Gemini, Claude, Ollama, or any other provider SDK.

## Current boundary

This phase parses archives into normalized in-memory records. Persistence of message-level content and lexical indexing will be added after the normalized contract and CI are stable.
