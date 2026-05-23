#!/bin/sh
set -eu

# Install mac-health LaunchAgents and newsyslog rotation config.
#
# Refuses if `terminal-notifier` is not on PATH (per spec dependency rule 1).
#
# Env overrides (intended for tests; defaults match the documented install):
#   MAC_HEALTH_LAUNCHD_DEST   ~/Library/LaunchAgents
#   MAC_HEALTH_NEWSYSLOG_DEST /etc/newsyslog.d
#   MAC_HEALTH_SKIP_ACTIVATE  if non-empty, do not invoke launchctl or sudo
#                             (the substituted plist + newsyslog files are still written)

repo_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
launchd_src="$repo_dir/launchd"
newsyslog_src="$repo_dir/newsyslog"
checks_dir="$repo_dir/checks"

launchd_dest=${MAC_HEALTH_LAUNCHD_DEST:-"$HOME/Library/LaunchAgents"}
newsyslog_dest=${MAC_HEALTH_NEWSYSLOG_DEST:-"/etc/newsyslog.d"}

# 1. Dependency check (spec rule 1, test 15).
if ! command -v terminal-notifier >/dev/null 2>&1; then
    printf 'ERROR: terminal-notifier not found on PATH.\n' >&2
    printf 'Install with: brew install terminal-notifier\n' >&2
    exit 1
fi

# 2. Ensure destination dirs exist.
mkdir -p "$launchd_dest"

# 3. Substitute placeholders and install plists.
installed_labels=""
for plist in "$launchd_src"/*.plist; do
    name=$(basename "$plist")
    target="$launchd_dest/$name"
    label=${name%.plist}
    installed_labels="${installed_labels} ${label}"

    sed -e "s|__CHECKS_DIR__|${checks_dir}|g" \
        -e "s|__HOME__|${HOME}|g" \
        "$plist" >"$target"
done

# 4. (Re)load LaunchAgents unless skipped.
if [ -z "${MAC_HEALTH_SKIP_ACTIVATE:-}" ]; then
    domain="gui/$(id -u)"
    for label in $installed_labels; do
        plist="$launchd_dest/${label}.plist"
        launchctl bootout "${domain}/${label}" 2>/dev/null || true
        launchctl bootstrap "$domain" "$plist"
    done
fi

# 5. Drop newsyslog config (requires sudo unless skipped).
generated_conf=$(mktemp -t mac-health-newsyslog.XXXXXX)
sed -e "s|__HOME__|${HOME}|g" \
    -e "s|__USER__|$(id -un)|g" \
    "$newsyslog_src/mac-health.conf" >"$generated_conf"

if [ -z "${MAC_HEALTH_SKIP_ACTIVATE:-}" ]; then
    printf 'Installing newsyslog config to %s/mac-health.conf (requires sudo)...\n' "$newsyslog_dest"
    sudo install -m 644 "$generated_conf" "$newsyslog_dest/mac-health.conf"
else
    install -m 644 "$generated_conf" "$newsyslog_dest/mac-health.conf"
fi
rm -f "$generated_conf"

printf 'mac-health installed. Log: %s/Library/Logs/mac-health/health.log\n' "$HOME"
