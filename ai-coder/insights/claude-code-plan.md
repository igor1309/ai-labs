---
date: 2026-01-18
source: "[What Actually Is Claude Code’s Plan Mode? | Armin Ronacher's Thoughts and Writings](https://lucumr.pocoo.org/2025/12/17/what-is-plan-mode/)"
description: "The author explores Claude Code’s Plan Mode, a feature that generates a markdown file outlining the agent’s plan. The author, initially skeptical, investigates how Plan Mode works, finding it relies on a custom prompt, system reminders, and a predefined workflow. While acknowledging its benefits, the author prefers a more direct approach, using custom prompts and markdown files for collaboration with the agent."
---

# Insights
- Plan mode enter and exit instructions plus UI niceness/complexity.

## Background

-  Claude Code plan mode doesn’t inherit all the tool permissions, so in plan mode it actually asked for approval all the time. I found this annoying and as a result I never really used plan mode.
- ... iterate together with the agent on creating a form of handoff in the form of a markdown file. My approach has been getting the agent to ask me clarifying questions, taking these questions into an editor, answering them, and then doing a bunch of iterations until I’m decently happy with the end result.
- Plan mode as it exists in Claude has this sort of weirdness in my mind where it doesn’t come quite natural to me. It might come natural to others!

## Claude Code Plan Workflow

### Phase 1: Initial Understanding
**Goal**: Gain a comprehensive understanding of the user’s request by reading through code and asking them questions.

- Focus on understanding the user’s request and the code associated with their request
- (Instructions here about parallelism for tasks)

### Phase 2: Design
**Goal**: Design an implementation approach.

*(Some tool instructions)*

In the agent prompt:

- Provide comprehensive background context from Phase 1 exploration including filenames and code path traces
- Describe requirements and constraints
- Request a detailed implementation plan

### Phase 3: Review
**Goal**: Review the plan(s) from Phase 2 and ensure alignment with the user’s intentions.

- Read the critical files identified by agents to deepen your understanding
- Ensure that the plans align with the user’s original request
- Use TOOL_NAME to clarify any remaining questions with the user

### Phase 4: Final Plan
**Goal**: Write your final plan to the plan file (the only file you can edit).

- Include only your recommended approach, not all alternatives
- Ensure that the plan file is concise enough to scan quickly, but detailed enough to execute effectively
- Include the paths of critical files to be modified

### When to Use This Tool
IMPORTANT: Only use this tool when the task requires planning the implementation steps of a task that requires writing code. For research tasks where you’re gathering information, searching files, reading files or in general trying to understand the codebase - do NOT use this tool.
