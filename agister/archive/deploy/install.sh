#!/bin/sh
# deploy/install.sh — installs the `agister pages` LaunchAgent.
# Usage: deploy/install.sh
# Every path derives from $HOME; the label is com.igormalyarov.agister-pages.
# Refuses, changing nothing, unless ~/.local/bin/agister is an executable file and no job with
# the label is loaded (`launchctl print gui/<uid>/<label>` fails). Then renders
# launchagent.plist.in with HOME and this shell's PATH, XML-escaped, in one pass, sets up
# ~/Library/Logs/agister (0700), writes ~/Library/LaunchAgents/<label>.plist (0644, via a
# temp file and mv) and runs one `launchctl bootstrap gui/<uid> <plist>`. If bootstrap fails,
# the previous plist is restored, or the new one removed if there was none.
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
fail() { rm -f "$tmp"; die "$*"; }
R_HOME=$HOME R_PATH=${PATH:-} awk '
function esc(s) { gsub(/&/, "\\&amp;", s); gsub(/</, "\\&lt;", s); gsub(/>/, "\\&gt;", s); return s }
# One pass: an inserted value is never scanned again.
function render(line,   out, tok) {
	out = ""
	while (match(line, /@(HOME|PATH)@/)) {
		tok = substr(line, RSTART, RLENGTH)
		out = out substr(line, 1, RSTART - 1) (tok == "@HOME@" ? h : p)
		line = substr(line, RSTART + RLENGTH)
	}
	return out line
}
BEGIN { h = esc(ENVIRON["R_HOME"]); p = esc(ENVIRON["R_PATH"]) }
{ print render($0) }
' "$tmpl" > "$tmp" || fail "render failed"
if command -v plutil >/dev/null 2>&1; then
	plutil -lint -s "$tmp" >/dev/null 2>&1 || fail "rendered plist does not lint"
fi
mkdir -p "$HOME/Library/Logs" 2>/dev/null || fail "cannot create $HOME/Library/Logs"
[ -d "$logdir" ] || mkdir -m 0700 "$logdir" 2>/dev/null || fail "cannot create $logdir"
chmod 0700 "$logdir" 2>/dev/null || fail "cannot set $logdir to 0700"

prev=
if [ -e "$plist" ]; then
	prev=$(mktemp "$agents/.$LABEL.plist.prev.XXXXXX") || fail "cannot create a temp file in $agents"
	cp -p "$plist" "$prev" || { rm -f "$prev"; fail "cannot back up $plist"; }
fi
chmod 0644 "$tmp" && mv -f "$tmp" "$plist" || { rm -f "$prev"; fail "cannot write $plist"; }

if ! launchctl bootstrap "gui/$uid" "$plist"; then
	if [ -n "$prev" ]; then
		mv -f "$prev" "$plist" || die "launchctl bootstrap gui/$uid $plist failed; cannot restore the previous plist from $prev"
		die "launchctl bootstrap gui/$uid $plist failed; previous plist restored; see $logdir"
	fi
	rm -f "$plist" || die "launchctl bootstrap gui/$uid $plist failed; cannot remove $plist"
	die "launchctl bootstrap gui/$uid $plist failed; plist removed; see $logdir"
fi
[ -z "$prev" ] || rm -f "$prev"
echo "agister pages at $URL"
