# Releasing OrgLoop

## Quick Release

```bash
bash scripts/release.sh --patch|--minor|--major
```

This script handles the full release flow:

1. Calculates the new version from the current `package.json`
2. Creates a `release/vX.Y.Z` branch from `origin/main`
3. Bumps version in all `package.json` files (root + `packages/*`)
4. Prompts to edit `CHANGELOG.md` (or pass `--changelog "entry"`)
5. Runs `pnpm run build` and `pnpm run test`
6. Commits and pushes the branch
7. Opens a PR via `gh-me`

## Post-Merge

After the release PR is merged:

```bash
git checkout main && git pull origin main
git tag vX.Y.Z
git push origin vX.Y.Z
```

The tag push triggers the publish workflow (GitHub Actions).

## Version Bump Guide

| Bump    | When                                        |
| ------- | ------------------------------------------- |
| `patch` | Bug fixes, docs improvements                |
| `minor` | New features, non-breaking changes          |
| `major` | Breaking changes (discuss with Charlie first)|

## Manual Release (without script)

1. Create branch: `git checkout -b release/vX.Y.Z origin/main`
2. Bump versions in all `package.json` files
3. Update `CHANGELOG.md`
4. Build: `pnpm run build`
5. Test: `pnpm run test`
6. Commit with release message
7. Push branch and open PR via `gh-me`
8. After merge: tag and push tag

## Rules

- **Never commit directly to main** — all changes go through PRs
- **Never force push** to any branch
- **Use `gh-me`** (not `gh`) for all GitHub operations
- **Always update CHANGELOG.md** before releasing
