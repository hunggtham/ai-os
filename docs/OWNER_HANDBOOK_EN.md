# AI OS — Project Owner Handbook (English)

> Purpose: this document is the practical, owner-level guide to AI OS v1.0.0. It explains what the system is, why it exists, how the source code is organized, how data flows through it, how to operate and debug it, how to explain it to another engineer, and what must remain true as the project evolves.
>
> Baseline covered: `main` release candidate ending at commit `dc26a31f8383d94cf59edca597d0d80645e5a543`, with the working review branch `review/open-code-review-v1.0.0` created from that baseline.

---

## 1. What AI OS is

AI OS is a **local-first, provider-independent control plane for AI work**.

Its job is not to replace ChatGPT, Codex, Claude Code, Gemini CLI, Ollama, or other AI tools. Its job is to sit above them and provide a stable layer for:

- project identity and project metadata;
- reusable project knowledge;
- archived AI sessions;
- normalized imports from external AI providers;
- durable shared memory;
- local search;
- import health and source freshness;
- backup and disaster recovery;
- a read-only dashboard/API;
- read-only MCP access for AI agents and tools.

The core architectural idea is:

```text
AI providers change.
Project knowledge should not.
Session history should not disappear.
Durable memory should not belong to one vendor.
```

AI OS therefore separates provider-specific data from owner-controlled project data.

---

## 2. The problem the project solves

Without AI OS, work is fragmented:

```text
ChatGPT       -> its own conversations
Codex         -> its own sessions
OpenCodex     -> its own sessions
Claude Code   -> its own sessions
Gemini CLI    -> its own sessions
Ollama        -> local conversations
n8n           -> workflow state
GitHub        -> source code only
```

Each tool knows only part of the project. Switching tool usually means losing context or manually copying it.

AI OS introduces a shared control plane:

```text
Git + Markdown              reviewed truth
        │
        ├── project registry
        ├── architecture / decisions
        ├── curated knowledge
        └── sanitized session archives
        │
        ▼
Provider adapters + import services
        │
        ▼
SQLite + FTS + durable memory + audit state
        │
        ├── CLI              read/write operator boundary
        ├── Dashboard/API    read-only
        └── MCP              read-only AI/tool access
```

The result is that providers become replaceable clients instead of the owners of project knowledge.

---

## 3. Non-negotiable design principles

As project owner, these are the rules you should protect.

### 3.1 Git and reviewed Markdown are the source of truth

Git stores reviewed, human-readable knowledge and decisions. SQLite is operational state, not the final authority for project truth.

### 3.2 Session history and durable memory are different things

A **session archive** stores complete work history.

A **durable memory** stores only compact facts that should survive across sessions, for example:

- project conventions;
- important decisions;
- stable goals;
- reusable preferences;
- durable facts with provenance.

Do not turn durable memory into a transcript database.

### 3.3 Provider-specific formats stay behind adapters

Core code should not depend on ChatGPT export shapes, Codex JSONL details, or future provider SDK types. Provider formats are normalized before persistence.

### 3.4 Local-first by default

The v1 trust model assumes a local operator machine. Runtime data is local, services bind locally, and no multi-user security model is claimed.

### 3.5 CLI is the trusted mutation boundary

The v1 CLI performs write operations. Dashboard/API and MCP remain read-only.

This deliberately reduces the attack surface and prevents an AI agent from silently mutating important state through MCP.

### 3.6 Secrets and private runtime data do not belong in Git

Never commit:

- API keys;
- OAuth tokens;
- private keys;
- raw private provider exports;
- personal attachments;
- local SQLite databases;
- local backup archives;
- sensitive absolute-path information unless intentionally sanitized.

---

## 4. Technology stack

The implementation baseline is intentionally small and portable:

| Area | Technology |
| --- | --- |
| Runtime | Node.js 22+ |
| Language | TypeScript |
| Workspace | pnpm 10.14.0 workspaces |
| Database | SQLite through Node's `node:sqlite` API |
| Search | SQLite FTS |
| Configuration | YAML / environment variables |
| Dashboard | Node HTTP server + simple browser UI |
| MCP transport | stdio |
| CI | GitHub Actions |
| Source of truth | Git + Markdown |

