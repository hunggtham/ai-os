# Durable Memory

Durable memory contains compact information that should remain useful across sessions and AI providers. It is not a chat archive and is not the source of truth for project architecture.

## Memory record

```yaml
schema_version: 1
memory_id: mem_example_001
scope:
  type: user | global | project | repository
  id: ai-os
kind: preference | goal | convention | fact | relationship | constraint
statement: "Project documentation and code use English."
status: proposed | approved | superseded | rejected | deleted
confidence: 1.0
privacy: public | internal | sensitive
valid_from: 2026-08-05T00:00:00+09:00
valid_until: null
created_at: 2026-08-05T00:00:00+09:00
updated_at: 2026-08-05T00:00:00+09:00
provenance:
  source_type: session | document | user_confirmation | import
  source_ref: sessions/ai-os/2026/08/example.md
  excerpt: null
supersedes: null
tags: [documentation, language]
```

## Admission rules

A memory should be stored only when it is:

- likely to be useful in future sessions;
- concise and independently understandable;
- scoped to the correct user or project;
- supported by provenance;
- free of credentials and unnecessary sensitive data.

Do not store:

- full conversations;
- temporary task state that belongs in a todo system;
- generated summaries without provenance;
- secrets or authentication material;
- assumptions presented as confirmed facts;
- architecture decisions that belong in ADRs.

## Lifecycle

1. Extract or manually propose a memory.
2. Deduplicate against active records.
3. Review privacy, scope, confidence, and provenance.
4. Approve, reject, or merge it.
5. Supersede outdated records instead of silently rewriting history.
6. Export all active and historical records in a provider-neutral format.

The runtime memory engine may later be Mem0, OpenMemory, or a custom implementation. This schema remains the canonical boundary so the backend can be replaced.
