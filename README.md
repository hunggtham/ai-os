# AI OS

A local-first, provider-independent control plane for shared AI knowledge, session archives, durable memory, search, and workflows.

## Status

AI OS is in the **v1 completion and hardening stage**. Foundation, local persistence, session search, provider imports, import audit, configured source synchronization, freshness inspection, the read-only dashboard, actionable-only sync, and JSON automation reports are implemented.

See [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md) for the authoritative completed-work inventory, definition of done, remaining TODOs, and accelerated delivery sequence.

## Core principles

1. Git is the source of truth.
2. Markdown stores human-readable knowledge and decisions.
3. Session archives preserve full AI interactions and work history.
4. Shared memory stores only durable facts, goals, preferences, and conventions.
5. Search retrieves detailed context; memory does not replace documentation.
6. AI providers are connected through adapters and MCP-compatible interfaces.
7. Secrets, credentials, runtime databases, and private attachments must never be committed.

## Initial scope

- Knowledge base conventions
- Session archive format
- Shared-memory abstraction
- Project registry
- Search and indexing design
- MCP boundary
- Provider adapter contract
- Dashboard and automation roadmap

## Repository map

```text
docs/        Architecture, ADRs, conventions, status, and roadmap
projects/    Registry and project templates
knowledge/   Curated reusable knowledge
sessions/    Full AI work-session archives
memory/      Durable memory schema and exports
prompts/     Provider-independent prompts and workflows
adapters/    AI provider and tool adapters
mcp/         MCP server and tool contracts
apps/        Dashboard and API applications
packages/    Shared libraries
scripts/     Maintenance and automation scripts
```

Start with `AGENTS.md`, `docs/PROJECT_STATUS.md`, `docs/architecture.md`, and `docs/roadmap.md`.
