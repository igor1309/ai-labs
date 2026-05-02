---
date: 2025-02-11
model: claude-opus-4-6
description: "Decision record: mandatory recommendation vs. default-to-lean in discuss skill"
---

# Decision: Default-to-Lean vs. Mandatory Recommendation

## Context

Version 1.1.0 of the discuss skill added a mandate for the agent to take
positions and share opinions during discussions. Step 3 originally read:

> **Every question must carry your recommendation.**

## Review Feedback

A code review flagged that making recommendations mandatory for *every*
question can force premature opinions during early fact-finding and bias
discovery. The reviewer suggested limiting the mandate to "decision-driving
questions after sufficient context."

## Decision

**Rejected the broad carve-out. Applied a targeted softening instead.**

Changed "Every question must carry your recommendation" to "Default to stating
your lean" with an explicit instruction: if you genuinely lack context, say so
out loud rather than going neutral silently.

## Reasoning

The reviewer's concern — fake opinions from insufficient context — is valid.
But the suggested fix creates an escape hatch the agent will abuse. The whole
point of v1.1.0 was to combat the agent's tendency to hide behind neutrality.
Adding "only recommend on decision questions" lets the agent classify every
question as "exploratory" and revert to passive behavior.

The existing skill structure already mitigates premature opinions:

- Step 1 requires gathering context before asking questions
- Step 2 says "when you have enough context to form an opinion"
- Open-ended questions are already carved out for unclear answer spaces

The targeted fix addresses the valid edge case (genuinely insufficient context)
without reopening the neutrality escape hatch. The agent must explicitly
acknowledge when it lacks a lean — silence defaults to having one.

## Version Impact

- 1.1.0 → 1.1.1 (patch: clarification, no behavioral change in intent)
