#!/usr/bin/env bash
set -euo pipefail

readonly REQUIRED_TEAM_ID="VRVJ9YNRQU"
readonly BUNDLE_ID="foliotell.FolioTell"
readonly SCHEME="FolioTell"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_PATH="$PROJECT_DIR/FolioTell.xcodeproj"
EXPORT_OPTIONS_PLIST="$PROJECT_DIR/Config/TestFlightExportOptions.plist"
RELEASE_TOML="$PROJECT_DIR/release.toml"
BUILD_ROOT="${FOLIOTELL_BUILD_ROOT:-$PROJECT_DIR/build/testflight}"
ARCHIVE_PATH="${FOLIOTELL_ARCHIVE_PATH:-$BUILD_ROOT/FolioTell.xcarchive}"
EXPORT_PATH="${FOLIOTELL_EXPORT_PATH:-$BUILD_ROOT/export}"
MARKETING_VERSION="${FOLIOTELL_VERSION:-$(sed -n 's/^version = "\(.*\)"$/\1/p' "$RELEASE_TOML")}"
BUILD_NUMBER="${FOLIOTELL_BUILD_NUMBER:-$(git -C "$PROJECT_DIR" rev-list --count HEAD)}"
TEAM_ID="${FOLIOTELL_TEAM_ID:-$REQUIRED_TEAM_ID}"
PROVIDER_ID="${FOLIOTELL_PROVIDER_ID:-$TEAM_ID}"
API_KEY_ID="${FOLIOTELL_ASC_API_KEY_ID:-${ASC_API_KEY_ID:-}}"
API_ISSUER_ID="${FOLIOTELL_ASC_API_ISSUER_ID:-${ASC_API_ISSUER_ID:-}}"
API_KEY_PATH="${FOLIOTELL_ASC_API_KEY_PATH:-${ASC_API_KEY_PATH:-}}"

MODE="upload"
DRY_RUN=0

usage() {
  cat <<USAGE
Usage: $(basename "$0") [--upload|--archive-only|--export-only|--validate-only] [--dry-run]

Builds FolioTell for TestFlight using Apple team/provider $REQUIRED_TEAM_ID.

Environment:
  FOLIOTELL_TEAM_ID              Optional; must be $REQUIRED_TEAM_ID when set.
  FOLIOTELL_PROVIDER_ID          Optional; must be $REQUIRED_TEAM_ID when set.
  FOLIOTELL_VERSION              Marketing version. Default: $MARKETING_VERSION
  FOLIOTELL_BUILD_NUMBER         Build number. Default: git commit count.
  FOLIOTELL_BUILD_ROOT           Output root. Default: foliotell/build/testflight
  FOLIOTELL_ASC_API_KEY_ID       App Store Connect API key id. Required for upload.
  FOLIOTELL_ASC_API_ISSUER_ID    App Store Connect API issuer id. Required for upload.
  FOLIOTELL_ASC_API_KEY_PATH     Path to AuthKey_<key id>.p8. Required for upload.

Modes:
  --upload         Archive, export an IPA, then upload it to App Store Connect.
  --archive-only   Create the signed archive only.
  --export-only    Export an IPA from an existing archive, then upload it.
  --validate-only  Validate configuration and required tools, then exit.
  --dry-run        Print commands instead of running them.
USAGE
}

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

