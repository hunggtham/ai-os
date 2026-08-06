# Changelog

All notable changes to AI OS are documented in this file.

The format follows Keep a Changelog principles and semantic versioning.

## [1.0.0] - 2026-08-06

### Added

- Local-first AI project registry backed by Git and Markdown.
- SQLite persistence for projects, sessions, messages, memories, import audits, and source synchronization state.
- Full-text session-message search using SQLite FTS.
- Durable-memory lifecycle commands for import, list, invalidate, supersede, and expiry.
- ChatGPT and Codex/OpenCodex provider adapters with deterministic and idempotent imports.
- Versioned configured-source registry with freshness inspection and actionable-only synchronization.
- Stable JSON reports and automation-safe exit codes for unattended source synchronization.
- Localhost-only dashboard and read API.
- Read-only MCP server with project, session, message, search, memory, import-health, source-freshness, and system-status tools.
- Privacy-safe path aliases for dashboard, API, and MCP responses.
- Idempotent bootstrap and clean-machine initialization.
- SQLite-consistent backup, validated restore, and disaster-recovery smoke tests.
- Full clean-machine end-to-end CI gate covering import, search, backup, dashboard, and MCP.
- Source-sync process locking with stale-lock recovery.
- Stale import-run recovery.
- SQLite integrity, ANALYZE, and optional VACUUM maintenance commands.
- CLI, report-contract, and migration version reporting.
- Structured JSON CLI error envelopes.
- Operator, privacy, disaster-recovery, MCP, reliability, installation, upgrade, rollback, and release documentation.

### Security and privacy

- Runtime databases, provider exports, credentials, and private attachments remain outside Git.
- Absolute local paths are redacted by default from read surfaces.
- Raw path exposure requires the explicit local-debugging opt-in `AI_OS_EXPOSE_RAW_PATHS=1`.
- Dashboard and MCP remain read-only in v1.

### Deferred to post-v1

- Remote multi-user hosting and authentication.
- Write-capable dashboard or MCP operations.
- Vector embeddings and semantic search.
- Automatic memory extraction.
- Mem0/OpenMemory integration.
- Continuous filesystem watching.
- Multi-machine synchronization.
