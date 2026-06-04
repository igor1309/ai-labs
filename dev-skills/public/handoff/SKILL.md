---
name: handoff
description: >
  Use to hand off ongoing work to a fresh session, or to resume from a handoff in
  a new one — "write a handoff", "hand off this work", "resume", "continue where
  we left off". On write, compacts the conversation (reasoning, decisions,
  dead-ends, next step) into a short doc at a stable per-project path in the OS
  temp dir, artifacts referenced by path not copied. On resume, reads it back.
author: Igor Malyarov
version: "0.3.0"
---

# Handoff

A throwaway checkpoint carrying what lives **only in the conversation** — the goal,
the decisions and why, the dead-ends, the exact next step — so a fresh session
resumes without re-deriving it. Out of the workspace, so nothing to maintain and
nothing to drift.

## Write

- **Stable per-project path in the OS temp dir**, so the next session finds it with
  no prompting: `$TMPDIR/claude-handoff/<slug>.md`, where `<slug>` is the git-root
  path slugified (deterministic and collision-free). One file per project; the
  newest handoff overwrites the last. **Print the path** when done.
- **Reference artifacts by path/URL, never copy** — plans, ADRs, specs, commits,
  diffs. Derivable state (versions, counts, branch status) gets the command to
  derive it, not a transcribed value that rots.
- **Redact secrets** — keys, passwords, tokens, PII.

Include: a conversational **summary** (what this is, where it stands), the **next
step** and how to pick it up, **suggested skills** for the continuation, and — if
an argument is given — shape the handoff toward that focus.

## Resume

In a new session, when the user asks to resume, compute the same per-project path
from the git root, read the handoff there, and continue from it. If none exists,
say so (it may be a different repo, or temp was cleared on reboot).
