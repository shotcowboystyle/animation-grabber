#!/usr/bin/env bash
# Publish apps/cli to npm if its version is not on the registry yet, then
# tag the commit and create a GitHub release from the CHANGELOG entry.
# npm publish (not pnpm) so trusted publishing (OIDC) handles auth.
set -euo pipefail

cd "$(dirname "$0")/../apps/cli"
name="$(node -p 'require("./package.json").name')"
version="$(node -p 'require("./package.json").version')"
tag="$name@$version"

if npm view "$tag" version >/dev/null 2>&1; then
  echo "$tag is already on npm, nothing to publish."
  exit 0
fi

# pnpm pack rewrites workspace: specifiers to real versions.
pnpm pack --out package.tgz
npm publish package.tgz --access public

git tag "$tag"
git push origin "$tag"

notes="$(awk -v v="$version" '$0 == "## " v { found = 1; next } found && /^## / { exit } found' CHANGELOG.md)"
gh release create "$tag" --title "$tag" --notes "${notes:-Release $tag}"
