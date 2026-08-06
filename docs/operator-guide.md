# AI OS Operator Guide

This guide covers the supported local-first operating flow for AI OS v1.

## Requirements

- Node.js 22 or newer
- pnpm 10.14.0
- Git
- macOS or Linux

## First run

```bash
pnpm install
pnpm bootstrap
```

The bootstrap command is idempotent. It:

1. builds the workspace;
2. creates `AI_OS_HOME` runtime directories;
3. creates `config/import-sources.yaml` from the example only when the local file is absent;
4. runs database migrations;
5. synchronizes `projects/registry.yaml`;
6. runs the system doctor.

Default runtime location:

```text
~/.ai-os/
├── data/
├── reports/
└── backups/
```

Override it for isolated environments:

```bash
AI_OS_HOME=/path/to/runtime pnpm bootstrap
```

## Configure provider exports

Edit the machine-local file:

```text
config/import-sources.yaml
```

Never commit real export paths, credentials, private session content, or generated reports.

Validate and inspect the configured sources:

```bash
pnpm provider:sources:status
```

Run actionable-only synchronization:

```bash
pnpm --filter @ai-os/cli source:sync -- --registry config/import-sources.yaml
```

## Dashboard

Start the local read-only dashboard:

```bash
pnpm dev:api
```

Default address:

```text
http://127.0.0.1:4310
```

Keep the service bound to localhost unless authentication, TLS, and a documented threat model are added.

## MCP server

Start the local MCP server:

```bash
pnpm dev:mcp
```

Provider clients should connect only through the documented read-only tool boundary until write operations receive a separate security review.

## Verification

Run the normal quality gates:

```bash
pnpm check
pnpm test
pnpm smoke:clean
```

The clean-machine smoke test uses an isolated temporary `AI_OS_HOME`, bootstraps a fresh database, runs migrations and project synchronization, verifies the database, and deletes the temporary runtime afterward.

## Common recovery

### Bootstrap failed during build

```bash
rm -rf node_modules
pnpm install
pnpm bootstrap
```

### Database migration failed

Do not delete the database immediately. Copy the runtime directory first, then rerun:

```bash
cp -R "$AI_OS_HOME" "$AI_OS_HOME.backup"
pnpm --filter @ai-os/cli exec node dist/index.js db:migrate
```

### Import source is missing

Update `config/import-sources.yaml` or restore the provider export file. A missing source is reported as `blocked`; other sources remain independently inspectable.

### Dashboard does not start

Run:

```bash
pnpm bootstrap
pnpm dev:api
```

Then confirm that port `4310` is not already in use and that `AI_OS_HOME` points to the expected runtime.

## Daily operating sequence

```bash
pnpm provider:sources:status
pnpm --filter @ai-os/cli source:sync -- --registry config/import-sources.yaml --output "$AI_OS_HOME/reports/provider-sync-latest.json"
pnpm dev:api
```

The repository is the source of truth for code, schemas, decisions, and curated knowledge. Private provider exports, SQLite data, local paths, and runtime reports remain outside Git.
