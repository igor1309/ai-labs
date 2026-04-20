---
name: pr-ci-watch
version: "1.0.0"
description: Use when the user wants to monitor GitHub PR CI status, wait for checks to finish, merge on green, or investigate failed checks. Triggers on phrases like "is CI done", "wait for checks", "watch the PR", "merge when green", or after pushing commits that invoke CI workflows. Prevents wasteful polling of `gh pr checks` and encodes the blocking/background decision.
---

# PR CI Watch

## Core rule

**Never poll.** `gh pr checks` without `--watch` is a snapshot. Calling it in a loop — with or without `sleep` between calls — is forbidden. Estimating CI duration and sleeping that long before checking is also forbidden. One call, `--watch`, branch on exit code.

## The command

```bash
gh pr checks <pr-number> --watch --fail-fast
```

- Blocks until all checks settle, or exits on the first failure (`--fail-fast`).
- `--fail-fast` is the default for fast feedback. Drop it if the user wants to see all failures at once.
- Exit 0: all green. Nonzero: something failed. Exit 8: still pending (shouldn't occur with `--watch` but handle defensively).
- No PR number given? Resolve from current branch: `gh pr view --json number -q .number`.
- Set `timeout: 600000` on the Bash tool call — `--watch` can block indefinitely if a check hangs.

## Foreground by default

Run `--watch` in the foreground. The agent is cheap while blocked on a subprocess — no tokens burn, no context grows, resume is instant when checks settle.

Switch to **background** only if the user explicitly says they want to keep working in parallel:

```bash
# Bash tool with run_in_background: true
gh pr checks <pr> --watch --fail-fast > /tmp/pr-<pr>.log 2>&1
```

You will be notified when it completes. Read the log at `/tmp/pr-<pr>.log` if details are needed.

## On success

If the user asked to merge on green:

```bash
gh pr merge <pr> --merge --auto --delete-branch
```

## On failure

Pull only what failed, not full logs:

```bash
gh run view <run-id> --log-failed
```

Get run IDs from the `--watch` output or `gh pr checks <pr> --json name,link,state`. Summarize the failure in 1–3 lines, then ask before anything destructive (revert, force-push, rerun).

## Known race: "no checks reported"

If `--watch` runs too soon after a push, it may exit 1 with "no checks reported on branch" before GitHub registers the workflow. Retry once after 5–10 seconds — still with `--watch`, never a poll loop.

## Forbidden

- `while ...; do gh pr checks; sleep N; done`
- Repeated `gh pr checks` across turns "to see if it's done yet"
- Delegating the watch to a sub-agent (sub-agents are synchronous; solves nothing)
- Sleeping a guessed CI duration then checking
