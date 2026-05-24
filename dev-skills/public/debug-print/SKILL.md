---
name: debug-print
author: Igor Malyarov
version: "1.0.0"
description: Isolate bugs by adding debugPrint logging only — no behavior changes. Use when the user wants to add debug prints to trace a bug. Argument is the bug description.
allowed-tools: Read, Edit, Write, Bash(xcodebuild:*), Bash(swift:*)
---

# Debug Print

Goal: isolate the bug described below by adding `debugPrint` logging only.

Bug: $ARGUMENTS

## Do

- Search the codebase for code relevant to the bug. If the area is unclear, ask the user before making changes.
- Add `debugPrint(...)` statements with a unique, short, consistent prefix (e.g. `[DBG1]`) so the user can filter the console.
- If control flow is unclear, add multiple prints at key branch points to disambiguate which path executes.
- Keep messages minimal but identifying: function name, branch, important values.

## Don't

- Do not change code behavior. The only allowed edits are adding `debugPrint` lines.
- Do not refactor, rename, reorder, delete, or reformat anything.

## After adding prints

1. Verify the project compiles by running the build command from `.claude/AGENTS.md`. Do not skip this step.
2. Summarize where you added prints: file, function, what each print indicates.
3. Tell the user what app flow to run to trigger the bug.
4. Wait for the user to paste console output. Then propose next instrumentation or a fix.

## Reply format

Before making any changes, confirm you understand the constraints and restate the plan in 3-5 bullets.
