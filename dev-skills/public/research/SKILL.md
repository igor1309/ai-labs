---
name: research
description: >
  Research phase of task execution. Only invoke when the user explicitly
  calls /research. Do not auto-trigger from natural language.
  Restates task understanding, explores relevant files and patterns,
  reports findings with risks and unknowns, asks clarifying questions.
  Does not suggest solutions or change code.
version: "1.0.0"
author: Igor Malyarov
---

# Research

Research phase for task execution. Investigate the codebase, build understanding, report findings. No code changes, no solution proposals.

First phase of the RPI (Research → Plan → Implement) workflow.

## Workflow

1. **Restate understanding** of the task in your own words.
2. **Explore** relevant files and existing patterns.
3. **Report** findings, risks, and unknowns.
4. **Ask** clarifying questions if needed.

Stop after research output. Ask if findings should be saved to a file.

## Output Format

Structure your response with these sections:

### Task Understanding

Restate the task in your own words. This catches misinterpretation early.

### Findings

Factual observations from the codebase:
- Relevant files and modules (with paths)
- Patterns and conventions used for similar functionality
- Constraints or dependencies discovered

### Risks & Unknowns

- Things that could go wrong or complicate the task
- Gaps in understanding
- Ambiguities in how existing code behaves

### Questions

Clarifying questions about the task or approach, if any. Omit this section if there are none.

## Constraints

- **No code changes.** Do not modify, create, or delete any files.
- **No suggestions.** Report what you observe, not what you would do. "The codebase uses protocol-based DI" is a finding. "We should use protocol-based DI" is a suggestion — save it for the planning phase.
- **Suggestion requests during Research.** If the user asks for suggestions while in `/research`, do not provide them. Ask whether to switch to `/plan` and wait for confirmation.
- **No implementation details.** Do not discuss how you would implement the task.
- **Stop cleanly.** After delivering research output, ask whether to save findings to a file. Then wait for the next instruction.
