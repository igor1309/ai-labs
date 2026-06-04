---
name: handoff
description: >
  Use to hand off ongoing work to a fresh session, or to resume from a handoff in
  a new one — "write a handoff", "hand off this work", "resume", "continue where
  we left off". On write, compacts the conversation (reasoning, decisions,
  dead-ends, next step) into a short doc under a per-project name in the OS temp
  dir, artifacts referenced by path not copied. On resume, reads the newest back.
author: Igor Malyarov
version: "0.3.1"
---

# Handoff

A throwaway checkpoint carrying what lives **only in the conversation** — the goal,
the decisions and why, the dead-ends, the exact next step — so a fresh session
resumes without re-deriving it. Out of the workspace, so nothing to maintain and
nothing to drift; it lives in temp, and a reboot wiping it is fine.

## Write

- **In the OS temp dir, under a per-project name** so the next session finds it
  with no prompting: `$TMPDIR/handoff/<slug>-<id>.md`, where `<slug>` is the
  git-root path slugified and `<id>` is 6 characters from a UUID. Each handoff is
  its own file; **print the path** when done.
- **Reference artifacts by path/URL, never copy** — plans, ADRs, specs, commits,
  diffs. Derivable state (versions, counts, branch status) gets the command to
  derive it, not a transcribed value that rots.
- **Redact secrets** — keys, passwords, tokens, PII.

Include: a conversational **summary** (what this is, where it stands), the **next
step** and how to pick it up, **suggested skills** for the continuation, and — if
an argument is given — shape the handoff toward that focus.

## Resume

In a new session, when the user asks to resume, glob `$TMPDIR/handoff/<slug>-*.md`
for this repo's slug and read the **newest**. If none exists, say so.
