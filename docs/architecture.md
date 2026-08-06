# AI OS v1 Architecture

## 1. Objective

AI OS is a local-first, provider-independent control plane for preserving AI work sessions, durable memory, project knowledge, provider imports, search, operational health, and read-only MCP access.

The architecture keeps four concepts separate:

- **Source of truth:** reviewed Git repositories and Markdown documents.
- **Session archive:** complete records of AI-assisted work and imported provider sessions.
- **Durable memory:** compact facts, goals, preferences, and conventions with lifecycle metadata.
- **Retrieval data:** rebuildable SQLite indexes and read models derived from authoritative inputs.

## 2. As-built v1 architecture

```text
Project registry + Markdown + provider exports
                     │
                     ▼
        Validation and provider adapters
                     │
                     ▼
       Audited, idempotent import services
                     │
                     ▼
         Local SQLite database + FTS
          │          │           │
          │          │           └── Import audit and source freshness
          │          └────────────── Durable memory lifecycle
          └───────────────────────── Projects, sessions, messages, search
                     │
          ┌──────────┼───────────┐
          ▼          ▼           ▼
        CLI     Dashboard/API   MCP server
     read/write    read-only     read-only
```

Runtime data defaults to `AI_OS_HOME` and is not committed. Git remains authoritative for reviewed knowledge, decisions, schemas, sanitized fixtures, and session archives intended for version control.

## 3. Component boundaries

### 3.1 Project registry

The YAML project registry stores project identity, status, repository references, and optional local paths. Bootstrap synchronizes registry records into SQLite without copying project source code.

### 3.2 Provider adapters

Provider-specific formats are normalized behind adapter contracts. v1 includes ChatGPT JSON exports and Codex/OpenCodex JSONL-style exports. Core persistence and retrieval code does not depend on provider SDK types.

### 3.3 Configured source synchronization

A versioned YAML source registry defines local provider-export paths. The source service:

- resolves absolute, relative, home-relative, and environment-based paths;
- detects duplicate and disabled sources;
- reports `new`, `changed`, `synced`, `missing`, `disabled`, and `error` states;
- synchronizes only actionable sources unless forced;
- records every import run for audit and health reporting;
- emits stable JSON reports and automation-safe exit codes.

### 3.4 SQLite persistence and retrieval

SQLite is the v1 operational datastore. Ordered migrations create project, session, message, memory, import-audit, and source-related structures. Full-text session search uses local SQLite FTS. The database and indexes are derived operational state and can be restored from validated backups or rebuilt from authoritative inputs.

### 3.5 Session archive

Session records preserve provider, project, model, timestamps, archive/source provenance, hashes, and normalized messages. Imports are deterministic and idempotent. Unchanged successful sources are skipped unless a force rebuild is requested.

### 3.6 Durable memory

Durable memories are small records with scope, subject, category, content, confidence, provenance, lifecycle state, timestamps, expiry, and supersession metadata. v1 mutation operations remain on the CLI boundary: import, invalidate, supersede, and expire. Read access is available through the database service and MCP.

### 3.7 CLI

The CLI is the trusted local mutation boundary for v1. It performs migrations, registry synchronization, imports, configured-source operations, memory lifecycle changes, and search. Scheduled source synchronization uses a dedicated automation-safe command and report contract.

### 3.8 Dashboard and JSON API

The dashboard/API is localhost-only and read-only. It exposes projects, sessions, messages, search, import history, import health, and source freshness. Absolute local paths are redacted by default as `<repo>/...`, `~/...`, or `<local>/filename`. Raw paths require explicit local opt-in through `AI_OS_EXPOSE_RAW_PATHS=1`.

### 3.9 MCP server

The v1 MCP server communicates over stdio and is strictly read-only. It exposes tools for projects, sessions, paginated messages, full-text search, durable memories, import health, source freshness, and system status. Inputs are validated, list operations use bounded pagination, and path output follows the same privacy rules as the dashboard.

### 3.10 Operations

Operational controls include:

- idempotent bootstrap into a clean `AI_OS_HOME`;
- CI build, type-check, test, clean-bootstrap, backup/restore, and full E2E gates;
- SQLite-consistent backup using WAL checkpoint and `VACUUM INTO`;
- versioned manifests with file size and SHA-256 validation;
- validated restore with overwrite protection and `integrity_check`;
- disaster-recovery and MCP operator runbooks.

## 4. Data authority hierarchy

When sources conflict, use this order:

1. Accepted ADRs and current reviewed project documentation.
2. Current source code, migrations, schemas, and configuration.
3. Explicit project registry conventions.
4. Active durable memories with provenance.
5. Session summaries.
6. Raw session history.
7. Generated indexes and model inference.

## 5. Privacy and security boundary

Secrets, credentials, cryptographic material, and private attachments must not enter Git, committed sessions, memory exports, fixtures, or logs. Machine-local databases, provider exports, backups, and source registries remain outside version control. Read surfaces redact absolute paths by default.

The v1 services are local operator tools, not multi-user network services. Remote hosting, authentication, authorization, tenant isolation, and externally accessible APIs are outside the v1 security model.

## 6. Accepted v1 decisions

- Git and Markdown remain the reviewed source of truth.
- TypeScript on Node.js 22 with pnpm workspaces is the implementation platform.
- SQLite is the local relational datastore and full-text retrieval engine.
- Provider formats are isolated through adapters and normalized contracts.
- CLI is the local mutation boundary.
- Dashboard/API and MCP are read-only for v1.
- MCP uses stdio transport and stable validated schemas.
- Absolute local paths are redacted unless explicitly exposed for local debugging.
- Runtime data lives under configurable `AI_OS_HOME` and is excluded from Git.
- Backup and restore are first-class operational requirements.

## 7. Deferred post-v1 decisions

The following are explicitly not part of v1 and require new ADRs before implementation:

- vector embeddings and semantic retrieval;
- automated memory extraction from sessions;
- external Mem0/OpenMemory integration;
- MCP or dashboard mutation operations;
- remote or multi-user hosting;
- authentication, authorization, and tenant isolation;
- continuous filesystem watching;
- event bus or distributed job queue;
- hosted multi-machine synchronization;
- mobile clients and plugin marketplaces.
