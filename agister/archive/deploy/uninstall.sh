#!/bin/sh
# deploy/uninstall.sh — removes the `agister pages` LaunchAgent install.sh made.
# Usage: deploy/uninstall.sh
# Every path derives from $HOME; the label is com.igormalyarov.agister-pages. A loaded job gets
# one `launchctl bootout gui/<uid>/<label>`; then ~/Library/LaunchAgents/<label>.plist is
# removed. The logs in ~/Library/Logs/agister and ~/.local/bin/agister are left. With nothing
# installed it succeeds. Refusals exit 1 with one `uninstall: …` line on stderr.
set -u
die() { echo "uninstall: $*" >&2; exit 1; }
[ $# = 0 ] || die "usage: uninstall.sh"
case ${HOME:-} in /*) ;; *) die "HOME is not absolute" ;; esac
LABEL=com.igormalyarov.agister-pages
plist=$HOME/Library/LaunchAgents/$LABEL.plist
uid=$(id -u) || die "cannot read the user id"
job=gui/$uid/$LABEL
if launchctl print "$job" >/dev/null 2>&1; then
	launchctl bootout "$job" || die "launchctl bootout $job failed; $plist left in place"
fi
rm -f "$plist" || die "cannot remove $plist"
echo "uninstalled $LABEL"
