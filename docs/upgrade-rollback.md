# AI OS Upgrade and Rollback Guide

## Upgrade principles

- Back up before changing code or migrations.
- Upgrade from a clean Git state.
- Use release tags, not arbitrary commits, for routine operation.
- Never replace `AI_OS_HOME` with repository files.
- Do not run two upgrade or source-sync processes concurrently.

## Pre-upgrade checklist

```bash
git status --short
pnpm --filter @ai-os/cli exec node dist/index.js version
pnpm --filter @ai-os/cli exec node dist/index.js db:maintain
pnpm backup
```

Confirm:

- the working tree is clean;
- database integrity is `ok`;
- the backup completed successfully;
- the backup manifest and hashes validate;
- you know the currently checked-out release tag or commit.

## Upgrade procedure

### 1. Stop local processes

Stop the dashboard, MCP clients that spawn AI OS, and scheduled source-sync jobs.

### 2. Fetch the target release

```bash
git fetch --tags origin
git checkout v1.0.0
```

Replace `v1.0.0` with the intended newer release tag for future upgrades.

### 3. Install the exact dependency graph

```bash
pnpm install --frozen-lockfile
```

### 4. Build and migrate

```bash
pnpm build
pnpm --filter @ai-os/cli exec node dist/index.js db:migrate
```

Migrations are ordered and recorded in `schema_migrations`. Already-applied migrations are skipped.

### 5. Validate

```bash
pnpm --filter @ai-os/cli exec node dist/index.js version
pnpm --filter @ai-os/cli exec node dist/index.js db:maintain
pnpm check
pnpm test
pnpm smoke:e2e
```

### 6. Resume services

Restart the dashboard, MCP clients, and scheduled source synchronization only after validation succeeds.

## Rollback decision

Rollback when:

- migrations or startup fail;
- integrity checks fail;
- imported content becomes inaccessible;
- the dashboard or MCP contract is incompatible with the operator's clients;
- a release-specific defect blocks daily use.

Do not attempt an in-place database downgrade by manually deleting migration records.

## Rollback procedure

### 1. Stop all AI OS processes

Ensure no dashboard, MCP, CLI import, or scheduled sync process is writing to the runtime.

### 2. Preserve the failed state

Create a diagnostic copy of the current runtime before restoring an older backup. Do not overwrite the last known-good backup.

### 3. Check out the previous release

```bash
git checkout <previous-release-tag>
pnpm install --frozen-lockfile
pnpm build
```

### 4. Restore the matching backup

Use the documented restore command and select a backup created before the failed upgrade:

```bash
pnpm restore -- <backup-directory>
```

The restore flow validates hashes and SQLite integrity and refuses unsafe overwrite unless the documented explicit overwrite option is used.

### 5. Validate the restored runtime

```bash
pnpm --filter @ai-os/cli exec node dist/index.js version
pnpm --filter @ai-os/cli exec node dist/index.js db:maintain
pnpm smoke:backup-restore
pnpm smoke:e2e
```

### 6. Resume operation

Restart local services only after integrity, smoke, and retrieval checks pass.

## Recovery for interrupted imports

After a crash or forced shutdown:

```bash
pnpm --filter @ai-os/cli exec node dist/index.js provider:imports:recover 60
```

This marks `running` import records older than the threshold as failed so a subsequent synchronization can retry cleanly.

## Recovery for stale source-sync lock

The actionable source-sync command automatically reclaims its lock after the configured stale interval. Do not delete an active lock merely because a sync is slow; first verify no process is still running.

## Compatibility rule

The SQLite database is forward-migrated. A code rollback that requires an older schema must use a backup created by that older compatible release. Git checkout alone is not a complete rollback.
