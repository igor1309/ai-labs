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
cp -R "$bin"/Audelin_*.bundle "$app/Contents/Resources/"
# The browser starts this helper to talk to the app; the native host
# installer points Chrome and Yandex Browser at this copy.
swift build -c release --product AudelinNativeHost
host_bin=$(swift build -c release --show-bin-path)
cp "$host_bin/AudelinNativeHost" "$app/Contents/MacOS/audelin-browser-host"
# The build number is trunk's commit count, so each installed update reads
# higher than the last; the About panel names the commit it was built from.
build=$(git rev-list --count HEAD 2>/dev/null || echo 0)
commit=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)
built=$(date +%Y-%m-%d)
cat > "$app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key><string>Audelin</string>
    <key>CFBundleIdentifier</key><string>dev.igor1309.audelin</string>
    <key>CFBundleName</key><string>Audelin</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>CFBundleShortVersionString</key><string>0.1.$build</string>
    <key>CFBundleVersion</key><string>$commit</string>
    <key>NSHumanReadableCopyright</key><string>© 2026 Igor Malyarov · сборка $built</string>
    <key>LSMinimumSystemVersion</key><string>26.0</string>
    <key>LSUIElement</key><true/>
    <key>NSMicrophoneUsageDescription</key><string>Audelin записывает вашу сторону звонка.</string>
    <key>NSAudioCaptureUsageDescription</key><string>Audelin записывает сторону собеседника в звонке.</string>
</dict>
</plist>
PLIST

# The About panel shows Credits.html under the version: what Audelin is and
# where its source lives.
cat > "$app/Contents/Resources/Credits.html" <<'HTML'
<html><head><meta charset="utf-8"></head>
<body style="font: 11px -apple-system; text-align: center">
<p>Запись звонков в два трека, живая расшифровка и заметки после звонка.</p>
<p><a href="https://github.com/igor1309/audelin">github.com/igor1309/audelin</a></p>
</body></html>
HTML

partial=$(mktemp)
trap 'rm -f "$partial"' EXIT
xcrun actool App/AppIcon/Audelin.icon --compile "$app/Contents/Resources" \
    --app-icon Audelin --platform macosx --minimum-deployment-target 26.0 \
    --output-partial-info-plist "$partial"
for key in CFBundleIconName CFBundleIconFile; do
    value=$(/usr/libexec/PlistBuddy -c "Print :$key" "$partial")
    /usr/libexec/PlistBuddy -c "Add :$key string $value" "$app/Contents/Info.plist"
done
identity=${AUDELIN_SIGN_IDENTITY:-Apple Development: Igor Malyarov (W78EER96YQ)}
codesign --force --options runtime --sign "$identity" "$app/Contents/MacOS/audelin-browser-host"
codesign --force --options runtime --entitlements App/Audelin.entitlements \
    --sign "$identity" "$app"
echo "$app"
