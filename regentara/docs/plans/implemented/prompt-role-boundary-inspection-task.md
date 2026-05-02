---
date: 2026-04-28
model: gpt-5
description: "Regentara follow-up task for inspecting and tightening agent role prompts"
---

# Prompt Role Boundary Inspection Task

## Task

Inspect and tighten Regentara agent prompts so Producer, Reviewer, and Remediator stay inside their intended roles.

Take this after the CLI debug-mode task, so prompt changes can be validated with clearer live run visibility.

## Current Problem

The artifact path validation run exposed role drift:

- Producer initially returned `artifact: ""` without implementing the task.
- Reviewer correctly failed the first pass because implementation changes were missing.
- Remediator then modified repository files directly, even though the Remediator role should only return a revised task.
- The next Producer returned prose in the `artifact` field, causing Regentara to treat a summary as an artifact path.

This makes run outcomes hard to reason about and weakens the Producer/Reviewer/Remediator separation.

## Expected Behavior

- Producer prompt clearly instructs the Producer to perform the task in the working directory, then return only schema-valid semantic JSON.
- Producer prompt clearly states that `artifact` must be either an empty string or a relative authored artifact path, not prose or a summary.
- Reviewer prompt clearly instructs the Reviewer to inspect the actual repository state or diff when judging implementation work.
- Remediator prompt clearly instructs the Remediator not to edit files and to return only a revised task.
- All role prompts reinforce that narrative details belong in provider diagnostics, not in structured semantic fields.
- Keep the change scoped to prompt construction, prompt tests, and documentation if needed.
- Do not change provider CLI execution, model routing, policy behavior, or artifact validation in this task.

## Suggested Implementation Area

- `regentara/src/orchestrator.js`, especially prompt construction.
- Existing orchestrator sequence tests under `regentara/tests/`.
- README or docs only if the user-facing role contract changes.

## Verification

- Add or update tests that assert generated prompts contain the role-boundary instructions above.
- Run `./scripts/run_silent.sh "regentara-tests" node --test regentara/tests/*.test.js`.
- Run `./scripts/run_silent.sh "tests" npm test`.
- Run `./scripts/run_silent.sh "build" npx tsc --noEmit`.
- If debug mode is available, run a small real Regentara task and inspect debug output for role clarity.

## Producer Output

Return structured output with `artifact` set to an empty string after making the prompt and test changes.
