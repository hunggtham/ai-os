# AI OS MCP Server

The local MCP server exposes read-only access to synchronized AI OS metadata over stdio.

## Build

```bash
pnpm install --no-frozen-lockfile
pnpm build
```

## Run

```bash
AI_OS_HOME="$HOME/.ai-os" pnpm dev:mcp
```

The server writes protocol messages to stdout. Application diagnostics must use stderr.

## Tools

- `list_projects`
- `list_sessions`
- `get_session`
- `search_memories`
- `get_system_status`

## Client configuration

Configure the MCP client to launch the built entrypoint from the repository root:

```json
{
  "command": "node",
  "args": ["/absolute/path/to/ai-os/apps/mcp/dist/index.js"],
  "env": {
    "AI_OS_HOME": "/absolute/path/to/.ai-os"
  }
}
```

Run `ai-os db:migrate`, `ai-os registry:sync`, and the relevant session or memory import commands before expecting indexed results.

The MCP surface is read-only by design. Writes remain explicit CLI operations so that AI clients cannot silently alter canonical project, session, or memory data.
