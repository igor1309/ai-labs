---
date: 2026-07-23
model: claude-opus-4-8
description: "When a subagent dies mid-step, preserve its working tree — never git reset --hard a dead agent's diff"
---

# Subagent Death Recovery

When a subagent dies mid-step (session/quota limit, model outage, teardown,
process exit) it leaves an uncommitted working tree. **That diff is owed to the
user — preserve it in place. Never `git reset --hard` a dead agent's work.**

- **Default: leave the working tree dirty and respawn pointed at it.** The
  replacement agent reads/continues the in-progress diff. No reset, no wipe.
- **If you must get a clean base** (e.g. the code moved under the WIP so it is a
  *reference* not a *continuation*): `git stash push -m "<task> WIP (reference)"`
  and/or stamp a ref (`git update-ref refs/rescue/<slug> $(git stash create)`),
  then point the new agent at the stash/ref to mine. Only after it is safely
  captured may you clean the tree — and say so.
- **Agent death is not a reason to discard work.** The instinct to reset-and-
  respawn-clean is wrong; it treats a large, human-reviewable diff as disposable.
  Reviewing the dead agent's partial code is often valuable in itself (a real
  session caught an architecture issue in never-committed WIP this way).
- **On the first session-limit death, de-risk the rest immediately:** shrink
  remaining step size and tell every subsequent spawn to "commit the moment gates
  pass; if interrupted, prioritize a committable green state." Do not wait for a
  second death to add this.
- **When you do delete recovery refs/stashes** (backup, rescue, WIP), delete only
  after the work is superseded by committed green code, resolve stash indices
  precisely (they shift), and report exactly what was removed.

Related: [[worktrees]] rescue-ref discipline; [[subagent-step-sizing]] for sizing
steps so a mid-step death costs less unverified tree.