run() {
  printf '+'
  printf ' %q' "$@"
  printf '\n'
  if [[ "$DRY_RUN" == 0 ]]; then
    "$@"
  fi
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

require_exact_team() {
  [[ "$TEAM_ID" == "$REQUIRED_TEAM_ID" ]] || die "FolioTell must use Apple team $REQUIRED_TEAM_ID; got FOLIOTELL_TEAM_ID=$TEAM_ID"
  [[ "$PROVIDER_ID" == "$REQUIRED_TEAM_ID" ]] || die "FolioTell must use App Store Connect provider $REQUIRED_TEAM_ID; got FOLIOTELL_PROVIDER_ID=$PROVIDER_ID"
}

require_api_key() {
  [[ -n "$API_KEY_ID" ]] || die "FOLIOTELL_ASC_API_KEY_ID or ASC_API_KEY_ID is required for upload"
  [[ -n "$API_ISSUER_ID" ]] || die "FOLIOTELL_ASC_API_ISSUER_ID or ASC_API_ISSUER_ID is required for upload"
  [[ -n "$API_KEY_PATH" ]] || die "FOLIOTELL_ASC_API_KEY_PATH or ASC_API_KEY_PATH is required for upload"
  [[ -f "$API_KEY_PATH" ]] || die "App Store Connect API key file does not exist: $API_KEY_PATH"
}

ipa_path() {
  find "$EXPORT_PATH" -maxdepth 1 -type f -name '*.ipa' -print -quit
}

archive() {
  run xcodebuild archive \
    -project "$PROJECT_PATH" \
    -scheme "$SCHEME" \
    -configuration Release \
    -destination "generic/platform=iOS" \
    -archivePath "$ARCHIVE_PATH" \
    DEVELOPMENT_TEAM="$REQUIRED_TEAM_ID" \
    PRODUCT_BUNDLE_IDENTIFIER="$BUNDLE_ID" \
    MARKETING_VERSION="$MARKETING_VERSION" \
    CODE_SIGNING_ALLOWED=NO \
    CURRENT_PROJECT_VERSION="$BUILD_NUMBER"
}

export_ipa() {
  run rm -rf "$EXPORT_PATH"
  run mkdir -p "$EXPORT_PATH"
  run xcodebuild -exportArchive \
    -archivePath "$ARCHIVE_PATH" \
    -exportPath "$EXPORT_PATH" \
    -exportOptionsPlist "$EXPORT_OPTIONS_PLIST" \
    -allowProvisioningUpdates \
    -authenticationKeyPath "$API_KEY_PATH" \
    -authenticationKeyID "$API_KEY_ID" \
    -authenticationKeyIssuerID "$API_ISSUER_ID"
}

upload_ipa() {
  local ipa
  if [[ "$DRY_RUN" == 1 ]]; then
    ipa="$EXPORT_PATH/FolioTell.ipa"
  else
    ipa="$(ipa_path)"
    [[ -n "$ipa" ]] || die "no IPA found in $EXPORT_PATH"
  fi

  # Classic altool (Xcode 16.x) only understands the documented --apiKey /
  # --apiIssuer flags and discovers the key via ~/.appstoreconnect/private_keys;
  # team pinning stays enforced by signing (DEVELOPMENT_TEAM) and export options.
  run mkdir -p "$HOME/.appstoreconnect/private_keys"
  run cp "$API_KEY_PATH" "$HOME/.appstoreconnect/private_keys/AuthKey_${API_KEY_ID}.p8"
  run xcrun altool --upload-app \
    -f "$ipa" \
    -t ios \
    --apiKey "$API_KEY_ID" \
    --apiIssuer "$API_ISSUER_ID"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      usage
      exit 0
      ;;
    --upload)
      MODE="upload"
      ;;
    --archive-only)
      MODE="archive-only"
      ;;
    --export-only)
      MODE="export-only"
      ;;
    --validate-only)
      MODE="validate-only"
      ;;
    --dry-run)
      DRY_RUN=1
      ;;
    *)
      die "unknown argument: $1"
      ;;
  esac
  shift
done

require_exact_team
require_command git
require_command xcodebuild
require_command xcrun
[[ -d "$PROJECT_PATH" ]] || die "missing project: $PROJECT_PATH"
[[ -f "$EXPORT_OPTIONS_PLIST" ]] || die "missing export options: $EXPORT_OPTIONS_PLIST"
[[ -n "$MARKETING_VERSION" ]] || die "missing FolioTell version; set FOLIOTELL_VERSION or update $RELEASE_TOML"

case "$MODE" in
  archive-only)
    require_api_key
    archive
    ;;
  export-only)
    require_api_key
    export_ipa
    upload_ipa
    ;;
  upload)
    require_api_key
    archive
    export_ipa
    upload_ipa
    ;;
  validate-only)
    require_api_key
    printf 'FolioTell TestFlight configuration is valid for team/provider %s and bundle id %s.\n' "$REQUIRED_TEAM_ID" "$BUNDLE_ID"
    ;;
  *)
    die "unsupported mode: $MODE"
    ;;
esac
