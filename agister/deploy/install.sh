#!/bin/sh
# deploy/install.sh — installs the `agister pages` LaunchAgent.
# Usage: deploy/install.sh
# Every path derives from $HOME; the label is com.igormalyarov.agister-pages.
# Refuses, changing nothing, unless ~/.local/bin/agister is an executable file and no job with
# the label is loaded (`launchctl print gui/<uid>/<label>` fails). Then renders
# launchagent.plist.in with HOME and this shell's PATH, XML-escaped, into
# ~/Library/LaunchAgents/<label>.plist (0644, via a temp file and mv), creates
# ~/Library/Logs/agister (0700) and runs one `launchctl bootstrap gui/<uid> <plist>`.
# Never runs agister. Refusals exit 1 with one `install: …` line on stderr.
# Prints the page URL on success.
set -u
NL='
'
die() { echo "install: $*" >&2; exit 1; }
[ $# = 0 ] || die "usage: install.sh"
case ${HOME:-} in /*) ;; *) die "HOME is not absolute" ;; esac
case $HOME in *"$NL"*) die "HOME holds a newline" ;; esac
LABEL=com.igormalyarov.agister-pages
URL=http://127.0.0.1:7465/
bin=$HOME/.local/bin/agister
agents=$HOME/Library/LaunchAgents
plist=$agents/$LABEL.plist
logdir=$HOME/Library/Logs/agister
here=$(cd "$(dirname "$0")" && pwd) || die "cannot locate the template"
tmpl=$here/launchagent.plist.in
[ -f "$tmpl" ] || die "missing $tmpl"
[ -f "$bin" ] && [ -x "$bin" ] || die "$bin is not an executable file"
uid=$(id -u) || die "cannot read the user id"
! launchctl print "gui/$uid/$LABEL" >/dev/null 2>&1 || die "a job labelled $LABEL is already loaded"

mkdir -p "$agents" || die "cannot create $agents"
tmp=$(mktemp "$agents/.$LABEL.plist.XXXXXX") || die "cannot create a temp file in $agents"
R_HOME=$HOME R_PATH=${PATH:-} awk '
function esc(s) { gsub(/&/, "\\&amp;", s); gsub(/</, "\\&lt;", s); gsub(/>/, "\\&gt;", s); return s }
function sub_all(line, key, val,   out, i) {
	out = ""
	while ((i = index(line, key)) > 0) { out = out substr(line, 1, i - 1) val; line = substr(line, i + length(key)) }
	return out line
}
BEGIN { h = esc(ENVIRON["R_HOME"]); p = esc(ENVIRON["R_PATH"]) }
{ print sub_all(sub_all($0, "@HOME@", h), "@PATH@", p) }
' "$tmpl" > "$tmp" || { rm -f "$tmp"; die "render failed"; }
if command -v plutil >/dev/null 2>&1; then
	plutil -lint -s "$tmp" >/dev/null 2>&1 || { rm -f "$tmp"; die "rendered plist does not lint"; }
fi
chmod 0644 "$tmp" && mv -f "$tmp" "$plist" || { rm -f "$tmp"; die "cannot write $plist"; }
mkdir -p "$HOME/Library/Logs" || die "cannot create $HOME/Library/Logs"
[ -d "$logdir" ] || mkdir -m 0700 "$logdir" || die "cannot create $logdir"
chmod 0700 "$logdir" || die "cannot set $logdir to 0700"

launchctl bootstrap "gui/$uid" "$plist" || die "launchctl bootstrap gui/$uid $plist failed; see $logdir"
echo "agister pages at $URL"
