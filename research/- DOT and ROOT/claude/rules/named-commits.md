---
date: 2026-08-04
model: unknown
description: "Reading a commit you are pointed at — read the post-image of every file it touched, not its diff"
---

# Reading a Commit You Are Pointed At

When the user names a commit ("make sure you read `abc1234`"), the commit is a
**pointer to rules that are now in force**, not a changelog to skim. Read the
**post-image of every file it touched** (`git show <sha>:<path>`, or open the
file at HEAD) — not just `git show <sha>`.

A diff shows the delta; the rule lives in the whole file. Applying only the
added hunks means obeying the two lines that changed and staying blind to the
ten that were already there. Observed 2026-08-04: a commit tightening
`config-static-instances` was read as a diff, its two new bullets were honored,
and the rest of the skill was never opened — the skill itself had never been
invoked at all.

Corollary — **skill triggers fire on what you are about to write, not on what
the always-loaded config happens to mandate.** If you are typing the words a
skill's `description` lists as triggers ("preview config", "state machine",
"maestro flow"), that skill applies, whether or not `AGENTS.md` names it and
whether or not a path-scoped rule auto-injected it. Auto-injection is a
convenience, not the gate.
