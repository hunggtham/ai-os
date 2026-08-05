# Session Archive

Session archives preserve the complete history of AI-assisted work. They are not a substitute for curated project documentation.

## Recommended path

```text
sessions/<project-id>/<YYYY>/<MM>/<session-id>.md
```

## Canonical Markdown format

```yaml
---
schema_version: 1
session_id: ses_20260805_001
project_id: ai-os
started_at: 2026-08-05T16:00:00+09:00
ended_at: null
provider: openai
client: codex
model: null
status: active
privacy: internal
tags: [architecture, phase-0]
source_session_id: null
repository:
  name: hunggtham/ai-os
  branch: foundation/phase-0
  base_commit: null
  final_commit: null
---
```

Required sections:

```markdown
# Session title

## Objective

## Context loaded

## Conversation

### User

### Assistant

## Tool activity

## Files changed

## Decisions

## Open questions

## Todo

## Final summary
```

## Rules

1. Preserve prompts and final responses when permitted.
2. Never store hidden chain-of-thought. Store concise decision rationale instead.
3. Redact secrets before writing the session.
4. Link decisions to ADRs when they become authoritative.
5. Record source file paths and commit SHAs where available.
6. A summary may be generated, but it must not replace the raw permitted transcript.
7. Binary attachments remain outside Git unless explicitly approved and sanitized.
