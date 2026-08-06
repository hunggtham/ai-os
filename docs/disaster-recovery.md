# AI OS Backup and Disaster Recovery

## Backup scope

The backup command creates a machine-local recovery bundle containing:

- a transactionally consistent SQLite snapshot created with `VACUUM INTO`;
- a SHA-256 checksum and byte size for every included file;
- a versioned JSON manifest;
- the local provider source registry when it exists.

Provider export archives are not copied automatically. They can be large and may contain sensitive data. Back them up separately using encrypted storage.

## Create a backup

```bash
pnpm backup
```

The default destination is:

```text
$AI_OS_HOME/backups/<ISO timestamp>/
```

Use another backup root when needed:

```bash
pnpm backup -- /Volumes/EncryptedBackup/ai-os
```

A successful backup contains:

```text
manifest.json
ai-os.sqlite
import-sources.yaml   # only when configured
```

## Restore to an empty runtime

```bash
AI_OS_HOME="$HOME/.ai-os-restored" pnpm restore -- "$HOME/.ai-os/backups/<timestamp>"
```

Restore validates the manifest, file size, SHA-256 checksum, and SQLite `integrity_check` before installing the database.

## Replace an existing runtime database

Stop the dashboard, MCP server, CLI import jobs, and scheduled synchronization first. Then run:

```bash
pnpm restore -- "$HOME/.ai-os/backups/<timestamp>" --force
```

The `--force` flag is required when the target database already exists.

## Recovery validation

After restore:

```bash
pnpm bootstrap
pnpm dev:api
```

Verify:

```text
GET http://127.0.0.1:4310/health
```

Then confirm that projects, sessions, memories, import history, and source freshness are visible.

## Automated round-trip test

```bash
pnpm smoke:backup-restore
```

The smoke flow creates an isolated source runtime, initializes its database, creates a backup, restores it into a second runtime, runs SQLite integrity validation, and confirms that project counts are preserved.

## Retention guidance

Recommended minimum policy:

- keep seven daily backups;
- keep four weekly backups;
- keep three monthly backups;
- store at least one encrypted copy on a different physical device;
- periodically run the restore smoke test against a retained backup.

Do not commit backup bundles, provider exports, runtime databases, local source registries, or absolute machine paths to the repository.
