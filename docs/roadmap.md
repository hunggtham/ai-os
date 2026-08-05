# AI OS Roadmap

## Phase 0 — Foundation

Goal: establish contracts and safety boundaries before implementation.

Deliverables:

- repository operating rules;
- logical architecture and authority hierarchy;
- project registry format;
- canonical session format;
- durable memory format;
- privacy and secret-handling rules;
- initial ADR template and decision backlog;
- definition of Phase 1 acceptance criteria.

Exit criteria:

- all core data types have versioned schemas;
- authoritative versus derived data is explicit;
- no provider SDK appears in core contracts;
- repository privacy is reviewed before real sessions or memories are committed;
- owner approves the initial architecture.

## Phase 1 — Local Core

Goal: create a minimal local command-line system for one project and one AI adapter.

Planned capabilities:

- load and validate project registry;
- create and append canonical session records;
- ingest Markdown and session files;
- lexical search with source references;
- memory proposal, approval, update, and deletion workflow;
- Codex adapter as the first reference adapter;
- local audit log.

No dashboard is required for Phase 1.

## Phase 2 — MCP and Multi-provider Access

Goal: expose core capabilities consistently to AI clients.

Planned capabilities:

- MCP tools for project context and search;
- scoped read/write permissions;
- adapters for OpenCodex, Gemini CLI, Claude Code, and Ollama;
- session import/export commands;
- context-packet generation with token budgets;
- integration tests across adapters.

## Phase 3 — Dashboard and Automation

Goal: provide human oversight and remove repetitive maintenance.

Planned capabilities:

- projects, sessions, memories, tasks, and timeline views;
- memory review queue;
- search interface with provenance;
- automated session summaries;
- ADR and documentation update proposals;
- Git status, commit, and cost metadata;
- n8n-compatible events and workflows.

## Phase 4 — Operations and Scale

Goal: operate reliably across many projects and machines.

Planned capabilities:

- encrypted backup and restore;
- multi-device synchronization;
- role-based authorization;
- background job processing;
- pluggable vector and memory backends;
- observability and retention policies;
- migration and disaster-recovery tooling.

## Decision backlog

Create ADRs before Phase 1 implementation for:

1. core language and runtime;
2. canonical schema validation technology;
3. local metadata database;
4. search strategy for the first release;
5. memory engine approach;
6. MCP server framework;
7. sensitive-data storage model.
