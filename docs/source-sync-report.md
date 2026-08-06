# Actionable provider source sync report

Use the dedicated command when scheduled automation should import only provider exports that are new or changed:

```bash
ai-os-source-sync --registry config/import-sources.yaml
```

Run one configured source:

```bash
ai-os-source-sync \
  --registry config/import-sources.yaml \
  --source codex-local
```

Write the same JSON report to a file while retaining stdout output:

```bash
ai-os-source-sync \
  --registry config/import-sources.yaml \
  --output "$HOME/.ai-os/reports/provider-sync-latest.json"
```

During repository development, the equivalent package command is:

```bash
pnpm --filter @ai-os/cli source:sync-actionable -- \
  --registry config/import-sources.yaml \
  --output "$HOME/.ai-os/reports/provider-sync-latest.json"
```

## Behavior

- `new` and `changed` sources are imported;
- `synced` sources are returned as `unchanged` without provider parsing;
- disabled sources remain `disabled`;
- missing or unreadable sources are returned as `blocked`;
- one failed import does not stop the remaining sources.

## Report contract

The versioned JSON report includes:

- command and registry provenance;
- optional selected source ID;
- start, finish, and duration;
- counts for `succeeded`, `skipped`, `unchanged`, `disabled`, `blocked`, and `failed`;
- a stable `summary.ok` boolean;
- per-source results and import audit identifiers when available.

The command exits with code `0` only when `summary.ok` is true. It exits non-zero for blocked sources, failed imports, invalid configuration, database errors, or report-write failures.

Provider export contents, local paths, SQLite data, and generated reports remain machine-local. Store reports outside the repository or under an ignored runtime directory.