The root workspace includes `apps/*` and `packages/*`.

Root commands are defined in `package.json`.

Important commands:

```bash
pnpm build
pnpm check
pnpm test
pnpm bootstrap
pnpm backup
pnpm restore
pnpm smoke:clean
pnpm smoke:backup-restore
pnpm smoke:e2e
pnpm smoke:demo
```

---

## 5. Repository structure

```text
ai-os/
├── apps/
│   ├── cli/
│   ├── dashboard-api/
│   └── mcp/
├── packages/
│   ├── archive-ingest/
│   ├── batch-ingest/
│   ├── config/
│   ├── database/
│   ├── import-sources/
│   ├── memory-core/
│   ├── project-registry/
│   ├── provider-adapters/
│   ├── provider-import/
│   ├── session-core/
│   └── session-store/
├── docs/
├── projects/
├── knowledge/
├── sessions/
├── memory/
├── prompts/
├── adapters/
├── mcp/
├── scripts/
├── demo/
├── schemas/
├── AGENTS.md
├── README.md
├── CHANGELOG.md
├── package.json
└── pnpm-workspace.yaml
```

The exact set can evolve, but the important boundary is:

```text
apps = executable interfaces
packages = reusable domain/infrastructure logic
scripts = operational workflows
Git/Markdown folders = reviewed project knowledge
runtime state = outside Git
```

---

## 6. Project registry

File:

```text
projects/registry.yaml
```

The registry is the identity layer for projects controlled by AI OS.

The AI OS project currently contains information such as:

```yaml
id: ai-os
name: AI OS
status: active
type: platform
repository:
  provider: github
  full_name: hunggtham/ai-os
  default_branch: main
knowledge_paths:
  - docs
  - knowledge
session_root: sessions/ai-os
memory_scope: ai-os
```

The registry may also describe adapters such as Codex, OpenCodex, ChatGPT, Gemini CLI, Claude Code, and Ollama.

### Why the registry exists

Provider sessions often contain only a filesystem path or provider-local project identifier. AI OS needs a stable project ID independent of machine and provider.

The registry provides this stable identity.

### Runtime behavior

The CLI can validate and synchronize the registry into SQLite. It does **not** copy the project source code into the database.

---

## 7. Configuration and `AI_OS_HOME`

Runtime data is separated from the repository.

The important concept is:

```text
AI_OS_HOME
```

It acts as the root of machine-local runtime state.

Typical runtime contents include:

```text
$AI_OS_HOME/
├── data/
│   └── ai-os.sqlite
├── locks/
│   └── source-sync.lock
└── other local operational state
```

The database path can be configured independently through environment configuration.

### Why this matters

You can:

- clone the repository cleanly;
- recreate local state;
- test in a temporary `AI_OS_HOME`;
- keep private provider exports outside Git;
- run clean-machine smoke tests without touching real user state.

---

## 8. Database layer

Package:

```text
packages/database/
```

This package owns the SQLite connection, ordered migrations, and core relational operations.

The database stores operational records for:

- projects;
- sessions;
- session metadata;
- durable memories;
- import runs;
- source synchronization state;
- schema migration history.

Session messages and FTS data are managed with the session-store layer.

### Important database behavior

