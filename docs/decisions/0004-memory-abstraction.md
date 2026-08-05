# ADR-0004: Shared Memory Abstraction

- Status: Proposed
- Date: 2026-08-05

## Decision

Define an AI OS memory contract before selecting Mem0, OpenMemory, or a custom backend.

The domain contract must support:

- create candidate memory;
- approve or reject candidate;
- retrieve by scope and relevance;
- supersede or invalidate memory;
- export all active records;
- preserve provenance and confidence;
- delete by record, subject, project, or retention policy.

The first backend may be a local repository implementation. External memory products must be integrated as adapters and may not become the source of truth.

## Memory scope

Allowed memory categories:

- stable user preferences;
- explicit goals;
- project conventions;
- durable facts;
- entity relationships.

Do not store full conversations, transient task state, secrets, inferred sensitive traits, or unsupported conclusions as durable memory.

## Consequences

- Mem0 or another product can be evaluated without redesigning the platform.
- Memory data remains exportable and auditable.
- Candidate review and provenance add implementation work but reduce incorrect persistent memories.
