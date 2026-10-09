#!/usr/bin/env bash
# Release apps/extension if its version has no git tag yet: zip for Chrome
# and Firefox, submit to each store whose credentials are configured, then
# tag the commit and create a GitHub release with the zips attached.
# Store credentials are the publish-browser-extension env vars
# (CHROME_EXTENSION_ID, CHROME_CLIENT_ID, ..., FIREFOX_JWT_SECRET); a store
# is skipped when its extension id is unset.
set -euo pipefail

cd "$(dirname "$0")/../apps/extension"
name="$(node -p 'require("./package.json").name')"
version="$(node -p 'require("./package.json").version')"
tag="$name@$version"

if git ls-remote --exit-code --tags origin "refs/tags/$tag" >/dev/null 2>&1; then
  echo "$tag is already released, nothing to publish."
  exit 0
fi

pnpm zip
pnpm zip:firefox

chrome_zip=".output/animation-grabber-$version-chrome.zip"
firefox_zip=".output/animation-grabber-$version-firefox.zip"
sources_zip=".output/animation-grabber-$version-sources.zip"

submit_args=()
if [[ -n "${CHROME_EXTENSION_ID:-}" ]]; then
  submit_args+=(--chrome-zip "$chrome_zip")
else
  echo "::notice::CHROME_EXTENSION_ID not set, skipping Chrome Web Store."
fi
if [[ -n "${FIREFOX_EXTENSION_ID:-}" ]]; then
  submit_args+=(--firefox-zip "$firefox_zip" --firefox-sources-zip "$sources_zip")
else
  echo "::notice::FIREFOX_EXTENSION_ID not set, skipping Firefox Add-ons."
fi
if ((${#submit_args[@]})); then
  pnpm exec wxt submit "${submit_args[@]}"
fi

git tag "$tag"
git push origin "$tag"

notes="$(awk -v v="$version" '$0 == "## " v { found = 1; next } found && /^## / { exit } found' CHANGELOG.md 2>/dev/null || true)"
gh release create "$tag" --title "$tag" --notes "${notes:-Release $tag}" \
  "$chrome_zip" "$firefox_zip" "$sources_zip"
