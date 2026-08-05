# ADR-0002: Local-first Storage

- Status: Proposed
- Date: 2026-08-05

## Decision

Use three separate storage classes:

1. Git-tracked Markdown and schemas for authoritative, human-readable project knowledge.
2. A local SQLite database for indexes, derived metadata, job state, and caches.
3. A private runtime data directory for sensitive session payloads, attachments, embeddings, and provider credentials.

SQLite and runtime data are not sources of truth. They must be reproducible from authoritative files where practical.

## Initial paths

```text
repo/
  docs/
  projects/
  schemas/
  sessions/examples/

~/.ai-os/
  config/
  data/ai-os.sqlite
  sessions/
  attachments/
  indexes/
  logs/
```

The runtime root must be configurable with `AI_OS_HOME`.

## Consequences

- The repository remains portable and auditable.
- Sensitive data does not need to be committed.
- Local state can be rebuilt without changing project knowledge.
- Backup policy must cover Git and the private runtime directory separately.
