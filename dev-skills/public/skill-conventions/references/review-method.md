---
date: 2026-08-24
model: claude-opus-5
description: "Ten-axis review method for agent skills — axes, output format, and the behavioral dry-run"
---

# Skill Review Method

Read this when running a review of an existing skill. The authoring
conventions it grades against live in `../SKILL.md`.

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
- Within the hard character limit stated in `../SKILL.md` `## Frontmatter and hygiene`; flag at ~900 to leave room for iteration
- Would the agent select this skill from 100+ candidates given a matching task?

### 3. Front-matter integrity

Objective gates that don't need domain context — grade against `## Frontmatter and hygiene` in `../SKILL.md`, which states them once.

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

### 8. Failure observability (applies only to skills that drive scripts/tools)

Grade the skill against the "fail loud, fail visible" and mechanical-breadcrumb
rules in `../SKILL.md` `## Scripts`:

- When a script the skill invokes exits non-zero, does the skill's report/gate
  **surface** it — or can the agent silently hand-fix and still report success?
- Is there a mechanical breadcrumb, so the failure record does not depend on the
  agent narrating it?
- Is "script failure surfaced" a **DoD criterion**, not just prose?

Flag as a finding any script-driving skill where a non-zero script exit can be
absent from the run's report. (Origin: the Poeme add-module experiment — a
wiring script failed with non-zero exit on every run, both agents silently
hand-fixed it, and every run still reported `PASS`.)

### 9. Folder shape (applies only to skills with supporting files)

Grade against `../SKILL.md` `## Folder shape`, which defines the buckets and
their loading contracts.

- Are supporting files grouped by role, rather than scattered flat in the skill root?
- Does the bucket match the file's loading contract?

A flat skill is **not** a spec violation. The finding triggers only once the
skill crosses the threshold set in `../SKILL.md` `## Folder shape`; below it, a single
loose file is a comment at most, not a finding. Cite the convergence of the three canonical layout sources (Anthropic
skills overview, the agentskills.io specification and home — see `../research/`):
cited precedent, not taste.

### 10. Instruction interference (applies only to interaction-driving skills)

Signal-to-noise grades instructions in isolation. This axis grades what happens
when instructions governing the same decision interact. Apply it when a skill
controls questions, phase transitions, defaults, or responses to the user.

- Do any instructions require incompatible actions, defaults, or priorities?
- Does repetition overweight avoidance of one failure mode until it displaces
  the skill's actual task?
- Can a phase or workflow rule override the user's latest direct instruction?
- Does a fixed question order, quantity, template, or threshold constrain
  judgment without a fragile operation that justifies it?
- Does the skill require clarification where it already defines a safe default?

Flag the affected sections as `conflict`, not merely `noise`, when their
combination can change behavior for the worse. Prove the interaction from
overlapping scope, an observed run, a known incident, or a planted fixture.
Repetition alone is insufficient: a critical warning repeated at two distinct
decision points can be intentional. Mark it `ask user` when the rationale or
behavioral effect cannot be established.

## Output Format

Per skill:

```
**Skill:** `name`
**Verdict:** Keep as-is / Needs refinement / Needs rewrite / Consider retiring

**Section-by-section** (every section must appear):
- [signal / noise / conflict / ask user]: [section name]
  Reason: [specific: duplicates AGENTS.md §X / general knowledge / encodes gotcha / ...]

**Strengths:**
- [What works well]

**Change plan** (only for sections marked noise or conflict, with specific fix)
```

**Rules for the section-by-section audit:**
- For script-driving skills, include an explicit axis-8 verdict (failure
  observability) — present it as its own finding, not folded into prose
- For skills with supporting files, include an explicit axis-9 verdict
  (folder shape) — same rule: its own finding, not folded into prose
- For interaction-driving skills, include an explicit axis-10 verdict
  (instruction interference) — same rule: its own finding, not folded into prose
- Every section gets a verdict — no skipping with a blanket percentage
- "noise" requires a specific reason (not "verbose" or "could be shorter")
- "conflict" requires two or more interacting instructions and the resulting
  behavior; do not use it for a standalone omission or unrelated axis failure
- "ask user" is mandatory when you suspect domain knowledge but can't confirm
- Do NOT use percentage-based noise estimates — they sound authoritative but are consistently wrong and lead fixers to over-cut

## What NOT to Flag

- Don't enforce rigid structural templates — structure serves content
- Don't penalize short skills — 30 lines of signal beats 300 lines of padding
- Don't require sections that don't apply (no empty "Common Mistakes" sections)
- Don't flag missing tests — that's a separate concern from content quality

## Behavioral dry-run (eligible skills only)

The axes above read a skill's prose. They cannot tell you whether a *generative*
skill produces good output or whether an *interaction-driving* skill produces a
sound user-facing trajectory. Two runs that obey the skill to the letter can
still differ materially. For those skills, reading is not enough: exercise the
skill and audit what it produces.

**Eligibility — route 1 or route 2 must hold, and route 3 must hold:**

1. **Generative behavior.** The behavior under review directs the agent to
   author an artifact, not follow a fixed sequence or check against a rulebook,
   and two compliant runs can differ materially in quality. Gate on the behavior
   being changed, not the whole skill — a mostly-procedural skill with one
   generative substep qualifies when that substep is what changed.
2. **Interaction-driving behavior.** The behavior under review governs
   questions, phase transitions, defaults, or responses to the user, and two
   compliant runs can differ materially in user-facing behavior.
3. **Ground truth exists.** There is something to audit against — a source text,
   a spec, a test, a contract.

Procedural skills (a release flow, a worktree setup), rulebooks (governance,
composition rules), and deterministic ops still fail both routes unless the
behavior under change controls a user interaction. Don't run a dry-run when a
careful read fully determines the result.

**Mandatory for eligible skills on a behavior change** — when the skill is
created, or an edit changes *what or how it generates or interacts* (not a typo,
not a doc-link fix). Skipping it then ships the change validated only by reading
the instructions, never by running them.

**Harness shapes — pick by what the skill produces or controls:**

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
- **Interaction-driving skills (scenario-and-observe).** Run fixed scenarios
  covering: sufficient context where the agent should proceed, one missing
  material decision where it should clarify, and a direct user request that
  interrupts the nominal phase. Audit observable behavior against the contract:
  whether each question was necessary, whether work progressed, whether a
  defined default was used, and whether the direct request was answered. Hold
  the prompts constant before and after a known regression so the behavior
  change, rather than scenario drift, explains the result.

Keep the harness honest: audit against ground truth yourself — don't accept the
sub-agent's own self-check as the verdict, since the author and the grader are the
same model. When a provenance-stamped baseline exists, prefer it as the input set
(see `../SKILL.md` *Refactoring a skill*).

**Optional — tier probe.** Running the same dry-run across model tiers answers
"how cheap a model can run this" and localizes where model judgment still lives
versus what has been pushed into deterministic tooling: a step whose output goes
tier-independent has been scripted out of the model; one that still diverges by
tier is where judgment (and the stronger tier) is still load-bearing.
