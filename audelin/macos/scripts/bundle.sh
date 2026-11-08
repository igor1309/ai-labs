#!/bin/sh
# Run from audelin/macos to build the menu bar app.
set -eu

# AUDELIN_SCRATCH_PATH, an absolute path, shares a build directory; CI uses it.
scratch=${AUDELIN_SCRATCH_PATH:-$PWD/App/.build}
swift build --package-path App --scratch-path "$scratch" -c release --product Audelin
app=.build/Audelin.app
rm -rf "$app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
bin=$(swift build --package-path App --scratch-path "$scratch" -c release --show-bin-path)
cp "$bin/Audelin" "$app/Contents/MacOS/Audelin"
cp -R "$bin/Audelin_GlassLedger.bundle" "$app/Contents/Resources/"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
bundle_version=$(printf %s "$stamp" | tr -d TZ)
revision=$(git rev-parse --short HEAD)
dirty=
[ -z "$(git status --porcelain)" ] || dirty=-dirty
build_id="$revision$dirty-$stamp"
cat > "$app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key><string>Audelin</string>
    <key>CFBundleIdentifier</key><string>dev.igor1309.audelin</string>
    <key>CFBundleName</key><string>Audelin</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>CFBundleShortVersionString</key><string>0.1</string>
    <key>CFBundleVersion</key><string>$bundle_version</string>
    <key>AudelinBuildID</key><string>$build_id</string>
    <key>LSMinimumSystemVersion</key><string>26.0</string>
    <key>LSUIElement</key><true/>
    <key>NSMicrophoneUsageDescription</key><string>Audelin записывает вашу сторону звонка.</string>
    <key>NSAudioCaptureUsageDescription</key><string>Audelin записывает сторону собеседника в звонке.</string>
</dict>
</plist>
PLIST

partial=$(mktemp)
trap 'rm -f "$partial"' EXIT
xcrun actool App/AppIcon/Audelin.icon --compile "$app/Contents/Resources" \
    --app-icon Audelin --platform macosx --minimum-deployment-target 26.0 \
    --output-partial-info-plist "$partial"
for key in CFBundleIconName CFBundleIconFile; do
    value=$(/usr/libexec/PlistBuddy -c "Print :$key" "$partial")
    /usr/libexec/PlistBuddy -c "Add :$key string $value" "$app/Contents/Info.plist"
done
codesign --force --options runtime --entitlements App/Audelin.entitlements \
    --sign "${AUDELIN_SIGN_IDENTITY:-Apple Development: Igor Malyarov (W78EER96YQ)}" "$app"
echo "$app"
