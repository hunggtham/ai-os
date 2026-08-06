# Reliability Operations

## Purpose

This guide covers the v1 controls used to detect database problems, recover interrupted imports, prevent overlapping source synchronization, and expose machine-readable version and error contracts.

## Version and contract inspection

```bash
pnpm --filter @ai-os/cli exec node dist/index.js version
```

The JSON response includes the CLI version, Node.js version, report contract version, and latest applied migration. Automation should verify `reportContractVersion` before depending on response fields.

## Database maintenance

Run the normal maintenance path:

```bash
pnpm --filter @ai-os/cli exec node dist/index.js db:maintain
```

This performs `PRAGMA integrity_check` and `ANALYZE`. The command fails when integrity is not `ok`.

Use `VACUUM` only during a maintenance window after a successful backup:

```bash
pnpm backup
pnpm --filter @ai-os/cli exec node dist/index.js db:maintain --vacuum
```

`VACUUM` checkpoints the WAL first and requires exclusive database access.

## Recovering interrupted imports

An import process terminated by a host restart or forced process kill can leave an audit row in `running`. Recover rows older than 60 minutes:

```bash
pnpm --filter @ai-os/cli exec node dist/index.js provider:imports:recover 60
```

Recovered rows become `failed`, receive a finish timestamp, and retain an explicit recovery error message. Choose a threshold longer than the largest expected provider export import.

## Source synchronization lock

The automation-oriented source-sync command uses an atomic lock file:

```text
$AI_OS_HOME/locks/source-sync.lock
```

Only one actionable source-sync process may own this lock. A second process exits with a failed JSON report instead of importing concurrently. A lock older than one hour is treated as stale and replaced. The lock is released in a `finally` block after success or failure.

Run scheduled synchronization with:

```bash
pnpm --filter @ai-os/cli source:sync-actionable -- --registry config/import-sources.yaml
```

Do not manually delete an active lock. Confirm no source-sync process is running before removing a lock during incident recovery.

## Structured errors

The main CLI writes failures to stderr with this envelope:

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

Automation must use the process exit code as the primary success signal and the JSON envelope for diagnostics.

## Suggested schedule

- actionable source sync: according to provider export availability;
- stale import recovery: before each scheduled sync or once daily;
- integrity check and `ANALYZE`: weekly;
- backup: before upgrades and before `VACUUM`;
- `VACUUM`: optional, only when file growth justifies downtime.
