#!/bin/sh
# Run from audelin/macos to build the menu bar app.
set -eu

swift build --package-path App -c release --product Audelin
app=.build/Audelin.app
rm -rf "$app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
bin=$(swift build --package-path App -c release --show-bin-path)
cp "$bin/Audelin" "$app/Contents/MacOS/Audelin"
cp -R "$bin/Audelin_GlassLedger.bundle" "$app/Contents/Resources/"
cat > "$app/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key><string>Audelin</string>
    <key>CFBundleIdentifier</key><string>dev.igor1309.audelin</string>
    <key>CFBundleName</key><string>Audelin</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>CFBundleShortVersionString</key><string>0.1</string>
    <key>CFBundleVersion</key><string>1</string>
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
