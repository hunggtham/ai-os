# Dashboard API

The dashboard API is a local, read-only HTTP service over the AI OS SQLite database and configured provider export sources.

## Run

```bash
AI_OS_HOME="$HOME/.ai-os" pnpm dev:api
```

Default address:

```text
http://127.0.0.1:4310
```

Override the bind address with `AI_OS_API_HOST` and `AI_OS_API_PORT`.

The provider source registry defaults to:

```text
config/import-sources.yaml
```

Override it with:

```bash
AI_OS_IMPORT_SOURCES_PATH="$HOME/.ai-os/import-sources.yaml" pnpm dev:api
```

## Browser views

- `/` shows sessions, full-text search, provider import health, import history, and source freshness;
- `/session?id=<session-id>` shows ordered session messages;
- `/import?id=<run-id>` shows import provenance, counts, SHA-256, timestamps, and errors.

The **Source freshness** tab shows every configured export as `new`, `changed`, `synced`, `missing`, `disabled`, or `error`. It can be filtered by state and refreshed without changing SQLite or importing provider data.

Import history can be filtered by project, provider, and status. Both session and import lists are paginated. Summary cards include import failures, sources requiring import, and missing source files.

## Endpoints

- `GET /health`
- `GET /api/status`
- `GET /api/projects`
- `GET /api/sources`
- `GET /api/sources?sourceId=codex-local`
- `GET /api/sessions?projectId=ai-os&offset=0&limit=50`
- `GET /api/search/sessions?q=shared%20memory&projectId=ai-os&offset=0&limit=50`
- `GET /api/imports/summary`
- `GET /api/imports?projectId=ai-os&provider=codex&status=failed&offset=0&limit=50`
- `GET /api/imports/<run-id>`
- `GET /api/sessions/<session-id>/messages`

`GET /api/sources` returns the registry path, source statuses, and a summary containing total, actionable, synced, missing, error, disabled, new, and changed counts. `actionable` is the sum of `new` and `changed`. `healthy` is false when any source is missing or invalid.

When the machine-local registry does not exist, the endpoint returns `configured: false` with an empty summary instead of failing the dashboard.

The service accepts only `GET` requests. Provider import and lifecycle operations remain explicit CLI commands. It binds to localhost by default; do not expose it publicly without authentication, TLS, and an explicit threat model.
