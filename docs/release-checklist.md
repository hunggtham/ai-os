# AI OS v1 Release Checklist

## Scope and documentation

- [ ] `docs/PROJECT_STATUS.md` reports v1 complete.
- [ ] `docs/architecture.md` matches the implemented runtime.
- [ ] `docs/ADR_STATUS.md` contains no unresolved v1 decision.
- [ ] `CHANGELOG.md` contains the release date and complete v1 capability summary.
- [ ] Installation, operation, backup, restore, upgrade, rollback, privacy, MCP, and reliability guides are current.
- [ ] Post-v1 features are clearly marked as deferred.

## Repository hygiene

- [ ] Working tree and release PR contain no credentials, tokens, private exports, runtime databases, or personal paths.
- [ ] Demo assets contain only synthetic data.
- [ ] `.gitignore` excludes runtime data, SQLite files, backups, lock files, and local source registries.
- [ ] Package lockfile is committed and installation succeeds with `--frozen-lockfile`.

## Version and migration checks

```bash
pnpm --filter @ai-os/cli exec node dist/index.js version
```

- [ ] CLI version matches the intended release.
- [ ] Report contract version is documented.
- [ ] Latest migration version is present.
- [ ] Changelog release version and Git tag match.

## Full validation

Run from a clean checkout:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm build
pnpm test
pnpm smoke:clean
pnpm smoke:backup-restore
pnpm smoke:e2e
```

- [ ] Every command exits successfully.
- [ ] Full E2E imports a synthetic provider fixture.
- [ ] Imported content is searchable.
- [ ] Dashboard health and data endpoints pass.
- [ ] MCP initializes and executes a real read tool.
- [ ] Backup and restore validation passes.
- [ ] Temporary processes and directories are cleaned up.

## Operational validation

```bash
pnpm --filter @ai-os/cli exec node dist/index.js db:maintain
pnpm --filter @ai-os/cli exec node dist/index.js provider:imports:recover 60
```

- [ ] SQLite integrity reports `ok`.
- [ ] Database maintenance completes.
- [ ] Stale import recovery returns a stable JSON envelope.
- [ ] Actionable source synchronization uses an exclusive process lock.
- [ ] A second concurrent sync fails safely rather than running in parallel.

## Privacy validation

- [ ] Dashboard/API responses redact repository, home, and other absolute paths by default.
- [ ] MCP output follows the same path policy.
- [ ] Raw paths appear only with `AI_OS_EXPOSE_RAW_PATHS=1`.
- [ ] Dashboard binds to localhost only.
- [ ] MCP remains stdio and read-only.

## Backup before release tag

- [ ] Create a known-good local backup.
- [ ] Validate its manifest, hashes, file sizes, and SQLite integrity.
- [ ] Store a copy outside the active runtime directory.
- [ ] Record the release commit SHA with the backup.

## Merge and tag

- [ ] Final release PR is non-draft, conflict-free, complete, and green.
- [ ] Merge the release PR into `main`.
- [ ] Verify CI on the final `main` commit.
- [ ] Create annotated tag `v1.0.0` on the validated `main` commit.
- [ ] Push the tag.
- [ ] Confirm the tag resolves to the expected commit.

## Post-tag verification

- [ ] Perform a fresh installation from `v1.0.0` using `docs/installation.md`.
- [ ] Run the full validation suite from the tag.
- [ ] Confirm `CHANGELOG.md` and release documentation are visible from the tag.
- [ ] Record any non-blocking follow-up as post-v1 work rather than modifying the release scope.
