#!/bin/sh
# Installs (or with "uninstall" removes) the unattended Zoom AX spike as a LaunchAgent.
set -e
label=dev.igor1309.audelin.zoom-ax-watch
bin="$HOME/Library/Application Support/audelin-zoom-ax/zoom-ax-watch"
plist="$HOME/Library/LaunchAgents/$label.plist"
launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
if [ "$1" = uninstall ]; then rm -f "$plist"; rm -rf "$(dirname "$bin")"; echo removed; exit 0; fi
mkdir -p "$(dirname "$bin")" "$HOME/Library/Logs/audelin-zoom-ax"
swiftc -O "$(dirname "$0")/zoom-ax-watch.swift" -o "$bin"
codesign -s - -f -i "$label" "$bin"
cat > "$plist" <<P
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>$label</string>
<key>ProgramArguments</key><array><string>$bin</string></array>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>StandardErrorPath</key><string>$HOME/Library/Logs/audelin-zoom-ax/agent.err</string>
</dict></plist>
P
launchctl bootstrap "gui/$(id -u)" "$plist"
echo "installed: grant Accessibility to $bin"
