---
description: Session self-review — performance, what to improve, and doc/skill changes worth making
---

Based on this session, give your honest take on your own performance.

- What went well, and what could have been done better — and *how*, concretely.
- What docs, skills, or rules might be worth adding or tweaking. For each: name the
  exact file or skill, say *why* it would help, and describe *exactly* what the
  change would be (not vague advice) — including how it would have changed your
  behavior in this session.

Be specific and critical. Prefer naming a concrete file:line, skill, or rule over
generalities.

Be brief. No recap, no praise padding, no hedges. One line per point; drop the
minor ones. Propose at most three changes.

Brevity governs the proposed text too: smallest change that carries the lesson —
a tightened sentence beats a new paragraph, a paragraph beats a new file. Write
the exact replacement text and delete-test each sentence. Don't restate the
surrounding rule to set up your own.

Specificity governs your **analysis**, not the rule text you propose. Keep that
timeless — an instruction, not a changelog. No war stories: not the incident that
taught you, not what it cost, not "observed" or "this is a real failure mode".
State the behavior you want. A date, ticket ID, or symbol name earns a place only
if the reader can *act* on it: a file they can open, a symbol the rule is about.
Not a SHA: off `origin/trunk` nothing survives the next amend or rebase, and on
it a symbol still beats a SHA — it can be grepped. Read the
proposal back a year from now, ticket closed and function renamed; cut whatever
is then wrong or unverifiable.

If a war story is genuinely load-bearing, give it its own place and link it: a
dated research note, or — for a skill — a reference file the skill reads on
demand. Never `SKILL.md`, which is loaded whole every time the skill fires.

Do not make any edits — this is analysis only. If you recommend a change, end by
asking whether to apply it.
