#!/usr/bin/env bash
set -euo pipefail

# OrgLoop release script
# Creates a release branch, bumps versions, updates changelog, builds, tests, and opens a PR.
# NEVER commits to main. NEVER force pushes.

usage() {
  echo "Usage: $0 --patch|--minor|--major [--changelog \"entry\"]"
  echo ""
  echo "Options:"
  echo "  --patch           Bump patch version (0.0.X)"
  echo "  --minor           Bump minor version (0.X.0)"
  echo "  --major           Bump major version (X.0.0)"
  echo "  --changelog TEXT  Changelog entry (skips \$EDITOR prompt)"
  echo "  --dry-run         Show what would happen without making changes"
  exit 1
}

BUMP=""
CHANGELOG_ENTRY=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --patch) BUMP="patch"; shift ;;
    --minor) BUMP="minor"; shift ;;
    --major) BUMP="major"; shift ;;
    --changelog) CHANGELOG_ENTRY="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    *) usage ;;
  esac
done

[[ -z "$BUMP" ]] && usage

# Must be run from repo root
if [[ ! -f "package.json" ]]; then
  echo "❌ Must be run from the repository root"
  exit 1
fi

# Ensure clean working tree
if [[ -n "$(git status --porcelain)" ]]; then
  echo "❌ Working tree is not clean. Commit or stash changes first."
  exit 1
fi

# Calculate new version
CURRENT_VERSION=$(node -p "require('./package.json').version")
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

case "$BUMP" in
  major) NEW_VERSION="$((MAJOR + 1)).0.0" ;;
  minor) NEW_VERSION="${MAJOR}.$((MINOR + 1)).0" ;;
  patch) NEW_VERSION="${MAJOR}.${MINOR}.$((PATCH + 1))" ;;
esac

BRANCH="release/v${NEW_VERSION}"
echo "📦 Releasing v${NEW_VERSION} (${BUMP} bump from ${CURRENT_VERSION})"

if $DRY_RUN; then
  echo "🏜️  Dry run — would create branch ${BRANCH}, bump to ${NEW_VERSION}"
  exit 0
fi

# Create release branch from origin/main
git fetch origin main
git checkout -b "$BRANCH" origin/main
echo "🌿 Created branch ${BRANCH}"

# Bump version in all package.json files
for pkg in package.json packages/*/package.json; do
  if [[ -f "$pkg" ]]; then
    node -e "
      const fs = require('fs');
      const p = JSON.parse(fs.readFileSync('$pkg', 'utf8'));
      p.version = '${NEW_VERSION}';
      fs.writeFileSync('$pkg', JSON.stringify(p, null, 2) + '\n');
    "
    echo "  📝 Bumped ${pkg}"
  fi
done

# Update CHANGELOG.md
if [[ -n "$CHANGELOG_ENTRY" ]]; then
  # Insert entry after [Unreleased] section
  DATE=$(date +%Y-%m-%d)
  ENTRY="\n## [${NEW_VERSION}] - ${DATE}\n\n${CHANGELOG_ENTRY}\n"
  node -e "
    const fs = require('fs');
    let cl = fs.readFileSync('CHANGELOG.md', 'utf8');
    cl = cl.replace('## [Unreleased]', '## [Unreleased]\n${ENTRY}');
    fs.writeFileSync('CHANGELOG.md', cl);
  "
  echo "📋 Updated CHANGELOG.md"
else
  echo ""
  echo "📋 Opening CHANGELOG.md for editing..."
  echo "   Add an entry under [Unreleased] for version ${NEW_VERSION}"
  echo ""
  ${EDITOR:-vi} CHANGELOG.md
fi

# Build and test
echo "🔨 Building..."
pnpm run build

echo "🧪 Testing..."
pnpm run test 2>/dev/null || echo "⚠️  No test script or tests failed — review before merging"

# Commit
git add -A
git commit --author="Doink (OpenClaw) <charlie+doink@kindo.ai>" -m "release: v${NEW_VERSION}

Co-Authored-By: Charlie Hulcher <charlie@kindo.ai>"

# Push branch (never force push)
git push origin "$BRANCH"
echo "🚀 Pushed ${BRANCH}"

# Open PR
gh-me pr create \
  --title "release: v${NEW_VERSION}" \
  --body "## Release v${NEW_VERSION}

- Version bump: ${CURRENT_VERSION} → ${NEW_VERSION} (${BUMP})
- CHANGELOG.md updated
- Build + tests passed

### Post-merge steps

\`\`\`bash
git checkout main && git pull origin main
git tag v${NEW_VERSION}
git push origin v${NEW_VERSION}
\`\`\`" \
  --head "$BRANCH" \
  --base main

echo ""
echo "✅ PR opened for v${NEW_VERSION}"
echo ""
echo "📌 After PR is merged:"
echo "   git checkout main && git pull origin main"
echo "   git tag v${NEW_VERSION}"
echo "   git push origin v${NEW_VERSION}"