When opening the database, AI OS enables:

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
```

WAL improves local reliability and concurrency characteristics.

### Migrations

Migrations live under:

```text
packages/database/migrations/
```

`runMigrations()`:

1. creates/uses `schema_migrations`;
2. discovers ordered SQL migration files;
3. skips already applied versions;
4. applies each migration inside `BEGIN IMMEDIATE` / `COMMIT`;
5. rolls back on migration failure.

### Maintenance

The database maintenance flow supports:

```text
PRAGMA integrity_check
ANALYZE
optional WAL checkpoint
optional VACUUM
```

CLI command:

```bash
ai-os db:maintain
ai-os db:maintain --vacuum
```

Run a backup before an intentional VACUUM in important environments.

---

## 9. Session model

A normalized session stores fields conceptually like:

```text
id
projectId
provider
model
startedAt
endedAt
archivePath
contentHash
messages[]
```

Messages contain:

```text
role
content
createdAt
metadata
```

### Session IDs

Provider adapters create stable normalized session identities. The goal is deterministic imports rather than creating duplicate sessions every time the same export is processed.

### Session provenance

AI OS preserves where a session came from through archive/source paths and hashes.

---

## 10. Provider adapters

Package:

```text
packages/provider-adapters/
```

The important abstraction is a provider adapter with behavior equivalent to:

```text
supports(source)
parse(source) -> NormalizedSessionArchive[]
```

The registry selects the correct adapter for a source.

### ChatGPT adapter

The ChatGPT adapter handles JSON conversation exports. It:

- reads conversation mappings;
- walks the active parent chain when available;
- extracts user/assistant/system/tool messages;
- normalizes timestamps;
- generates deterministic session IDs;
- returns normalized archives.

### Codex adapter

The Codex adapter handles `.jsonl` with provider hint `codex`.

It:

- reads JSONL line by line;
- extracts nested payload/message/item forms;
- extracts role/content/timestamp/model/session ID where available;
- rejects invalid JSONL with line information;
- creates one normalized archive for the file.

OpenCodex-compatible exports can use the same normalized provider-import path where the file shape is compatible.

### Why this package matters

When adding another provider, the safest design is usually:

```text
new provider format
        ↓
new adapter
        ↓
NormalizedSessionArchive
        ↓
existing validation/import/database/search code
```

Do not add provider-specific fields directly into every downstream package unless there is a strong architecture reason.

---

## 11. Provider import service

Package:

```text
packages/provider-import/
```

This is the audited provider-export ingestion service.

High-level flow:

```text
provider export file
      ↓
SHA-256 content hash
      ↓
adapter resolution
      ↓
parse + validation
      ↓
import run = running
      ↓
atomic session/message persistence
      ↓
