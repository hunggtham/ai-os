# Provider export import

AI OS can import provider-native exports without converting them to Markdown first.

## ChatGPT

Use the `conversations.json` file from a ChatGPT data export:

```bash
ai-os provider:import /path/to/conversations.json ai-os
```

The adapter reads the active branch in each conversation mapping, preserves message roles and timestamps, and creates one deterministic session per conversation.

## Codex

Codex session exports are line-delimited JSON and require an explicit provider hint:

```bash
ai-os provider:import /path/to/session.jsonl ai-os codex
```

The adapter accepts role-based records and nested payload/message/item records. Text is extracted from strings or content arrays containing `text`, `input_text`, or `output_text` values.

## Configured source status

Inspect every configured source without importing it:

```bash
ai-os provider:sources:status config/import-sources.yaml
```

Inspect one source:

```bash
ai-os provider:sources:status config/import-sources.yaml codex-local
```

The command is read-only. It checks file metadata, calculates SHA-256, and compares it with local import audit history. Each source is classified as:

- `disabled`: disabled in the registry;
- `missing`: configured file does not exist;
- `new`: file exists but has no matching import history;
- `synced`: latest successful import has the same SHA-256;
- `changed`: the file differs from its latest import or the latest run did not succeed;
- `error`: the path is not a regular file or could not be inspected.

The command exits non-zero when a source is `missing` or `error`, making it suitable for local cron, launchd, systemd timers, or n8n health checks.

## Actionable-only synchronization

`@ai-os/import-sources` exports `syncActionableImportSources(database, registry, sourceId?)` for safe scheduled synchronization.

The function inspects source freshness first and then applies these rules:

- `new` and `changed` sources are imported;
- `synced` sources return `unchanged` without parsing or persistence;
- `disabled` sources remain untouched;
- `missing` and `error` sources return `blocked` with an error message;
- import exceptions return `failed` without stopping the remaining sources.

Example:

```ts
const results = await syncActionableImportSources(database, registry);
const unhealthy = results.some((result) =>
  result.status === "blocked" || result.status === "failed",
);
```

This is the preferred service boundary for cron, launchd, systemd timers, and n8n workflows because it avoids unnecessary provider parsing while preserving per-source audit isolation. A dedicated CLI command can call this service without duplicating freshness logic.

## Idempotency

Session IDs are derived from project, source path, and provider session identity. Re-importing the same export updates existing sessions and replaces their indexed messages instead of creating duplicates.

A ChatGPT export may contain many conversations in one file. AI OS stores a unique logical archive path for each resulting session while retaining the original source file path in normalized metadata.

## Inspection and validation

`@ai-os/provider-adapters` exports:

```ts
inspectNormalizedArchives(archives)
assertImportableArchives(archives)
```

Inspection returns session and message totals, provider and role counts, empty-session IDs, and the earliest/latest session timestamps.

Validation rejects:

- exports that produce no sessions;
- duplicate normalized session IDs;
- sessions that contain no importable messages.

Provider-specific adapters should run through this validation boundary before persistence.

## Data boundary

Provider export files and imported messages remain in the local `AI_OS_HOME` database. They are not committed to Git.
