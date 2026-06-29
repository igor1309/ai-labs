---
name: skill-review
author: Igor Malyarov
version: "1.3.0"
description: Review and improve existing agent skills. Use when evaluating skill quality, auditing skill collections, asking "review skill", "is this skill effective", "improve skill description", or maintaining a skill library.
---

**Announce:** "I'm using the skill-review skill to evaluate skill quality."

# Skill Review

## Philosophy

Modern agents are highly capable reasoners. Skills should provide context the agent DOESN'T already have — project-specific knowledge, non-obvious conventions, fragile sequences. They should NOT explain general concepts, babysit through obvious steps, or micromanage decisions the agent can make better in context.

**The deletion test:** if you removed a sentence and the agent would still do the right thing, that sentence is noise.

**The preservation test:** if a section contains specific values (country codes, error strings, exact enum cases, character pairs, file paths), assume it encodes a debugging discovery until proven otherwise. Domain knowledge looks like noise to outsiders — the author had a reason. Your job is to find it or ask, not assume it's absent.

## Knowing When You Can't

If you lack domain context to judge most of a skill's content, say so upfront. Scope the review to what you can evaluate — structure, description quality, staleness — and flag the rest as beyond your confidence. A partial honest review beats a complete fabricated one.

## Evaluation Axes

### 1. Signal-to-noise ratio

Does each section teach something the agent doesn't already know? Noise candidates:
- Explanations of general concepts (what TDD is, how HTTP works)
- Procedural hand-holding where the agent can reason from goals
- Redundancy with AGENTS.md / CLAUDE.md rules
- LLM-generic padding ("handle errors appropriately", "follow best practices for", "ensure security") — generic advice masquerading as expertise

Every token competes with conversation history for context window space.

**Escalation rule:** when you can't explain WHY a section exists — it looks like a random detail — that's a signal to mark it "ask user" rather than "noise." Intentional redundancy (e.g., a critical warning repeated at two decision points) is a pattern, not a mistake.

### 2. Description quality (CSO)

- Pairs WHAT (capability) with WHEN (trigger phrasing); avoids summarizing the internal workflow
- Specific, keyword-rich — uses words a user would naturally say in a query
- ≤1024 chars (canonical spec hard limit; flag at ~900 to leave room for iteration)
- Would the agent select this skill from 100+ candidates given a matching task?

### 3. Front-matter integrity

Objective gates that don't need domain context.

- `description` present and non-empty (clients SKIP skills without it — not a warning)
- `name` matches the parent directory name, ≤64 chars, lowercase + numbers + hyphens, no leading/trailing/consecutive hyphens
- `author` present (this repo requires `author: Igor Malyarov`)

### 4. Degrees of freedom

- **High freedom** for judgment calls (architecture, review, design)
- **Low freedom** ONLY for fragile operations (exact CLI commands, paths, sequences that break if reordered)
- Over-constraining: step-by-step for tasks agents handle naturally
- Under-constraining: vague guidance for operations needing precision

### 5. Progressive disclosure

- SKILL.md is a lean overview pointing to details
- Body under 500 lines / 5,000 tokens (canonical thresholds)
- Supporting files for heavy reference (100+ lines)
- Each reference link is gated with an explicit "read this when X" condition, not a generic "see references/"
- References one level deep (no chains)

### 6. Practical effectiveness

- Does the skill actually change behavior vs. what the agent would do without it?
- Are guardrails based on observed failures or hypothetical ones?
- Would a fresh agent instance find and use this successfully?

### 7. Staleness

- Do referenced file paths, module names, APIs still exist?
- Are code examples accurate against current codebase?

## Output Format

Per skill:

```
**Skill:** `name`
**Verdict:** Keep as-is / Needs refinement / Needs rewrite / Consider retiring

**Section-by-section** (every section must appear):
- [signal / noise / ask user]: [section name]
  Reason: [specific: duplicates AGENTS.md §X / general knowledge / encodes gotcha / ...]

**Strengths:**
- [What works well]

**Suggested changes** (only for sections marked noise, with specific fix)
```

**Rules for the section-by-section audit:**
- Every section gets a verdict — no skipping with a blanket percentage
- "noise" requires a specific reason (not "verbose" or "could be shorter")
- "ask user" is mandatory when you suspect domain knowledge but can't confirm
- Do NOT use percentage-based noise estimates — they sound authoritative but are consistently wrong and lead fixers to over-cut

## What NOT to Flag

