---
name: skill-review
author: Igor Malyarov
version: "1.1.3"
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
