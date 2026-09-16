---
date: 2026-06-11
model: claude-fable-5
description: "Commit message style — short, imperative, lowercase, ticket identifiers"
---

# COMMIT

Commit messages are short, imperative, lowercase. Include ticket identifiers when relevant.

Do not pollute commit messages with `TDD: Red → Green → Commit` junk.

No trailers — no `Claude-Session:`, no `Co-Authored-By:`, no machine attribution.

## Before Committing
Run `git status` and inspect the working tree first. Stage only the files you changed by explicit path — never `git add -A` or `git add -u`. If unexpected modifications exist, stop and ask rather than inferring a concurrent actor.