- Don't enforce rigid structural templates — structure serves content
- Don't penalize short skills — 30 lines of signal beats 300 lines of padding
- Don't require sections that don't apply (no empty "Common Mistakes" sections)
- Don't flag missing tests — that's a separate concern from content quality

## Behavioral dry-run (eligible skills only)

The axes above read a skill's prose. They cannot tell you whether a *generative*
skill produces good output — two runs that both obey the skill to the letter can
still differ in quality. For those skills, reading is not enough: exercise the
skill and audit what it produces.

**Eligibility — all three must hold; if any fails, skip and review by reading:**

1. **Generative, not procedural.** The behavior under review directs the agent to
   author an artifact, not follow a fixed sequence or check against a rulebook.
   Gate on the behavior being changed, not the whole skill — a mostly-procedural
   skill with one generative substep qualifies when that substep is what changed.
2. **Quality varies.** Two letter-perfect runs can differ materially in quality
   (e.g. a technically-valid but trivially-pickable quiz distractor).
3. **Ground truth exists.** There is something to audit against — a source text,
   a spec, a test, a contract.

Procedural skills (a release flow, a worktree setup), rulebooks (governance,
composition rules), and deterministic ops fail #1 or #2 — a dry-run tells you
nothing a careful read doesn't. Don't run one.

**Mandatory for eligible skills on a generative-behavior change** — when the
skill is created, or an edit changes *what or how it generates* (not a typo, not
a doc-link fix). Skipping it then ships the change validated only by reading the
instructions, never by running them.

**Two harness shapes — pick by what the skill produces:**

- **Generation skills (produce-and-audit).** Spawn a sub-agent under the skill;
  have it produce N artifacts from real input *with its private reasoning
  revealed* (the key and rationale, not just the surface output); audit each
  against ground truth. Run **≥2 different inputs** — single runs hide aggregate
  patterns (a key that never lands in the first slot only shows across a set).
  Exercise **every behavioral branch the change touches**, not just the one
  easiest to generate. When the skill has a known failure mode, also hold **one
  input constant that triggers it** — every run then hits the identical failure,
  so a fix is provably the cause rather than run-to-run noise.
- **Review/judgment skills (plant-and-detect).** Feed the skill an input with
  known planted defects (and a known-clean one); check it finds the planted set
  and invents nothing. Here the artifact under audit is the *review* and the
  ground truth is the planted set.
- **Transformation/editing skills (input-output audit).** Give the skill a source
  artifact and a change request; audit the revised artifact against the request
  *and* against preserved source facts. Include at least one **preservation
  case** — content the request did not touch must come back unchanged.

Keep the harness honest: audit against ground truth yourself — don't accept the
sub-agent's own self-check as the verdict, since the author and the grader are the
same model. When a provenance-stamped baseline exists, prefer it as the input set
(see *Refactoring a skill*).

**Optional — tier probe.** Running the same dry-run across model tiers answers
"how cheap a model can run this" and localizes where model judgment still lives
versus what has been pushed into deterministic tooling: a step whose output goes
tier-independent has been scripted out of the model; one that still diverges by
tier is where judgment (and the stronger tier) is still load-bearing.

## Refactoring a skill

The axes above evaluate a skill as an artifact; these rules govern *changing* one.

- **Structure over deletion.** Move topic-scoped detail into `references/` with gated links (§5) and de-duplicate cross-cutting rules to a single home (§1) — don't just cut. Note extraction is a maintainability win, not a context-window win when the runtime inlines a skill's method into a subagent prompt; do it for structure, don't sell it as context savings.
- **Portable core vs project-bound harness.** Keep the method (SKILL.md + `references/`) decoupled from artifacts stamped to one example project (evals, reference outputs, case studies). Coupling to the *method shape* is fine; coupling to the example project is not.
- **Prove refactors behavior-preserving.** When a provenance-stamped baseline exists, re-run the affected work and diff against it — assert the load-bearing facts (verdicts, judgement surface), allow documented residual wobble. Run validation agents on the **refactored artifact only**; feeding them the case study, reference outputs, or evals leaks the expected answer.
- **Keep method changes out of a structuring refactor.** If a re-run surfaces a method weakness, fix it as its own change with its own re-validation — never fold a behavior change into a refactor claimed as behavior-preserving.

## Related Skills

- **postmortem** — lighter, session-scoped sibling. Use after a session that exercised a skill to capture polish/tweaks/fixes grounded in this conversation's evidence. `skill-review` audits a skill as an artifact; `postmortem` reviews how it actually played out in one session.
