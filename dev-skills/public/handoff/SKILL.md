---
name: handoff
description: >
  Use when handing off ongoing work to a fresh agent or session — "write a
  handoff", "hand off this work", "doc to resume next session", "/handoff".
  Compacts the current conversation into a short handoff doc written to the OS
  temp dir (not the workspace): the reasoning and state that live only in this
  chat, with artifacts referenced by path rather than copied. An optional
  argument names what the next session is for.
author: Igor Malyarov
version: "0.2.0"
---

# Handoff

Compact the current conversation into a handoff a fresh agent can resume from.
Capture what lives **only in this chat** — the goal, the decisions and why, the
dead-ends, and the exact next step — not what is already on disk.

## Write it

- **To the OS temp directory, not the workspace** (e.g. under `$TMPDIR`). A handoff
  is a throwaway checkpoint; keeping it out of the repo means nothing to maintain
  and nothing to drift.
- **Reference artifacts by path/URL, never copy them** — plans, ADRs, specs,
  issues, commits, diffs. State that is derivable (versions, counts, branch status)
  gets the command to derive it, not a transcribed value that rots.
- **Redact secrets** — API keys, passwords, tokens, PII.

## Include

- **Summary** — what this work is and where it stands, conversationally.
- **Next step** — the in-flight task and how to pick it back up.
- **Suggested skills** — the skills the next session will likely need.
- **Argument** — if one is given, treat it as the next session's focus and shape
  the handoff toward it.
