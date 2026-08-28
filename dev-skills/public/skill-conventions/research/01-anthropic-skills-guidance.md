---
date: 2026-05-16
model: claude-opus-4-7
description: "Anthropic's official guidance on SKILL.md description and content, plus survey of native skill-evaluator tooling"
---

# Anthropic Skills Guidance — Description, Content, Native Evaluator

Research compiled before bumping `skill-review` from `1.1.1`. Sources: `code.claude.com/docs/en/skills.md`, the `anthropics/skills` GitHub repository, and the `skill-creator` skill shipped by Anthropic.

## Description rules (from code.claude.com)

- **Hard length cap.** `description` + `when_to_use` combined is truncated at **1,536 characters** in the skill listing (configurable via `maxSkillDescriptionChars`). Note: the canonical Agent Skills spec lists 1,024 chars — see [`02-agentskills-io-canonical-spec.md`](02-agentskills-io-canonical-spec.md) for the divergence.
- **Put the key use case first.** The combined text is truncated, so the first sentence has to carry the trigger.
- **Canonical pattern is "WHAT + WHEN."** Anthropic's own example:
  > `"Summarizes uncommitted changes and flags anything risky. Use when the user asks what changed, wants a commit message, or asks to review their diff."`
- **Triggering keywords are the primary selection mechanism.** From the troubleshooting page: "Check the description includes keywords users would naturally say."
- **Slightly "pushy" framing to combat under-triggering.** `skill-creator` recommends phrases like "Make sure to use this skill whenever the user mentions..." Descriptions are the "PRIMARY triggering mechanism."
- **No third-person rule.** Anthropic does **not** mandate third-person. Their examples use present-tense declarative ("Summarizes…") + imperative ("Use when…").

## Body content rules

- **Keep SKILL.md under 500 lines.** Direct quote: "Keep `SKILL.md` under 500 lines. Move detailed reference material to separate files."
- **Body loads only on invocation.** Once loaded, it stays in context for the rest of the session (5,000-token cap after compaction).
- **Progressive disclosure tiers:** metadata always in context (~100 tokens); SKILL.md body on trigger (<500 lines); bundled resources loaded as needed.
- **Use imperative form in instructions.** Explain WHY behind rules rather than ALL-CAPS MUST/ALWAYS.
- **State what to do, not how or why narratively.** "Apply the same conciseness test you would for CLAUDE.md content."
- **Supporting files pattern:** `reference.md`, `examples/`, `scripts/`. Reference them from SKILL.md so Claude knows when to load them.
- **Principle of Lack of Surprise.** Content must not surprise users given the description (no malware, exploits, or security-compromising content).

## Native skill-evaluator?

**No.** Anthropic does not ship a `skill-reviewer`, `skill-auditor`, `skill-review`, `evaluate-skill`, or `meta-skill` artifact in the `anthropics/skills` repository. Our `skill-review` skill fills a gap that Anthropic has not addressed directly.

## skill-creator — exists, partially reusable

- **Location:** `anthropics/skills/skills/skill-creator/SKILL.md`.
- **Purpose:** the creation-and-iteration loop — drafting a skill, running evals, grading outputs, benchmarking, optimizing the description via A/B testing.
- **Reusable signals for review:** description trigger accuracy via 20-query eval set (60/40 train/test split), qualitative output review with subagents, benchmark pass-rate, the Principle of Lack of Surprise, and the progressive-disclosure tier framing.
- **Why it doesn't replace `skill-review`:** `skill-creator` is process-heavy and presupposes building from scratch with an eval viewer and subagents. For retrospectively auditing a finished SKILL.md ("is this description well-formed? is the body too long?"), you'd strip it down to its writing-principles section. The two concerns are different enough that `skill-review` is justified as a distinct artifact, but its rubric should align with `skill-creator`'s evaluation methodology where they overlap.

## Implications for the upcoming `skill-review` description rewrite

1. **The "third-person" suggestion in earlier drafts is not an Anthropic rule.** The current description's "Declarative WHAT + 'Use when…' triggers" structure already matches Anthropic's canonical pattern.
2. **The lead "Review and improve existing Claude Code skills" is fine** by the "key use case first" guidance — earlier drafts over-corrected.
3. **Real gaps that remain:**
   - Missing the concrete artifact keyword `SKILL.md` (and ideally `front-matter`).
   - Could be slightly more "pushy" per Anthropic's anti-under-triggering guidance.
   - Could surface the verdict vocabulary (`keep / refine / rewrite / retire`) as a keyword anchor.

## Sources

- https://code.claude.com/docs/en/skills.md
- https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md
- https://github.com/anthropics/skills/tree/main/skills (directory listing — confirms absence of a native skill evaluator)
- https://github.com/anthropics/skills/blob/main/template/SKILL.md
