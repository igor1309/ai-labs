---
name: synopsis
author: Igor Malyarov
version: "1.0.0"
description: >
  Use when the user needs a concise description of a component, module,
  product, or entire codebase for someone with zero project context.
  Triggers on "synopsis", "describe this for outsiders", "write a description",
  "explain what this does", "elevator pitch", or when producing text for
  READMEs, marketplace listings, or onboarding docs.
allowed-tools: Read, Grep, Glob, Agent
---

# Synopsis

Produce a concise, behavior-focused description of the target for a reader
with zero project context.

The target is: $ARGUMENTS

If `$ARGUMENTS` is empty, infer from conversation context. If unclear, ask.

## Process

1. **Explore.** Read docs, README, and code related to the target. Use both —
   docs tell intent, code tells truth.
2. **Synthesize.** Write the synopsis following the constraints below.
3. **Present.** Print the synopsis. Stop.

No file writes. No follow-up suggestions. Just the text.

## Constraints

- **Audience:** someone who knows nothing about this project.
- **Focus:** behavior and input/output contract. Not architecture,
  not implementation, not tech stack (unless the tech *is* the product).
- **Negative space:** state key things the target does NOT do, when those
  set important expectations.
- **Length:** ~100 words by default. If the user specifies a different budget,
  use that.
- **Tone:** direct, declarative. No marketing fluff, no hedging.

## Quality Checklist

Before presenting, verify:

- Could a stranger understand what this does without reading the code? → yes
- Does it mention *how* it works internally? → no (remove it)
- Does it state what goes in and what comes out? → yes
- Does it name what the target explicitly does NOT do? → yes, if relevant
- Is it within the word budget? → yes
