---
date: 2026-04-28
model: gpt-5
description: "Explanation of the agent-develop-review-loop repository workflow"
source: https://github.com/geserdugarov/agent-develop-review-loop
---

# Agent Develop Review Loop Explanation

## Summary

`agent-develop-review-loop` is a small Bash wrapper that automates an implement-review-fix loop between two existing CLIs:

- Claude acts as the implementer.
- Codex acts as the reviewer.
- Git diff from the starting commit is the review surface.
- A final-line review sentinel decides whether the loop continues.

The loop is:

```text
Claude implements -> Codex reviews -> Claude fixes -> Codex reviews -> ...
```

It stops when Codex emits a passing sentinel or when the maximum iteration count is reached.

## Usage

From the target repository:

```bash
develop-review-loop ./task.md --max 10
```

The task file is plain text or Markdown. The current working directory, `$PWD`, is treated as the project under edit. The wrapper repository itself is only installed on `PATH`; it does not determine the target project.

## Runtime Flow

The script validates that:

- The task file is readable.
- `claude` is available on `PATH`.
- `codex` is available on `PATH`.
- `$PWD` is inside a git worktree.

It then records the starting commit:

```bash
START_REF="$(git rev-parse HEAD)"
```

This matters because each Codex review examines the cumulative diff from that starting point, not only the latest edit.

## Iteration Behavior

### Iteration 0

The script sends Claude the original task with an instruction to edit the working tree directly and not commit:

```text
Implement the task below. Make code changes directly in the working tree of the current repo. Do not commit.
```

Claude runs non-interactively. Its output is written to:

```text
.develop-review-loop/claude-0.log
```

### Review

After Claude edits the working tree, Codex reviews the cumulative diff:

```bash
git diff "$START_REF"
```

The review is written to:

```text
.develop-review-loop/review-0.md
```

The review prompt requires Codex to end with exactly one final-line sentinel:

```text
REVIEW_PASSED
```

or:

```text
REVIEW_FAILED
```

### Fix Iterations

If Codex fails the review, the next Claude run receives the previous review as its task:

```text
Codex reviewed your previous changes and flagged the issues below. Edit the code to address them.
```

The loop repeats until Codex passes the review or the iteration cap is reached.

## Pass Detection

The script checks the last few lines of each review file:

```bash
tail -n 3 "$review_file" | grep -q '^REVIEW_PASSED$'
```

This avoids accidentally passing when `REVIEW_PASSED` is mentioned earlier in prose. Anything other than a final passing sentinel is treated as a failed review.

## Artifacts

All runtime artifacts are written under `.develop-review-loop/` in the target repository:

```text
claude-0.log
review-0.md
claude-1.log
review-1.md
summary.md
```

`summary.md` records the task file, iteration count, final verdict, starting commit, duration, and final review file.

## Commit Behavior

The wrapper does not commit automatically.

Claude is explicitly told not to commit, and the script only reviews uncommitted working-tree changes through `git diff "$START_REF"`. When the loop finishes, the target repository is left with uncommitted changes for a human or another process to inspect, test, commit, discard, or amend.

One caveat: this is prompt-enforced rather than mechanically enforced. The wrapper itself does not install a git hook, block `git commit`, or verify afterward that no commit was created during the Claude run.

## Watcher

The companion command:

```bash
develop-review-loop-watch
```

tails the newest file in `.develop-review-loop/`, following progress as the active artifact changes from Claude logs to Codex reviews and back again.
