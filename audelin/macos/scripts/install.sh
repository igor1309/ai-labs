#!/bin/sh
# Build Audelin, install it into /Applications, start it at login and open it.
# Run from anywhere; a second run replaces the installed copy.
# --update, as CI runs it: replace the installed copy without quitting a
# running Audelin and without opening it. A running Audelin sees its bundle
# replaced and relaunches itself once idle (AudelinMenu.relaunchAfterUpdate).
set -eu

update=false
case "${1:-}" in
    --update) update=true ;;
    "") ;;
    *) echo "usage: install.sh [--update]" >&2; exit 2 ;;
esac

# A shell left by an agent task can export TMPDIR as a folder since deleted;
# swift build then fails. Use the user's default temp folder instead.
if [ -n "${TMPDIR:-}" ] && [ ! -d "$TMPDIR" ]; then
    TMPDIR=$(getconf DARWIN_USER_TEMP_DIR 2>/dev/null || echo /tmp)
    export TMPDIR
fi

here=$(cd "$(dirname "$0")/.." && pwd)
apps=${AUDELIN_INSTALL_DIR:-/Applications}
agents=${AUDELIN_LAUNCH_AGENTS_DIR:-$HOME/Library/LaunchAgents}
label=dev.igor1309.audelin.login
target="$apps/Audelin.app"
plist="$agents/$label.plist"

cd "$here"
sh scripts/bundle.sh

# Quit a running copy so its bundle can be replaced; give it 10 s to save.
if ! $update && pgrep -x Audelin >/dev/null; then
    pkill -TERM -x Audelin || true
    tries=0
    while pgrep -x Audelin >/dev/null; do
        tries=$((tries + 1))
        if [ "$tries" -gt 20 ]; then
            echo "Audelin did not quit; quit it and run again" >&2
            exit 1
        fi
        sleep 0.5
    done
fi

# Copy beside the old bundle, then swap by rename, so the installed path never
# holds a half-written bundle. A running copy loses its files here and macOS can
# no longer verify its signature, so it must relaunch; it does so once idle.
mkdir -p "$apps"
staged="$apps/.Audelin.app.new"
old="$apps/.Audelin.app.old"
rm -rf "$staged" "$old"
ditto .build/Audelin.app "$staged"
if [ -e "$target" ]; then mv "$target" "$old"; fi
mv "$staged" "$target"
rm -rf "$old"

# A per-user LaunchAgent opens the app at login through Launch Services,
# so macOS attributes microphone and audio-capture access to Audelin.
mkdir -p "$agents"
cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>$label</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/open</string>
        <string>$target</string>
    </array>
    <key>RunAtLoad</key><true/>
</dict>
</plist>
PLIST
plutil -lint "$plist" >/dev/null

# Registering the agent with RunAtLoad would open the app now; open it once
# ourselves instead, and only load the agent for the next login.
domain="gui/$(id -u)"
launchctl bootout "$domain/$label" 2>/dev/null || true
launchctl enable "$domain/$label"

$update || open "$target"
echo "$target"
