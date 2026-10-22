#!/bin/sh
# Builds Audelin.app from the package's release build: the Audelin
# executable plus an Info.plist that keeps it in the menu bar only.
# Run from audelin/macos: sh scripts/bundle.sh  ->  .build/Audelin.app
set -eu

swift build -c release --product Audelin
app=.build/Audelin.app
rm -rf "$app"
mkdir -p "$app/Contents/MacOS"
cp "$(swift build -c release --show-bin-path)/Audelin" "$app/Contents/MacOS/Audelin"
cat > "$app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key><string>Audelin</string>
    <key>CFBundleIdentifier</key><string>audelin.Audelin</string>
    <key>CFBundleName</key><string>Audelin</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>CFBundleShortVersionString</key><string>0.1</string>
    <key>CFBundleVersion</key><string>1</string>
    <key>LSMinimumSystemVersion</key><string>14.0</string>
    <key>LSUIElement</key><true/>
</dict>
</plist>
PLIST
codesign --force --sign - "$app"
echo "$app"
