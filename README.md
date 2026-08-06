# AI OS

A local-first, provider-independent control plane for shared AI knowledge, session archives, durable memory, search, provider imports, operational health, and read-only MCP access.

## Status

AI OS v1 is in final release validation. Bootstrap, persistence, search, durable-memory lifecycle, provider imports, configured-source synchronization, dashboard/API privacy, backup/restore, read-only MCP, reliability controls, and full end-to-end CI validation are implemented.

Authoritative references:

- [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md) — completion state and remaining release actions;
- [`docs/architecture.md`](docs/architecture.md) — current as-built architecture;
- [`docs/ADR_STATUS.md`](docs/ADR_STATUS.md) — accepted and deferred decisions;
- [`docs/installation.md`](docs/installation.md) — clean installation and first startup;
- [`docs/upgrade-rollback.md`](docs/upgrade-rollback.md) — safe upgrade and rollback procedure;
- [`docs/release-checklist.md`](docs/release-checklist.md) — final validation and tagging checklist;
- [`CHANGELOG.md`](CHANGELOG.md) — v1 capability and change summary.

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

## Quick start

```bash
git clone https://github.com/hunggtham/ai-os.git
cd ai-os
pnpm install --frozen-lockfile
pnpm bootstrap
pnpm smoke:e2e
```

For release installations, check out `v1.0.0` before installing dependencies. See the installation guide for runtime configuration and operational validation.

## Repository map

```text
docs/        Architecture, ADR status, installation, operations, recovery, and release guides
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
demo/        Synthetic provider fixture and source registry for safe validation
```

Start with `AGENTS.md`, `docs/installation.md`, `docs/operator-guide.md`, and `docs/PROJECT_STATUS.md`.