import run = succeeded
```

### Idempotency

If the same source path, project, provider, and content hash already has a successful import, AI OS can create a skipped audit run instead of reimporting it.

Force mode bypasses this optimization.

### Atomic imports

A critical release-hardening change made provider imports transactional across the entire parsed batch.

This prevents this failure mode:

```text
session 1 written
session 2 written
session 3 fails
=> database contains partial import
```

The expected behavior is now:

```text
all sessions succeed -> COMMIT
any session fails    -> ROLLBACK batch
```

The import audit record is then marked failed outside the rolled-back content transaction.

### Import run audit

Import runs include operational information such as:

```text
run ID
source path
project ID
provider
content hash
status
session count
message count
error message
start time
finish time
```

Statuses include `running`, `succeeded`, `failed`, and `skipped`.

### Stale import recovery

The CLI can recover import runs left in `running` after an interrupted process:

```bash
ai-os provider:imports:recover
ai-os provider:imports:recover 120
```

The number is an age in minutes.

---

## 12. Configured provider sources

Package:

```text
packages/import-sources/
```

AI OS can keep a versioned source registry describing provider export locations.

The source layer is responsible for:

- loading the registry;
- resolving local paths;
- supporting repository-relative, absolute, home-relative, and environment-based source locations;
- detecting missing files;
- recognizing changed vs already-synced data;
- skipping disabled sources;
- synchronizing actionable sources;
- reporting source freshness.

Important source states:

```text
new
changed
synced
missing
disabled
error
```

This allows automation to answer:

```text
"Which provider exports actually need to be reimported?"
```

instead of blindly importing everything every time.

---

## 13. Source synchronization process lock

File:

```text
apps/cli/src/process-lock.ts
```

Scheduled source sync must not run twice at the same time.

Lock path:

```text
$AI_OS_HOME/locks/source-sync.lock
```

The lock uses atomic file creation (`wx`) and stores owner metadata.

The release-hardened version protects against a subtle race:

```text
process A owns lock
lock looks old
process B replaces stale lock
process A later exits
process A must NOT delete B's lock
```

The implementation therefore uses an owner token and verifies ownership before release.

It also avoids reclaiming an old lock merely because its timestamp is old when the recorded PID is still alive.

This is important for unattended automation through cron, launchd, systemd, or n8n.

---

## 14. Session store and full-text search

Package:

```text
packages/session-store/
```

Responsibilities:

- replace messages for a session;
- maintain message FTS records;
- list normalized session messages;
- search session content using SQLite FTS.

### Message replacement

Standalone replacement is transactional.

A lower-level transaction-aware function is also available so the provider-import service can include message replacement inside its larger batch transaction.

### Search

Search uses SQLite FTS and `bm25(...)` ranking.

Conceptually:

```sql
FTS MATCH query
ORDER BY bm25 rank
LIMIT ? OFFSET ?
```

Project filtering joins the sessions table.

### Pagination hardening

The read layer now sends `LIMIT/OFFSET` to SQLite instead of loading the first N records and slicing in memory.

This fixes incorrect empty pages at offsets beyond previous hard caps.

---

## 15. Durable memory

Packages and assets:

```text
packages/memory-core/
memory/
schemas/memory.schema.json
```

Durable memory is intentionally smaller than session history.

A memory conceptually contains:

```text
id
scope
subject
category/kind
content
confidence
provenance
status
createdAt
updatedAt
expiresAt
supersession metadata
```

### Lifecycle operations

CLI supports operations such as:

```text
import
list
invalidate
supersede
expire
```

The lifecycle exists because memory should not be treated as permanently correct.

For example:

```text
old convention -> superseded
temporary fact -> expires
incorrect fact -> invalidated
new durable fact -> active
```

### Owner rule

Do not store every chat message as durable memory. Store only information that another future session truly needs.

---

## 16. CLI application

Application:

```text
apps/cli/
```

The CLI is the main trusted operator interface.

Package/runtime version is aligned to:

```text
1.0.0
```

Report contract version:

```text
1
```

Important commands include:

```bash
ai-os version
ai-os doctor
ai-os db:migrate
ai-os db:maintain

ai-os registry:validate
ai-os registry:sync

ai-os session:validate
ai-os session:import

ai-os archive:import
ai-os archive:import-dir
ai-os archive:search

ai-os provider:import
ai-os provider:imports
ai-os provider:imports:recover

ai-os provider:sources:validate
ai-os provider:sources:status
ai-os provider:sources:sync

ai-os memory:import
ai-os memory:list
ai-os memory:invalidate
ai-os memory:supersede
ai-os memory:expire
```

### Structured errors

CLI errors use a machine-readable JSON envelope similar to:

```json
{
  "ok": false,
  "error": {
    "code": "AI_OS_CLI_ERROR",
    "message": "...",
    "command": "..."
  },
  "contractVersion": "1"
}
```

This matters for automation because scripts should not parse arbitrary human stderr text.

---

## 17. Dashboard and JSON API

Application:

```text
apps/dashboard-api/
```

The dashboard is intentionally simple. It is a local read-only operator view, not a production web platform.

Default intent:

```text
localhost only
read-only
no authentication claim
```

It exposes views/endpoints for:

- system counts/status;
- projects;
- sessions;
- session messages;
- session search;
- import run history;
- import summary;
- source freshness.

### Why read-only

The dashboard can safely be used for inspection without becoming another write boundary that must implement authorization, concurrency rules, validation, and audit semantics.

---

## 18. Privacy-safe path redaction

Absolute local filesystem paths can reveal usernames, machine layout, private directories, or source locations.

Dashboard/API and MCP therefore redact paths by default.

Examples:

```text
/repo-root/config/file.yaml
=> <repo>/config/file.yaml

/Users/name/.codex/session.jsonl
=> ~/.codex/session.jsonl

