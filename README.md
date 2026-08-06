# AI OS

A local-first, provider-independent control plane for shared AI knowledge, session archives, durable memory, search, provider imports, operational health, and read-only MCP access.

## Status

AI OS is in the **v1 completion and hardening stage**. Bootstrap, local persistence, session search, durable-memory lifecycle, provider imports, configured-source synchronization, dashboard/API privacy, backup/restore, read-only MCP, and full end-to-end CI validation are implemented.

See:

- [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md) for completed work, remaining TODOs, and release progress;
- [`docs/architecture.md`](docs/architecture.md) for the current as-built v1 architecture;
- [`docs/ADR_STATUS.md`](docs/ADR_STATUS.md) for accepted and deferred architecture decisions.

## Core principles

1. Git is the reviewed source of truth.
2. Markdown stores human-readable knowledge and decisions.
3. Session archives preserve complete AI work history.
4. Shared memory stores only durable facts, goals, preferences, and conventions.
5. SQLite FTS provides local v1 retrieval; indexes remain rebuildable data.
6. AI providers are isolated through normalized adapters.
7. CLI is the trusted local mutation boundary.
8. Dashboard/API and MCP are read-only for v1.
9. Secrets, credentials, runtime databases, provider exports, and private attachments must never be committed.

## Repository map

```text
docs/        Architecture, ADR status, conventions, runbooks, and roadmap
projects/    Registry and project templates
knowledge/   Curated reusable knowledge
sessions/    Sanitized, version-controlled AI work-session archives
memory/      Durable memory schemas and export conventions
prompts/     Provider-independent prompts and workflows
adapters/    Provider and tool adapter documentation
mcp/         MCP contracts and integration documentation
apps/        CLI, dashboard/API, and MCP applications
packages/    Shared domain and infrastructure libraries
scripts/     Bootstrap, backup, restore, smoke, and automation scripts
```

Start with `AGENTS.md`, `docs/PROJECT_STATUS.md`, `docs/architecture.md`, `docs/ADR_STATUS.md`, and `docs/operator-guide.md`.
