# Provider Import Audit

Provider-native imports are recorded in the local SQLite database through the `import_runs` table.

## Import

```bash
ai-os provider:import <path> <project-id> [provider]
```

The importer calculates a SHA-256 hash before parsing. When the same source path, project, provider, and successful content hash already exist, the import is recorded as `skipped` and sessions are not parsed or indexed again.

Force a rebuild when adapter behavior changed:

```bash
ai-os provider:import <path> <project-id> <provider> --force
```

## History

```bash
ai-os provider:imports [limit]
```

Each run records:

- source path and project;
- resolved provider adapter;
- source content hash;
- status: `running`, `succeeded`, `failed`, or `skipped`;
- imported session and message counts;
- start and finish timestamps;
- failure message when applicable.

The audit log and imported exports stay under the local `AI_OS_HOME` database. They are not committed to Git.
