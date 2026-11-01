#!/usr/bin/env bash
# install.sh: this Agister, built from this checkout, as the installed
# agister: the binary to ~/.local/bin/agister and home's settings, as
# shipped, into ~/.agister. Each folder and file agister/home has replaces
# ~/.agister's whole, what it replaces first moved under
# ~/.agister/backups/<UTC time>/, so a write is undone by moving them back;
# what ~/.agister has besides, runs and locks among it, is untouched. Run
# it from trunk's checkout after a merge. It stands in for settings/home
# (ADR-008), not yet built: edit agister/home, not home's copy.
set -euo pipefail
shopt -s dotglob nullglob
src=$(cd "$(dirname "$0")/../.." && pwd)
home=$HOME/.agister
# ~/.agister/briefs is the archive's: its home is moved aside before the
# first install, and nothing is changed while it is there.
if [[ -e $home/briefs ]]; then
  echo "install.sh: $home/briefs is the archive's; move $home aside first. Nothing installed." >&2
  exit 1
fi
mkdir -p "$HOME/.local/bin"
(cd "$src" && go build -o "$HOME/.local/bin/agister" ./cmd/agister)
mkdir -p "$home"
replaced=()
for from in "$src/home/"*; do
  name=${from##*/}
  [[ -e $home/$name || -L $home/$name ]] && replaced+=("$name")
done
if (( ${#replaced[@]} > 0 )); then
  backup=$home/backups/$(date -u +%Y-%m-%dT%H-%M-%SZ)
  # An install in the same second fails here, before it moves anything:
  # one backup is never written into by another.
  mkdir -p "$home/backups"
  mkdir "$backup"
  for name in "${replaced[@]}"; do
    mv "$home/$name" "$backup/$name"
  done
fi
for from in "$src/home/"*; do
  cp -R "$from" "$home/"
done
# The launch agent that keeps agister pages serving at 127.0.0.1:7465,
# over the binary just built. Paths are escaped for XML; the new plist is
# checked before it replaces the old one or the running agent is unloaded.
xml() { sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' -e 's/"/\&quot;/g' <<<"$1"; }
label=com.igormalyarov.agister-pages
agents=$HOME/Library/LaunchAgents
plist=$agents/$label.plist
logs=$HOME/Library/Logs/agister
mkdir -p "$agents" "$logs"
staged=$(mktemp "$agents/.$label.XXXXXX")
trap 'rm -f "$staged"' EXIT
cat > "$staged" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key><string>$label</string>
	<key>ProgramArguments</key>
	<array><string>$(xml "$HOME/.local/bin/agister")</string><string>pages</string><string>--no-open</string></array>
	<key>RunAtLoad</key><true/>
	<key>KeepAlive</key><true/>
	<key>StandardOutPath</key><string>$(xml "$logs/pages.out.log")</string>
	<key>StandardErrorPath</key><string>$(xml "$logs/pages.err.log")</string>
</dict>
</plist>
PLIST
plutil -lint -s "$staged"
chmod 644 "$staged"
mv "$staged" "$plist"
launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$plist"
echo "agister at $(git -C "$src" rev-parse --short HEAD)"
