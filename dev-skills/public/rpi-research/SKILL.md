---
name: rpi-research
description: >
  Codebase investigation and findings report without solution proposals.
  Only invoke when the user explicitly calls /rpi-research. Do not
  auto-trigger from natural language. Use when exploring a problem space
  before committing to an approach — no spec required, no auto-transition
  to planning. Reports findings, risks, and unknowns, then stops.
version: "2.1.0"
author: Igor Malyarov
---

# Research

Research phase for task execution. Investigate the codebase, build understanding, report findings. No code changes, no solution proposals.

First phase of the RPI (Research → Plan → Implement) workflow.

## Before You Explore

If the user referenced documents (specs, plans, PRs), read them before exploring the codebase. Most questions resolve themselves in the docs.

## Output Format

Structure your response with these sections:

### Task Understanding

Restate the task in your own words. This catches misinterpretation early.

### Findings

Factual observations from the codebase.
Start with two lead bullets:
- `Scope:` what was searched, coverage boundaries, and exclusions. Include counts when relevant.
- `Pattern evidence:` representative analogs or pattern families (or explicit `none found`).

Then include:
- Relevant files and modules (with paths)
- Patterns and conventions used for similar functionality
- Constraints or dependencies discovered

### Risks & Unknowns

- Things that could go wrong or complicate the task
- Gaps in understanding
- Ambiguities in how existing code behaves

### Questions

Clarifying questions about the task or approach, if any. Omit this section if there are none.

### Large-Scope Mode

Use this mode when detailed listing would exceed 12-15 evidence bullets or starts repeating the same pattern.

- Keep the same top-level sections. Do not add extra top-level sections.
- In `Findings`, include a compact coverage summary: files scanned, files deeply read, directories covered, search pattern count, and exclusions.
- Group matches into pattern families with counts and 2-3 representative file paths per family.
- Prioritize conflicts, deviations, and outliers. Do not enumerate repetitive matches.
- Add this line in `Findings`: `Examples are representative; full match list omitted for brevity.`
- If conflicting patterns are present, include a `Conflicts` block inside `Findings`.

## Constraints

- **No code changes.** Do not modify, create, or delete any files.
- **No suggestions.** Report what you observe, not what you would do. "The codebase uses protocol-based DI" is a finding. "We should use protocol-based DI" is a suggestion — save it for the planning phase.
- **Suggestion requests during Research.** If the user asks for suggestions while in `/rpi-research`, do not provide them. Ask whether to switch to `/plan` and wait for confirmation.
- **No implementation details.** Do not discuss how you would implement the task.
- **Stop cleanly.** After delivering research output, ask whether to save findings to a file. Then wait for the next instruction.
