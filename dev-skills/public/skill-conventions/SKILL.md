---
name: skill-conventions
author: Igor Malyarov
version: "2.0.0"
description: Conventions for building, organizing, reviewing, and improving agent skills — the knowledge/rules/procedure taxonomy, the "hook enforces, skill explains, script executes" pattern, folder shape (scripts/references/backlog/adr), frontmatter gates, and a ten-axis quality review. Use when adding a new skill, auditing or improving an existing one, deciding whether a piece of automation belongs in a hook, a script, or prose, or refactoring a skill library. Triggers on "new skill", "skill conventions", "review skill", "is this skill effective", "improve the skill description", "skills audit", "where should this rule live".
---

**Announce:** "I'm using the skill-conventions skill."

# Skill Conventions

How agent skills are organized, authored, and improved — and how to improve one
without just adding more prose.

## Modes

Pick by what was asked; they use the same conventions from opposite directions.

- **Authoring / improving** — the sections below define the shape a skill must
  have. Edit freely when the user asked for a change.
- **Reviewing** — read `references/review-method.md` when auditing an existing
  skill or a collection: the ten evaluation axes, the findings format, and the
  behavioral dry-run. A review **reports findings and a change plan; it does
  not mutate files** unless implementation was explicitly requested.

## Philosophy

Modern agents are highly capable reasoners. Skills should provide context the agent DOESN'T already have — project-specific knowledge, non-obvious conventions, fragile sequences. They should NOT explain general concepts, babysit through obvious steps, or micromanage decisions the agent can make better in context.

**The deletion test:** if you removed a sentence and the agent would still do the right thing, that sentence is noise.

**The preservation test:** if a section contains specific values (country codes, error strings, exact enum cases, character pairs, file paths), assume it encodes a debugging discovery until proven otherwise. Domain knowledge looks like noise to outsiders — the author had a reason. Your job is to find it or ask, not assume it's absent.

**Provenance values:** before flagging a recorded provenance value (model name, author, date) as incorrect, verify what actually produced the artifact — git authorship, run logs — or mark it "ask user". A value you cannot attribute is ambiguous evidence, not a defect.

## Three kinds of skill

| Kind | What it does | Definition of done |
|---|---|---|
| **Knowledge** | Explains how a subsystem works so the agent navigates it correctly | None — it informs, it doesn't execute. Kept accurate via retros. |
| **Rules** | Constrains how code is written | The diff conforms; checked at the project's code-review gate. |
| **Procedure** | Drives a tool or multi-step process | **Must state an explicit DoD**: the artifact or check that proves the run completed — no artifact, no checkmark. |

A skill missing its DoD gets that gap recorded in its `backlog/dod.md` until fixed.

## A skill is how-to, not a log or backlog

A SKILL.md holds **timeless how-to knowledge**: what the thing is, when to use
it, how to use it, the gotchas. It is **not a log** (what was done, when), **not
a backlog** (what's next), and **not a provenance trail** (what was verified, on
what date). Those live elsewhere in the skill's own folder:

- open items / what's next → `backlog/`
- dated trials, verification provenance, "promoted from trial" → a `research/`
  note, referenced from SKILL.md by a lean pointer
- architecture / design decisions for the skill itself (a restructure, a fold,
  a boundary ruling) and their migration plans → `adr/`
- dated "verified on <date>" tags and war-stories → keep them out; they age
  badly and read as stale

Litmus: if a sentence describes history or future work rather than how to use the
thing now, it does not belong in SKILL.md.

## The pattern: hook enforces, skill explains, script executes

The strongest skills stand on three legs:

- **Hook enforces** — a PreToolUse guard in `.claude/hooks/` (registered via
  `.claude/settings.json`) denies commands that violate the mechanical rules.
  The agent cannot forget what the hook remembers. Hooks must be defensive:
  internal failure → pass-through, never block unrelated calls.
- **Skill explains** — SKILL.md carries the judgment a hook can't encode:
  when to act, why the rules exist, recovery paths, gotchas, and what the
  hook will deny (so a denial is self-explaining).
- **Script executes** — `<skill>/scripts/` turns a fixed recipe into one
  command, so the agent stops re-deriving the same steps every run.

When improving a skill, add the missing leg instead of more prose:

- The agent re-derives the same command sequence on every run → **script it**.
- A mistake is mechanical and costly (wipes state, wastes 15 minutes) →
  **hook it**.
- The decision needs judgment, context, or user confirmation → **prose**, with
  the judgment criteria spelled out.

Duplication is a smell: when the same logic lives in both prose and a hook
(or two scripts), extract a shared script both call — single source of truth.

A complementary routing layer: `.claude/rules/` holds path-scoped pointers that
send a file edit to the skill that governs it. **Rules point, hooks enforce** —
a rule is for "remember to consult X", a hook for "never allow Y".

## Scripts

- Live in `<skill>/scripts/`, executable, with a usage line.
- Prefer flag arguments over env vars: a leading `VAR=…` assignment stops the
  command from matching a `Bash(<script>:*)` allow-rule and prompts every run.
