# Sanitized AI OS Demo Workspace

This directory contains synthetic, non-sensitive data for validating the v1 import and retrieval workflow.

It must never be replaced with real provider exports, company data, credentials, personal paths, or production runtime files.

## Contents

- `codex-session.jsonl`: synthetic Codex-style conversation.
- `import-sources.yaml`: source registry using a repository-relative fixture path.

## Run the demo

From the repository root:

```bash
export AI_OS_HOME="$(mktemp -d)/ai-os-demo"
pnpm bootstrap
pnpm --filter @ai-os/cli exec node dist/index.js provider:sources:validate demo/import-sources.yaml
pnpm --filter @ai-os/cli exec node dist/index.js provider:sources:status demo/import-sources.yaml
pnpm --filter @ai-os/cli exec node dist/index.js provider:sources:sync demo/import-sources.yaml
pnpm --filter @ai-os/cli exec node dist/index.js archive:search DEMO_RELEASE_WORKFLOW ai-os-demo
```

Expected behavior:

1. the source begins as `new`;
2. synchronization imports one synthetic session;
3. search returns the synthetic marker `DEMO_RELEASE_WORKFLOW`;
4. source status becomes `synced`;
5. no real local path or private content is committed.

Delete the temporary `AI_OS_HOME` after testing.
