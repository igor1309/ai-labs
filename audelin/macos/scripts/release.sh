#!/bin/sh
# Build Audelin signed with Developer ID, notarize and staple it, and publish
# it as a GitHub release of the public igor1309/audelin repository.
# Run from anywhere. Skips when the latest release was built from the same
# app source, so a week with no app change publishes nothing.
#
# Needs: the Developer ID Application certificate in the login keychain, a
# notarytool keychain profile (AUDELIN_NOTARY_PROFILE, default
# audelin-notary; create it once with `xcrun notarytool store-credentials
# audelin-notary`), and GH_TOKEN with contents write on the public repo.
set -eu

repo=${AUDELIN_RELEASE_REPO:-igor1309/audelin}
profile=${AUDELIN_NOTARY_PROFILE:-audelin-notary}
export AUDELIN_SIGN_IDENTITY="${AUDELIN_SIGN_IDENTITY:-Developer ID Application: Igor Malyarov (VRVJ9YNRQU)}"

here=$(cd "$(dirname "$0")/.." && pwd)
cd "$here"

# The last commit that changed what goes into the app.
source=$(git log -1 --format=%h -- App Sources Package.swift Package.resolved Vendor scripts/bundle.sh)
latest=$(gh release view -R "$repo" --json body --jq .body 2>/dev/null || true)
case "$latest" in
    *"Source: $source"*) echo "latest release is already built from $source; nothing to publish"; exit 0 ;;
esac

app=$(sh scripts/bundle.sh | tail -1)
version=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$app/Contents/Info.plist")
tag="v$version"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
ditto -c -k --keepParent "$app" "$work/notarize.zip"
xcrun notarytool submit "$work/notarize.zip" --keychain-profile "$profile" --wait
xcrun stapler staple "$app"
xcrun stapler validate "$app"
spctl --assess --type execute --verbose "$app"

zip="$work/Audelin-$version.zip"
ditto -c -k --keepParent "$app" "$zip"

notes="$work/notes.md"
cat > "$notes" <<NOTES
Audelin $version for macOS 26 or later, signed with Developer ID and notarized.

Download \`Audelin-$version.zip\`, unzip it and move Audelin.app to Applications.

Source: $source
NOTES

gh release create "$tag" "$zip" -R "$repo" --title "Audelin $version" \
    --notes-file "$notes" --latest
echo "published $tag to $repo"
