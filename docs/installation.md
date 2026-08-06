# AI OS Installation Guide

## Supported environment

AI OS v1 targets:

- macOS or Linux;
- Node.js 22;
- pnpm 10;
- Git;
- local filesystem access for `AI_OS_HOME`.

The v1 runtime is local-first. Do not expose the dashboard or database directly to the public internet.

## 1. Clone the repository

```bash
git clone https://github.com/hunggtham/ai-os.git
cd ai-os
```

For a release installation, check out the release tag:

```bash
git checkout v1.0.0
```

## 2. Verify the toolchain

```bash
node --version
pnpm --version
git --version
```

Node must be version 22.x. The repository pins the expected pnpm version through `packageManager` metadata.

## 3. Install dependencies

```bash
pnpm install --frozen-lockfile
```

## 4. Choose the runtime home

By default AI OS uses:

```text
~/.ai-os
```

To use another location:

```bash
export AI_OS_HOME="$HOME/ai-os-runtime"
```

Keep this directory private. It may contain the SQLite database, source registry, backups, lock files, and imported local metadata.

## 5. Bootstrap

```bash
pnpm bootstrap
```

Bootstrap is idempotent. It creates runtime directories, applies database migrations, synchronizes the project registry, and initializes safe local configuration where needed.

## 6. Verify the installation

```bash
pnpm --filter @ai-os/cli exec node dist/index.js version
pnpm --filter @ai-os/cli exec node dist/index.js doctor
pnpm --filter @ai-os/cli exec node dist/index.js db:maintain
```

Expected results:

- `version` returns CLI, report-contract, Node, and migration versions;
- `doctor` reports the resolved runtime directories and database state;
- `db:maintain` returns `integrity: "ok"`.

## 7. Configure provider sources

Copy or edit the local source registry under the runtime/configured location documented by the bootstrap output. A source entry uses this shape:

```yaml
version: 1
sources:
  - id: codex-local
    provider: codex
    projectId: ai-os
    path: /absolute/path/to/codex-session.jsonl
    enabled: true
```

Never commit real provider-export paths or private exports to a public repository.

Validate and inspect sources:

```bash
pnpm --filter @ai-os/cli exec node dist/index.js provider:sources:validate config/import-sources.yaml
pnpm --filter @ai-os/cli exec node dist/index.js provider:sources:status config/import-sources.yaml
```

Synchronize actionable sources:

```bash
pnpm --filter @ai-os/cli source:sync-actionable
```

## 8. Start read surfaces

Dashboard/API:

```bash
node apps/dashboard-api/dist/index.js
```

MCP server:

```bash
node apps/mcp/dist/index.js
```

The dashboard is localhost-only by design. MCP uses stdio and is read-only in v1.

## 9. Run validation gates

```bash
pnpm check
pnpm build
pnpm test
pnpm smoke:clean
pnpm smoke:backup-restore
pnpm smoke:e2e
```

All commands must pass before treating the installation as production-ready for local daily use.

## 10. Create the first backup

```bash
pnpm backup
```

Store a tested copy of the resulting backup outside the active `AI_OS_HOME` directory.