/private/provider/export.json
=> <local>/export.json
```

Windows absolute paths are also handled.

The hardening pass also redacts **absolute paths embedded inside error messages**, not only fields named `path`.

Raw path exposure requires explicit opt-in:

```bash
AI_OS_EXPOSE_RAW_PATHS=1
```

Use this only for trusted local debugging.

---

## 19. MCP server

Application:

```text
apps/mcp/
```

The MCP server uses stdio and is read-only.

Its read layer exposes capabilities equivalent to:

```text
listProjects
listSessions
getSession
listMessages
searchMessages
listMemories
importHealth
sourceFreshness
systemStatus
```

Corresponding MCP tools include:

```text
list_projects
list_sessions
get_session
list_session_messages
search_session_messages
list_memories
get_import_health
inspect_source_freshness
get_system_status
```

### Why MCP matters

This is the main bridge that allows compatible AI clients to query AI OS without giving them direct database access.

Example future agent flow:

```text
Agent starts task
   ↓
MCP: list project/session/memory/search data
   ↓
Agent receives relevant project context
   ↓
Agent works in Codex/Claude/Gemini/etc.
```

### v1 safety boundary

MCP is read-only. There are deliberately no tools such as:

```text
write_memory
modify_project
delete_session
run_import
```

These would require a new security/authorization design and ADR.

---

## 20. Backup

Script:

```text
scripts/backup.mjs
```

Backup is a first-class feature, not an afterthought.

The important objectives are:

- obtain a SQLite-consistent snapshot;
- avoid copying an inconsistent live WAL database directly;
- record metadata in a manifest;
- allow later restore validation.

The implementation uses SQLite-aware behavior including checkpointing and `VACUUM INTO`-style snapshot creation.

A backup manifest records file information such as:

```text
role
name
byte size
SHA-256
```

Potential local source configuration can be included when appropriate.

Root command:

```bash
pnpm backup
```

---

## 21. Restore and disaster recovery

Script:

```text
scripts/restore.mjs
```

Restore validates before replacing runtime state.

Important protections include:

1. supported manifest contract validation;
2. required database entry validation;
3. safe filename validation;
4. path traversal rejection such as `../...`;
5. byte-size verification;
6. SHA-256 verification for every manifest file;
7. existing target protection unless `--force` is used;
8. restore to a temporary database path first;
9. SQLite `integrity_check` before final rename.

### Why path traversal validation exists

Without it, a malicious or corrupted manifest could try to resolve a filename outside the backup directory.

Example forbidden entry:

```text
../some-private-file
```

### Smoke validation

`smoke:backup-restore` verifies normal round-trip restore and hardened failure cases such as tampered content or unsafe manifest entries.

---

## 22. Bootstrap

Script:

```text
scripts/bootstrap.mjs
```

Bootstrap is designed to make a clean installation reproducible.

Typical flow:

```text
clean repository checkout
      ↓
pnpm install
      ↓
build workspace
      ↓
create runtime directories
      ↓
run database migrations
      ↓
load/sync project registry
      ↓
