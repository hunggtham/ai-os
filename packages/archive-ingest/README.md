# @ai-os/archive-ingest

Provider-neutral parsers for AI session archives.

```ts
import { parseArchive } from "@ai-os/archive-ingest";

const archive = await parseArchive(
  {
    path: "sessions/example.jsonl",
    projectId: "ai-os",
    providerHint: "codex",
  },
  "session-2026-08-05",
  "2026-08-05T09:00:00Z",
);
```

The package currently parses Markdown and JSONL into the normalized contracts from `@ai-os/provider-adapters`.
