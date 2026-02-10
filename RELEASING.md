# Releasing OrgLoop

Standard operating procedure for publishing `@orgloop/*` packages to npm.

## Running a release

### Dry run (recommended first)

```bash
pnpm release:dry -- --patch
```

This runs the full pipeline — pre-flight checks, build, test, typecheck, lint, version bump, changelog update, git commit/tag, and `pnpm publish --dry-run` — without actually publishing to npm or pushing to git. After dry run completes, it tells you how to undo the local commit.

### Real release

```bash
pnpm release -- --patch     # 0.1.0 -> 0.1.1
pnpm release -- --minor     # 0.1.0 -> 0.2.0
pnpm release -- --major     # 0.1.0 -> 1.0.0
pnpm release -- --version 1.0.0-rc.1   # explicit version
```

The script handles everything automatically:

1. **Pre-flight** — verifies git is clean, checks npm login, validates branch
2. **Version** — reads current version, computes new one, checks tag doesn't exist
3. **Build + test gate** — `pnpm build && pnpm test && pnpm typecheck && pnpm lint` (all must pass)
4. **Version bump** — updates all 19 package.json files (lockstep versioning)
5. **CHANGELOG.md** — prepends a dated version section
6. **Rebuild** — so `dist/` reflects updated versions
7. **Confirmation** — shows full publish plan, requires explicit `yes`
8. **Git commit + tag** — `chore: release vX.Y.Z`
9. **Publish** — each package in dependency order (see below)
10. **Push** — commit + tag to remote

## Publish order

| Phase | Packages |
|-------|----------|
| 1. Foundation | `@orgloop/sdk` |
| 2. Runtime | `@orgloop/core` |
| 3. Connectors | `connector-github`, `connector-linear`, `connector-claude-code`, `connector-openclaw`, `connector-webhook`, `connector-cron` |
| 4. Transforms | `transform-filter`, `transform-dedup`, `transform-enrich` |
| 5. Loggers | `logger-console`, `logger-file`, `logger-otel`, `logger-syslog` |
| 6. CLI + Server | `@orgloop/cli`, `@orgloop/server` |
| 7. Modules | `module-engineering`, `module-minimal` |

Internal `workspace:*` dependencies are automatically replaced with the actual version by pnpm during publish.

## Recovering from partial failures

### Some packages failed to publish

The script reports which succeeded and which failed. Retry individually:

```bash
cd <package-dir>
pnpm publish --access public --no-git-checks
```

### Undo a dry run

```bash
git reset --soft HEAD~1
git tag -d v<VERSION>
git checkout -- .
```

### Undo a real release (before anyone installs)

```bash
# Unpublish (72-hour window)
npm unpublish @orgloop/<package>@<VERSION>

# Remove tag
git tag -d v<VERSION>
git push origin :refs/tags/v<VERSION>

# Revert commit
git revert HEAD
git push origin HEAD
```

## npm 2FA

If your npm account has 2FA for publish, you'll be prompted for each package (19 times). Consider an automation token (`npm token create --type=publish`) or setting 2FA to "auth-only" for smoother releases.

## Adding a new package

1. Add `"publishConfig": { "access": "public" }` to its `package.json`
2. Ensure it has a `"files"` array (e.g., `["dist"]`)
3. Add its directory path to `PUBLISH_ORDER` in `scripts/release.sh` in the correct dependency position
