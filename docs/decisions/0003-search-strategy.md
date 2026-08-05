# ADR-0003: Search Strategy

- Status: Proposed
- Date: 2026-08-05

## Decision

Implement search in stages:

1. Metadata filtering and lexical full-text search over normalized records.
2. Hybrid retrieval combining lexical ranking and vector similarity.
3. Optional reranking for high-value queries.

The first implementation uses SQLite metadata plus full-text search. Embeddings are an optional derived index and must be replaceable without changing source files or public contracts.

## Retrieval scope

- project documentation;
- approved session archives;
- durable memories;
- ADRs and conventions;
- selected source-code metadata.

## Guardrails

- Search results must include source references.
- Generated summaries are never treated as authoritative without provenance.
- Sensitive projects can be excluded from indexing.
- Embedding provider and vector store remain behind interfaces.

## Consequences

This approach gives a useful local search baseline before introducing a vector database and prevents early lock-in to an embedding provider.
