# ADR Closure Register

Last reviewed: 2026-08-06

This register is the authoritative v1 decision-status summary. Detailed ADR files and architecture documents must not contradict it.

## Accepted for v1

| Decision | Status | Evidence |
| --- | --- | --- |
| Git and Markdown are the reviewed source of truth | Accepted | Repository structure, contribution workflow, project registry, knowledge and session conventions |
| Local-first runtime under `AI_OS_HOME` | Accepted | Bootstrap, config package, SQLite database, local provider-source registry |
| TypeScript, Node.js 22, and pnpm workspaces | Accepted | Root package metadata, workspace packages, CI runtime |
| SQLite for relational persistence and full-text retrieval | Accepted | Ordered migrations, database package, SQLite FTS session search |
| Provider adapter boundary with normalized archives | Accepted | ChatGPT and Codex/OpenCodex adapters and validation contracts |
| Audited, deterministic, idempotent provider imports | Accepted | Import-run audit history, content hashes, unchanged-source skipping |
| CLI as the trusted v1 mutation boundary | Accepted | Registry, import, source sync, memory lifecycle, backup and restore commands |
| Dashboard and JSON API remain localhost-only and read-only | Accepted | Dashboard implementation and operator documentation |
| MCP remains read-only and uses stdio transport | Accepted | Nine v1 MCP tools, validated schemas, integration and E2E tests |
| Absolute local paths are redacted by default | Accepted | Shared privacy helpers, dashboard/API tests, MCP output policy |
| Backup and validated restore are required operational capabilities | Accepted | WAL checkpoint, `VACUUM INTO`, manifest hashes, integrity checks and recovery smoke |
| CI must exercise clean bootstrap and full E2E operation | Accepted | Clean-machine, backup/restore, and full E2E workflow gates |

## Deferred to post-v1

| Decision area | Status | Reason |
| --- | --- | --- |
| Vector database or embedding provider | Deferred | SQLite FTS satisfies v1 retrieval requirements |
| Automatic memory extraction | Deferred | v1 memory changes require explicit operator action |
| Mem0/OpenMemory integration | Deferred | Current memory service boundary remains portable without external dependency |
| MCP or dashboard write tools | Deferred | Read-only surfaces reduce v1 safety and complexity risk |
| Remote hosting and multi-user access | Deferred | v1 security model is local operator use |
| Authentication, authorization and tenant isolation | Deferred | Required only when network or multi-user deployment is introduced |
| Event bus or distributed queue | Deferred | Current scheduled and synchronous workflows are sufficient for v1 |
| Continuous filesystem watching | Deferred | Explicit and scheduled source synchronization is deterministic and auditable |
| Hosted multi-machine synchronization | Deferred | Git and exportable local artifacts provide v1 portability |

## Closure rules

1. Implemented architecture decisions must be marked `Accepted`, not `Proposed`.
2. A deferred idea must not appear as an active v1 component in architecture diagrams or operator instructions.
3. A future change that contradicts an accepted decision requires a new ADR that marks the earlier decision `Superseded`.
4. `docs/architecture.md`, `docs/PROJECT_STATUS.md`, schemas, migrations, and runtime behavior must remain consistent with this register.