ready local AI OS runtime
```

Root command:

```bash
pnpm bootstrap
```

A good owner rule is: if the project cannot be recreated from a clean checkout plus documented local configuration, too much undocumented state has leaked into the system.

---

## 23. Smoke tests and CI

Workflow:

```text
.github/workflows/ci.yml
```

CI runs on pull requests and pushes to `main`.

The validation job runs:

```bash
pnpm install --no-frozen-lockfile
pnpm check
pnpm build
pnpm test
pnpm smoke:clean
pnpm smoke:backup-restore
pnpm smoke:e2e
pnpm smoke:demo
```

### What each gate proves

#### `pnpm check`

Type/build-level static correctness across workspace packages.

#### `pnpm build`

All applications/packages compile.

#### `pnpm test`

Unit and integration tests, including release hardening regressions.

#### `pnpm smoke:clean`

A fresh runtime can bootstrap successfully.

#### `pnpm smoke:backup-restore`

Backup and restore work and integrity protections hold.

#### `pnpm smoke:e2e`

A temporary AI OS environment runs the complete important path:

```text
bootstrap
→ provider import
→ search
→ backup
→ dashboard
→ MCP
→ verify state
```

#### `pnpm smoke:demo`

The sanitized example provider workspace can be imported and searched successfully.

---

## 24. Demo workspace

Directory:

```text
demo/
```

The demo contains synthetic, non-private provider data.

Its purpose is to let a developer prove the system works without using real conversations.

Expected demo flow:

```text
bootstrap temp AI_OS_HOME
→ source state = new
→ import synthetic Codex fixture
→ search known demo marker
→ source state = synced
```

Use the demo when explaining AI OS to another developer because it demonstrates the real ingestion path without exposing private data.

---

## 25. Release-hardening changes after code review

A pre-tag review identified several real correctness issues. They are important for an owner to understand because they show where system risk exists.

### 25.1 Process-lock ownership race

Risk:

```text
old process could delete replacement process's lock
```

Fix:

```text
owner token + live PID/stale validation + ownership check on release
```

### 25.2 Partial provider imports

Risk:

```text
failed batch could leave some sessions persisted
```

Fix:

```text
one database transaction for the entire parsed import batch
```

### 25.3 Absolute paths in error text

Risk:

```text
privacy layer redacted path fields but not paths embedded in errorMessage
```

Fix:

```text
embedded POSIX/Windows path sanitization on read surfaces
```

### 25.4 Pagination beyond hard caps

Risk:

```text
read first 500 records then slice offset 600 => empty result
```

Fix:

```text
SQL-backed LIMIT/OFFSET pagination + deterministic ordering
```

### 25.5 Restore manifest validation

Risk:

```text
config not fully checksum-validated and manifest filename could escape backup directory
```

Fix:

```text
validate all manifest files + size + SHA-256 + safe resolved path before runtime write
```

These are useful examples when explaining why AI OS uses layered validation and CI smoke gates.

---

## 26. Installation — owner quick path

Minimum expected environment:

```text
Node.js >= 22
pnpm 10.14.0
Git
```

Typical setup:

```bash
git clone https://github.com/hunggtham/ai-os.git
cd ai-os
pnpm install --frozen-lockfile
pnpm bootstrap
pnpm smoke:e2e
```

For release use, check out the intended release tag once the tag exists.

Read:

```text
docs/installation.md
docs/operator-guide.md
docs/reliability-operations.md
docs/upgrade-rollback.md
docs/release-checklist.md
```

---

## 27. Daily operator workflow

A practical day-to-day sequence is:

```bash
# inspect health/version
pnpm --filter @ai-os/cli exec node dist/index.js version

# inspect configured provider sources
pnpm provider:sources:status

# sync actionable sources through the automation-safe path
pnpm --filter @ai-os/cli source:sync-actionable

# search imported session content
pnpm --filter @ai-os/cli exec node dist/index.js archive:search "query"

# inspect dashboard
pnpm dev:api

# expose MCP to a compatible client
pnpm dev:mcp
```

Exact local commands may depend on whether workspace packages have already been built.

---

## 28. How to explain AI OS to another engineer in 60 seconds

Use this explanation:

> AI OS is a local-first control plane that makes AI work portable across providers. Git and Markdown hold reviewed project truth. Provider exports such as ChatGPT JSON or Codex JSONL are normalized through adapters and imported into SQLite. SQLite stores operational project/session/memory state and FTS search. The CLI is the trusted write boundary, while the dashboard and MCP are read-only. Runtime data stays outside Git, absolute local paths are redacted, imports are audited and transactional, and the whole workflow is protected by clean-machine, backup/restore, E2E, and demo CI tests.

---

## 29. How to explain the data flow in one diagram

```text
                REVIEWED / PORTABLE
┌────────────────────────────────────────────┐
│ Git repository                             │
│  projects/  docs/  knowledge/ sessions/   │
│  schemas/   prompts/ decisions             │
└───────────────────────┬────────────────────┘
                        │
                        │ project identity / rules
                        ▼
┌────────────────────────────────────────────┐
│ External AI provider exports               │
│ ChatGPT JSON / Codex JSONL / future        │
└───────────────────────┬────────────────────┘
                        ▼
              Provider adapter registry
                        ▼
                 normalization
                        ▼
                   validation
                        ▼
              audited atomic import
                        ▼
