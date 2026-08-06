# AI OS MCP Operator Guide

AI OS exposes a local, read-only Model Context Protocol server over stdio. It reads the same local SQLite database used by the CLI and dashboard. It does not provide mutation tools.

## Prerequisites

From the repository root:

```bash
pnpm install
pnpm bootstrap
pnpm build
```

The MCP process uses `AI_OS_HOME` through the shared configuration package. When unset, the normal AI OS default home is used.

## Start manually

Development mode:

```bash
pnpm --filter @ai-os/mcp-server dev
```

Built executable:

```bash
node apps/mcp/dist/index.js
```

The process communicates over stdin/stdout. Do not expect an HTTP port or browser page.

## Available v1 tools

| Tool | Purpose |
| --- | --- |
| `list_projects` | List synchronized projects. |
| `list_sessions` | List sessions with project filtering and pagination. |
| `get_session` | Return one session metadata record. |
| `list_session_messages` | Return paginated messages for one session. |
| `search_session_messages` | Search indexed message content. |
| `list_memories` | List durable memories by scope, subject, or text. |
| `get_import_health` | Return provider-import summary and paginated audit history. |
| `inspect_source_freshness` | Inspect configured provider export source states. |
| `get_system_status` | Return indexed counts and privacy mode. |

Every list or search operation has bounded limits. Results include `limit`, `offset`, and `hasMore` where pagination applies.

## Privacy behavior

Absolute local paths are redacted by default:

- repository paths become `<repo>/...`;
- home paths become `~/...`;
- other absolute paths become `<local>/filename`.

For temporary local debugging only:

```bash
AI_OS_EXPOSE_RAW_PATHS=1 node apps/mcp/dist/index.js
```

Do not enable raw paths when sharing MCP output, logs, screenshots, or support bundles.

## Provider-source registry

The default source registry is:

```text
config/import-sources.yaml
```

Override it for one MCP process:

```bash
AI_OS_IMPORT_SOURCES_PATH=/absolute/path/import-sources.yaml \
  node apps/mcp/dist/index.js
```

A missing registry is returned as `configured: false`; it does not crash the MCP server.

## Generic client configuration

Use an stdio MCP entry that launches Node from the AI OS repository:

```json
{
  "mcpServers": {
    "ai-os": {
      "command": "node",
      "args": ["/absolute/path/to/ai-os/apps/mcp/dist/index.js"],
      "env": {
        "AI_OS_HOME": "/absolute/path/to/.ai-os"
      }
    }
  }
}
```

The exact configuration file location differs between Codex, Claude Code, Gemini CLI, and other MCP clients. Keep the command, arguments, and environment equivalent to the example above.

## Validation

Before attaching a client, run:

```bash
pnpm check
pnpm build
pnpm test
```

The MCP integration test creates a temporary SQLite database, runs real migrations, seeds project/session data, verifies pagination, and confirms path redaction.

## Operational constraints

- Local read-only access only.
- No remote transport in v1.
- No MCP mutation tools in v1.
- Database writes remain in CLI/import workflows.
- Stop the process before replacing or restoring the active database.
