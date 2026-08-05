# AI OS Architecture

## 1. Objective

AI OS provides a shared, portable context layer across multiple AI clients while keeping project knowledge under the owner's control.

It separates four concepts that must not be conflated:

- **Source of truth:** reviewed Git repositories and Markdown documents.
- **Session archive:** complete records of AI-assisted work.
- **Durable memory:** compact facts, goals, preferences, and conventions.
- **Retrieval index:** disposable search infrastructure built from authoritative sources.

## 2. Logical architecture

```text
External project repositories
          │
          ▼
   Project Registry ───────────────┐
          │                        │
          ▼                        ▼
Markdown Knowledge Base      Session Archive
          │                        │
          └──────────┬─────────────┘
                     ▼
             Ingestion pipeline
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
 Search / vector index    Memory extractor
          │                     │
          ▼                     ▼
 Retrieval service       Durable memory store
          └──────────┬──────────┘
                     ▼
              MCP / Core API
                     │
       ┌─────────────┼─────────────┐
       ▼             ▼             ▼
    Codex        Gemini CLI    Claude/OpenCodex/
                                  Ollama/n8n
                     │
                     ▼
                  Dashboard
```

## 3. Component boundaries

### 3.1 Project Registry

Stores metadata and pointers to external projects. It does not duplicate their source code.

Responsibilities:

- project identity and aliases;
- repository and local-path references;
- status, tags, and ownership;
- knowledge and session locations;
- provider-specific configuration references without secrets.

### 3.2 Knowledge Base

Curated Markdown containing architecture, ADRs, conventions, runbooks, and stable project knowledge. Files are human-readable, reviewable, and version-controlled.

### 3.3 Session Archive

Stores complete work records: prompts, responses, tool activity, changed files, commits, decisions, todos, summaries, and metadata. Session files are evidence and history, not automatically authoritative design documentation.

### 3.4 Durable Memory

Stores small, independently reviewable memory records. A memory must have provenance, scope, confidence, lifecycle state, and timestamps. Memory is replaceable infrastructure and must be exportable.

### 3.5 Retrieval and Indexing

Indexes knowledge, sessions, and permitted source files. Indexes are derived data and may be rebuilt at any time. Search results must preserve source references.

### 3.6 MCP / Core API

Exposes provider-neutral capabilities such as:

- list and inspect projects;
- search project context;
- read authoritative documents;
- append session events;
- query and propose memories;
- create tasks or decision proposals.

Write operations must enforce scope, authorization, and audit records.

### 3.7 Provider Adapters

Each AI client adapter translates provider-specific session and tool formats into canonical AI OS contracts. Core domain logic must not import provider SDK types.

## 4. Data authority hierarchy

When sources conflict, use this order:

1. Current reviewed project documentation and ADRs.
2. Current source code and configuration in the project repository.
3. Explicit project conventions in the registry.
4. Approved durable memories.
5. Session summaries.
6. Raw session history.
7. Generated indexes and model inference.

## 5. Privacy model

Data is classified as:

- `public`: safe for public repositories;
- `internal`: normal private project information;
- `sensitive`: personal, company, financial, or infrastructure details;
- `secret`: credentials and cryptographic material.

Secrets must never enter Git, sessions, memory, embeddings, or logs. Sensitive data requires a private repository or local encrypted storage.

## 6. Local-first rule

The initial implementation should run locally and use open, exportable formats. Hosted services may be added behind interfaces, but no authoritative data may exist only in a vendor service.

## 7. Decisions intentionally deferred

The following require ADRs before implementation:

- primary implementation language and framework;
- relational database choice;
- vector index technology;
- Mem0/OpenMemory/custom memory engine selection;
- authentication and authorization model;
- deployment topology;
- event bus or job queue;
- dashboard framework.
