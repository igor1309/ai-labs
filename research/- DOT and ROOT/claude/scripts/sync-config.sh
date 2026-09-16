#!/bin/bash
#
# Auto-backup the curated ~/.claude config to its git remote (claude-config).
#
# Safe to run unattended on a timer:
#   - The allowlist .gitignore guarantees `git add -A` can only ever stage the
#     curated config (commands/, rules/, scripts/, CLAUDE.md, statusline.sh) —
#     credentials, transcripts, and settings can never be committed.
#   - The no-op guard skips empty commits, so a quiet hour costs nothing.
#   - GIT_TERMINAL_PROMPT=0 makes a missing credential fail fast instead of
#     hanging headless waiting for input.
#
# Driven by ~/Library/LaunchAgents/com.igormalyarov.claude-config-backup.plist.

set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export GIT_TERMINAL_PROMPT=0

REPO="$HOME/.claude"
cd "$REPO"

# Pull first so config edited on another machine doesn't cause a rejected push.
git pull --rebase --autostash -q origin trunk || true

git add -A
if git diff --cached --quiet; then
    exit 0   # nothing changed — no empty commit
fi

git commit -q -m "backup: $(date '+%Y-%m-%d %H:%M')"
git push -q origin trunk
