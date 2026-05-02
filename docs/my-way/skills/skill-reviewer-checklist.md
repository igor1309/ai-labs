---
date: 2026-04-19
model: gpt-5
description: "Checklist for reviewing whether a transitional My Way skill is ready to become a first-class skill."
---

# Skill Reviewer Checklist

## Purpose

This checklist is used to review whether a transitional `My Way` skill is ready to stop depending on its source `note.md` and become a first-class skill.

The question is not whether the skill looks complete. The question is whether it can preserve the necessary judgment on its own without becoming rigid, shallow, or misleading.

## Core rule

A transitional skill becomes first-class only when the skill is operationally sufficient on its own and the source note is no longer required for correct use.

## Checklist

### 1. Applicability is clear

- Is it clear when this skill should be used?
- Is it clear when it should not be used?
- Does it avoid vague triggers that would cause accidental overuse?

### 2. Preserved judgment is encoded

- Does the skill contain the important distinctions that were previously protected by the note?
- Does it preserve the intended mode of thinking rather than collapsing into a template?
- Does it keep the work judgment-driven rather than deterministic?

### 3. Artifact responsibility is explicit

- Is it clear what artifact or output this skill is responsible for?
- Is it clear what this skill is not responsible for?
- Does it avoid absorbing the role of adjacent artifacts?

### 4. Boundaries are explicit

- Are the boundaries against neighboring artifacts or skills named clearly?
- Is it clear what belongs elsewhere?
- Does the skill avoid quietly drifting into research, pre-ADR, spec, or implementation-plan work when it should not?

### 5. Failure modes are explicit

- Does the skill name the main ways it can be misused?
- Does it guard against becoming too rigid, too vague, or too shallow?
- Does it warn against the specific distortions most likely for this artifact?

### 6. Escalation paths are explicit

- Is it clear when the skill should escalate upward or sideways rather than forcing the current artifact to absorb the problem?
- Does it make revisiting an earlier layer legitimate instead of treating it as failure?

### 7. The skill stands without `note.md`

- Can the skill be used correctly without consulting the source note?
- If the `note.md` disappeared today, would the skill still preserve the intended judgment?
- Is the note still adding operational guidance, or only background rationale?

### 8. Repeated real use shows sufficiency

- Has the skill been used enough times in real work to expose weak spots?
- Have recent uses stopped revealing guidance that had to be pulled back from `note.md`?
- Does the skill now hold up under normal use without corrective interpretation from the note?

## Review outcome

### Keep transitional

Keep the skill transitional if any of the checklist items still depend materially on the source note.

### Promote to first-class

Promote the skill to first-class only when the skill is sufficient on its own and the note is no longer operationally required.

### Reject promotion

Reject promotion if removing the note would increase ambiguity, encourage misuse, or collapse important distinctions.