┌────────────────────────────────────────────┐
│ Local SQLite runtime                       │
│ projects / sessions / messages / FTS       │
│ memories / imports / source state          │
└──────────────┬──────────────┬──────────────┘
               │              │
        mutation via CLI      │ read
               │        ┌─────┴─────┐
               │        ▼           ▼
               │   Dashboard/API    MCP
               │      read-only   read-only
               │
               └── backup / restore / maintenance
```

---

## 30. Debugging map

When something fails, use this order.

### Provider file is not importing

Check:

```text
1. provider source exists
2. provider hint is correct
3. adapter supports extension/shape
4. parser validation error
5. project ID exists in registry/database
6. import_runs audit row
7. CLI structured error
```

### Search returns nothing

Check:

```text
1. import succeeded
2. session exists
3. session messages exist
4. FTS rows exist
5. query syntax/content
6. project filter
7. limit/offset
```

### Source sync says already synced

Check content hash and previous successful import. Use force only when a rebuild is actually intended.

### Source sync refuses to run

Inspect:

```text
$AI_OS_HOME/locks/source-sync.lock
```

Do not manually delete a lock until you know the owning process is dead.

### Restore fails

Treat failure as protection, not inconvenience. Check:

```text
manifest contract
file names
SHA-256
byte sizes
SQLite integrity
existing target / --force behavior
```

### MCP cannot see data

Check:

```text
same AI_OS_HOME/database configuration
migrations completed
MCP stdio process starts
client initialization succeeds
tool input validation
privacy aliases are not mistaken for real filesystem paths
```

---

## 31. Security model you must not overstate

AI OS v1 is **not** a hosted multi-user platform.

It does not claim to provide:

- public network security;
- user login/authentication;
- tenant isolation;
- remote authorization;
- hostile multi-user database isolation;
- secure internet-exposed MCP;
- arbitrary remote write APIs.

The dashboard/API is designed for local use. MCP is stdio. Mutation remains local through CLI.

If you later expose AI OS remotely, that is a new architecture/security milestone, not a deployment toggle.

---

## 32. What is intentionally deferred after v1

The architecture explicitly defers:

- vector embeddings;
- semantic/vector search;
- automatic memory extraction from sessions;
- Mem0/OpenMemory integration;
- write-capable MCP;
- write-capable dashboard;
- remote multi-user hosting;
- authentication and authorization;
- tenant isolation;
- continuous filesystem watching;
- distributed job/event infrastructure;
- hosted multi-machine synchronization;
- mobile clients/plugin marketplaces.

New hard-to-reverse decisions should be documented with an ADR before implementation.

---

## 33. Documentation hierarchy

As owner, use this order when documents conflict:

1. current accepted architecture/decision documentation;
2. current source code, migrations, schemas, and configuration;
3. project registry;
4. durable memory with provenance;
5. session summaries;
6. raw session history;
7. generated indexes/model inference.

Important docs:

```text
README.md
docs/architecture.md
docs/ADR_STATUS.md
docs/PROJECT_STATUS.md
docs/installation.md
docs/operator-guide.md
docs/reliability-operations.md
docs/disaster-recovery.md
docs/mcp-operator-guide.md
docs/upgrade-rollback.md
docs/release-checklist.md
CHANGELOG.md
```

### Important owner note about `AGENTS.md`

`AGENTS.md` still contains historical language saying the project is in Phase 0 and should avoid production modules. The current repository has progressed through the v1 implementation and release-hardening stages. Treat the current architecture/status/source as authoritative and update `AGENTS.md` in a future documentation-cleanup PR so automated agents do not receive contradictory phase instructions.

---

## 34. Branch and review strategy

Protected conceptual flow:

```text
main
  = stable reviewed baseline

