# Browser Dashboard

Start the local read-only dashboard:

```bash
AI_OS_HOME="$HOME/.ai-os" pnpm dev:api
```

Open:

```text
http://127.0.0.1:4310/
```

The browser dashboard provides:

- project, session, and memory counts;
- project filtering;
- recent-session pagination;
- SQLite FTS5 session-message search;
- paginated search results.

The HTTP API also accepts `offset` and `limit`:

```text
GET /api/sessions?projectId=ai-os&offset=0&limit=20
GET /api/search/sessions?q=memory&projectId=ai-os&offset=0&limit=20
```

The service binds to `127.0.0.1` by default and remains read-only. Do not expose it publicly without adding authentication, authorization, rate limiting, and transport security.
