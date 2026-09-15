---
date: 2026-09-16
model: claude-opus-5
description: "Orchestrator prompt for landing a multi-step refactor through subagents, with Codex review and a judge on every step"
---

# Orchestrated Step Loop

The orchestrator runs each step through a fixed loop and does nothing else: it
spawns agents, runs Codex, and commits. It never verifies, fixes, or repeats a
subagent's work.

## Loop per step

implementer → tester → Codex → judge → (accepted: fixer → tester → Codex → judge) → commit

1. **Implementer** makes the step's change.
2. **Tester** runs the gates and reports GREEN or RED with counts. RED goes to a fixer.
3. **Codex** reviews the uncommitted diff, read-only.
4. **Judge** rules each Codex finding ACCEPT or HAND-WAVE with file:line evidence. When Codex returns nothing, the judge does an independent pass.
5. **Fixer** addresses ACCEPT findings, then the loop repeats from the tester.
6. **Commit** only on green tests and a judge verdict with no open ACCEPT.

## Subagent prompts

- Under 100 words.
- Name the working directory, the step, and the gate commands.
- Every subagent: no log, no commit. Code subagents also touch no markdown.
- Give the question and the established facts, not the expected answer.

## Gates

Run from the repository root:

```bash
./scripts/run_silent.sh "tests" npm run test:noreta
./scripts/run_silent.sh "build" npx tsc --noEmit -p noreta
node --import tsx --test noreta/tests/*.test.ts 2>&1 | tail -12
```

## Codex review

The orchestrator runs Codex itself; it is never delegated to a relay subagent.
Codex never fixes anything. Untracked new files need `git add -N` first, or the
diff omits them.

```bash
RUN="$(mktemp -d)"
~/.claude/scripts/codex-judge/assemble-review-prompt.sh --out "$RUN/findings.md" --range HEAD --repo <worktree> > "$RUN/prompt.md"
~/.claude/scripts/codex-judge/verify-review-prompt.sh "$RUN/prompt.md"
codex exec --sandbox read-only --output-last-message "$RUN/findings.md" - < "$RUN/prompt.md" > "$RUN/run.log" 2>&1
```

Run `codex exec` in the background with a monitor that stops on
`stream error|fatal:|Rate limit|401 Unauthorized|context deadline` or on three
minutes without log growth.

## Commits

- Run `git status`, stage explicit paths, then commit in a separate call.
- Short, imperative, lowercase message with no trailers.
- One step per commit; a step with no diff has no commit.
