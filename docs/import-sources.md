# Configured provider import sources

Use a local YAML registry to avoid repeating export paths, project IDs, and provider hints.

Copy the example without committing private paths:

```bash
cp config/import-sources.example.yaml config/import-sources.yaml
```

The local file should contain:

```yaml
version: 1
sources:
  - id: codex-local
    path: ~/.codex/sessions/session.jsonl
    projectId: ai-os
    provider: codex

  - id: chatgpt-export
    path: ${HOME}/Downloads/chatgpt-export/conversations.json
    projectId: ai-os
    provider: chatgpt
    enabled: false
```

Supported path forms:

- absolute paths;
- paths relative to the registry file;
- `~/...`;
- `${ENVIRONMENT_VARIABLE}/...`.

Validate the registry:

```bash
ai-os provider:sources:validate config/import-sources.yaml
```

Synchronize every enabled source:

```bash
ai-os provider:sources:sync config/import-sources.yaml
```

Synchronize one source:

```bash
ai-os provider:sources:sync config/import-sources.yaml codex-local
```

Force rebuilding one source even when its SHA-256 has not changed:

```bash
ai-os provider:sources:sync config/import-sources.yaml codex-local --force
```

Each source runs independently. A failed source is reported without preventing the remaining sources from running. The command exits unsuccessfully when any selected source fails.

Provider exports and machine-specific paths must remain local. Commit only sanitized examples.
