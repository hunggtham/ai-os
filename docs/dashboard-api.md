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

## Endpoints

- `GET /health`
- `GET /api/status`
- `GET /api/projects`
- `GET /api/sessions?projectId=ai-os&limit=50`
- `GET /api/search/sessions?q=shared%20memory&projectId=ai-os&limit=50`

The service accepts only `GET` requests. Import and lifecycle operations remain explicit CLI commands.