- Print machine-readable output the agent can quote as evidence — a script
  that produces the artifact for a DoD checkmark pays for itself twice.
- **Fail loud, fail visible.** A script that hits an unhandled case exits
  non-zero with a one-line, actionable cause — never a silent wrong result.
  Equally important: a script failure the agent then works around by hand must
  be **surfaced to the user**, not laundered into a clean-looking success. A
  deterministic step that silently falls back to manual is the worst failure
  mode — every run "passes," so the broken script never gets fixed.
- **Mechanical breadcrumb.** Where the agent's own report can't be trusted to
  mention a fallback (a weaker model may mishandle *and* under-report the same
  failure), the script itself appends its exit status to a run-log, and the
  skill's gate/report echoes it. The failure record then exists whether or not
  the agent narrates it. Make "script failure surfaced" a **DoD criterion** of
  any skill that drives scripts.

## Folder shape

Group supporting files by role; the directory name is the type tag that encodes
each file's loading contract, and flat siblings erase that signal.

| Bucket | Contract |
|---|---|
| `scripts/` | Executable — the agent runs it |
| `references/` | Read-on-demand doc, linked from SKILL.md behind an explicit "read this when X" condition |
| `assets/` | Inert resource — templates, fixtures, images |
| `backlog/` | Open work on the skill itself |
| `research/` | Dated trials and verification provenance |
| `adr/` | Decisions about the skill's own shape |

`SKILL.md` plus one or two loose siblings is fine — bucketing becomes a
requirement, not a preference, once a skill carries more than a couple of
supporting files.

### backlog/

- `backlog/dod.md` — definition-of-done gaps for the skill.
- `backlog/backlog.md` — other open items, kept in one file when they are
  several connected items.
- `backlog/<topic>.md` — a focused initiative's items.

(A flat `<skill>/backlog.md` or `TODO.md` predates this layout and is equivalent.)

Append new items with the date/source of the review or ticket that produced
them; when an item ships, fold the durable parts into SKILL.md and remove the
item — a backlog is open work, not history.

Promotion path: research notes *recommend*; only real tickets or standing user
practice *promote* a rule into a skill.

### adr/

When a skill is restructured (a fold, a split, a boundary ruling), the decision
lives in `<skill>/adr/<name>.md` — distinct from `backlog/` (open work) and
`research/` (trials/provenance). It records decision, status, invariants,
consequences, and provenance.

An ADR is a **record of why the shape is what it is** — not a log, not an
inventory, not a handoff. SKILL.md still leads with current usage; the `adr/`
explains the rationale. The execution plan that carries the ADR out (the
dependency-ordered, one-commit-per-step migration) is **transient**: while it
runs it can sit beside the ADR, but once executed it is removed, and any
still-open item moves to `backlog/` — the forward-looking place. The ADR does
not accumulate completion status. Grep filters that exclude history (`backlog/`,
`research/`) exclude `adr/` too.

## Frontmatter and hygiene

Objective gates — a skill that fails one is broken, not merely improvable:

- `description` present and non-empty — clients **skip** a skill without it.
  It states what the skill does, when to use it, and its trigger phrases; the
  description is the dispatcher. Hard limit 1024 chars.
- `name` matches the parent directory name, ≤64 chars, lowercase + numbers +
  hyphens, no leading/trailing/consecutive hyphens.
- `author` present.

Beyond the gates:

- Declare `allowed-tools` when the skill needs only a known toolset.
- Cross-reference sibling skills by name (**bold**) instead of duplicating
  their content; the owning skill stays the single source of truth.

## Refactoring a skill

- **Structure over deletion.** Move topic-scoped detail into `references/` with gated links and de-duplicate cross-cutting rules to a single home — don't just cut. Note extraction is a maintainability win, not a context-window win when the runtime inlines a skill's method into a subagent prompt; do it for structure, don't sell it as context savings.
- **Portable core vs project-bound harness.** Keep the method (SKILL.md + `references/`) decoupled from artifacts stamped to one example project (evals, reference outputs, case studies). Coupling to the *method shape* is fine; coupling to the example project is not.
- **Prove refactors behavior-preserving.** When a provenance-stamped baseline exists, re-run the affected work and diff against it — assert the load-bearing facts (verdicts, judgement surface), allow documented residual wobble. Run validation agents on the **refactored artifact only**; feeding them the case study, reference outputs, or evals leaks the expected answer.
- **Keep method changes out of a structuring refactor.** If a re-run surfaces a method weakness, fix it as its own change with its own re-validation — never fold a behavior change into a refactor claimed as behavior-preserving.

## Related Skills

- **postmortem** — lighter, session-scoped sibling. Use after a session that exercised a skill to capture polish/tweaks/fixes grounded in this conversation's evidence. `skill-conventions` audits a skill as an artifact; `postmortem` reviews how it actually played out in one session.
