# Dashboard and API path redaction

AI OS treats absolute local filesystem paths as operator-sensitive metadata.

## Default behavior

Dashboard and API output must replace absolute paths with stable aliases:

- repository files: `<repo>/relative/path`
- files under the current user home: `~/relative/path`
- other local files: `<local>/basename`
- relative paths remain unchanged

Path-shaped fields include names ending in `path`, `directory`, or `root`, including camelCase fields such as `sourcePath` and `registryPath`.

## Raw-path debugging opt-in

Raw paths may only be exposed when the operator explicitly starts the dashboard with:

```bash
AI_OS_EXPOSE_RAW_PATHS=1 pnpm dev:api
```

Do not enable this option when sharing screenshots, API responses, logs, or dashboard access with another person.

## Security boundary

Redaction reduces accidental disclosure of usernames, directory layouts, mounted volumes, provider export locations, and private project names. It is not an authorization mechanism. The v1 dashboard remains localhost-only and read-only.

## Test requirements

Regression tests must cover repository paths, home-relative paths, external paths, relative paths, recursive response objects, camelCase field names, and explicit raw-path opt-in.
