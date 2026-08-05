# Batch archive ingestion

Use batch ingestion when one provider or project already has many Markdown or JSONL session archives.

```bash
ai-os archive:import-dir <directory> <project-id> [provider]
```

Example:

```bash
ai-os archive:import-dir ./session-exports ai-os codex
```

The command recursively discovers `.md`, `.markdown`, and `.jsonl` files. Hidden files and directories are ignored.

Each archive receives a deterministic session ID derived from:

- project ID;
- provider name;
- path relative to the imported directory.

Running the same command again updates the same sessions and replaces their indexed messages instead of creating duplicates. File content is hashed separately, so changed archives update their stored content hash.

The command prints a JSON report with:

- total files discovered;
- successfully imported sessions;
- message counts;
- failed files and error messages.

A partial failure sets a non-zero process exit code but does not discard archives imported successfully before the failure.
