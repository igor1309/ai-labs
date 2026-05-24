#!/bin/sh
set -eu

# Uninstall mac-health LaunchAgents. The newsyslog config under /etc/newsyslog.d
# is left in place by default (it's harmless once the log file stops being
# appended to) — pass --remove-newsyslog to remove it as well.
#
# Env overrides:
#   MAC_HEALTH_LAUNCHD_DEST   ~/Library/LaunchAgents
#   MAC_HEALTH_NEWSYSLOG_DEST /etc/newsyslog.d
#   MAC_HEALTH_SKIP_ACTIVATE  if non-empty, do not invoke launchctl or sudo

remove_newsyslog=no
if [ "${1:-}" = "--remove-newsyslog" ]; then
    remove_newsyslog=yes
fi

launchd_dest=${MAC_HEALTH_LAUNCHD_DEST:-"$HOME/Library/LaunchAgents"}
newsyslog_dest=${MAC_HEALTH_NEWSYSLOG_DEST:-"/etc/newsyslog.d"}

domain="gui/$(id -u)"
for plist in "$launchd_dest"/com.user.mac-health.*.plist; do
    [ -f "$plist" ] || continue
    label=$(basename "$plist" .plist)
    if [ -z "${MAC_HEALTH_SKIP_ACTIVATE:-}" ]; then
        launchctl bootout "${domain}/${label}" 2>/dev/null || true
    fi
    rm -f "$plist"
done

if [ "$remove_newsyslog" = yes ]; then
    if [ -z "${MAC_HEALTH_SKIP_ACTIVATE:-}" ]; then
        printf 'Removing newsyslog config (requires sudo)...\n'
        sudo rm -f "$newsyslog_dest/mac-health.conf"
    else
        rm -f "$newsyslog_dest/mac-health.conf"
    fi
fi

printf 'mac-health uninstalled.\n'
