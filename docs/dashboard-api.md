# Dashboard API

The dashboard API is a local, read-only HTTP service over the AI OS SQLite database.

## Run

```bash
AI_OS_HOME="$HOME/.ai-os" pnpm dev:api
```

Default address:

```text
http://127.0.0.1:4310
```

Override the bind address with `AI_OS_API_HOST` and `AI_OS_API_PORT`.

## Browser views

- `/` shows sessions, full-text search, provider import health, and import history;
- `/session?id=<session-id>` shows ordered session messages;
- `/import?id=<run-id>` shows import provenance, counts, SHA-256, timestamps, and errors.

Import history can be filtered by project, provider, and status. Both session and import lists are paginated. Summary cards show total import runs, failures, and currently running imports.

## Endpoints

- `GET /health`
- `GET /api/status`
- `GET /api/projects`
- `GET /api/sessions?projectId=ai-os&offset=0&limit=50`
- `GET /api/search/sessions?q=shared%20memory&projectId=ai-os&offset=0&limit=50`
- `GET /api/imports/summary`
- `GET /api/imports?projectId=ai-os&provider=codex&status=failed&offset=0&limit=50`
- `GET /api/imports/<run-id>`
- `GET /api/sessions/<session-id>/messages`

The import summary includes counts for `running`, `succeeded`, `failed`, and `skipped`, plus the latest successful and failed completion timestamps when available.

The service accepts only `GET` requests. Provider import and lifecycle operations remain explicit CLI commands. It binds to localhost by default; do not expose it publicly without authentication, TLS, and an explicit threat model.