feature/*, reliability/*, review/*, release/*
  = isolated work

PR
  = review + CI boundary

merge only after CI green
```

Current OCR branch:

```text
review/open-code-review-v1.0.0
```

It was created from:

```text
dc26a31f8383d94cf59edca597d0d80645e5a543
```

Use this branch to run Open Code Review and commit review-driven fixes before opening another PR to `main`.

---

## 35. Open Code Review workflow

Suggested flow:

```bash
git fetch origin
git switch review/open-code-review-v1.0.0
ocr scan
```

Review priorities should be:

```text
1. data loss / corruption
2. transaction correctness
3. concurrency
4. security / privacy
5. path/filesystem safety
6. import idempotency
7. backup/restore correctness
8. API/MCP contract correctness
9. tests and observability
10. style only after correctness
```

After fixes:

```bash
pnpm check
pnpm build
pnpm test
pnpm smoke:clean
pnpm smoke:backup-restore
pnpm smoke:e2e
pnpm smoke:demo
```

Then open a PR against `main`.

---

## 36. Rules for adding a new AI provider

When supporting another tool, such as a future Gemini/Claude export format:

1. document the real source format;
2. create or extend a provider adapter;
3. normalize to the common session archive model;
4. preserve deterministic identity;
5. add realistic sanitized fixtures;
6. add parser tests;
7. add idempotent import tests;
8. ensure source freshness works;
9. ensure path redaction covers new error output;
10. run full E2E before merge.

Do not create a second independent persistence pipeline for each provider.

---

## 37. Rules for changing the database

Before a schema change:

```text
1. decide whether the change is backward compatible
2. add an ordered migration
3. do not modify already-released migration meaning silently
4. update types/access methods
5. update backup/restore assumptions if required
6. add migration/integration tests
7. update architecture docs if the data boundary changes
8. document rollback limitations
```

Remember: code rollback is not automatically database rollback.

---

## 38. Rules for adding writes to Dashboard or MCP

Do not simply add a POST route or a write MCP tool.

A write surface requires decisions about:

- authorization;
- validation;
- audit trail;
- concurrency;
- idempotency;
- rollback;
- destructive actions;
- secret handling;
- agent permissions;
- local vs remote trust.

This should require an ADR and probably a v2 security model.

---

## 39. Owner release checklist summary

Before calling a future version releasable:

```text
[ ] version identifiers aligned
[ ] migrations documented and tested
[ ] provider regression fixtures green
[ ] pnpm check green
[ ] pnpm build green
[ ] pnpm test green
[ ] clean bootstrap green
[ ] backup/restore smoke green
[ ] full E2E green
[ ] demo smoke green
[ ] privacy review complete
[ ] no secrets/runtime DB/provider exports committed
[ ] CHANGELOG updated
[ ] installation/upgrade/rollback docs updated
[ ] final main commit known
[ ] release tag points to that exact commit
```

---

## 40. What the owner should be able to answer

After understanding this document, you should be able to answer:

- Why does AI OS exist?
- What remains in Git and what remains local?
- Why are session archive and durable memory separate?
- Why is SQLite not the authoritative source of project knowledge?
- How does a Codex/ChatGPT export become searchable?
- How are duplicate imports avoided?
- What happens if an import fails halfway?
- How is concurrent source sync prevented?
- Why are dashboard and MCP read-only?
- How are local paths hidden?
- How does backup validation work?
- How would you recover a broken local database?
- How do you add a new provider?
- What CI gates protect the release?
- Which features are explicitly postponed beyond v1?

If you cannot answer one of these, return to the corresponding section before making major architecture changes.

---

## 41. Final mental model

The simplest correct model of AI OS is:

```text
Git/Markdown = reviewed knowledge and decisions
Provider exports = external raw input
Adapters = translation boundary
Import service = validation + audit + transaction boundary
SQLite = local operational state
FTS = local retrieval index
Durable memory = compact cross-session knowledge
CLI = trusted write boundary
Dashboard = human read surface
MCP = AI/tool read surface
Backup/restore = operational survival
CI smoke gates = proof that all of the above still work together
```

As long as future work preserves these boundaries—or explicitly changes them through a reviewed architecture decision—the project remains understandable, portable, and maintainable.
