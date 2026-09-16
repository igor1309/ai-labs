---
date: 2026-08-21
model: claude-opus-5
description: "Citing commits in durable docs — only trunk SHAs identify anything; cite the symbol instead"
---

# Citing Commits in Docs

**Only a SHA that is an ancestor of `trunk`/`main` is a referenceable identifier.
Never cite one from a `feature/`, `fix/` or any other topic branch.** That
history is mutable for its entire life — commits are squashed, reordered,
amended and rebased whenever the author tidies up — so the reference already
fails to identify anything the moment you write it down, and it degrades
*silently*: nothing resolves a dangling SHA, and no reader can tell a rewritten
one from a typo. Cite the symbol or file instead.

Check before citing:

```bash
git merge-base --is-ancestor <sha> origin/trunk   # exit 0 = safe to cite
```

This governs durable prose — docs, ADRs, research notes, grounding files,
handoffs, tickets, commit-message bodies that outlive the branch. Naming a SHA in
conversation, or in a command you are about to run against the branch you are on,
is fine; it is not being persisted as a reference.

Invoke the **doc-discipline** dev-skill for what to cite instead. Related:
[[named-commits]] for reading a commit you are pointed at.
