---
name: pr-ci-watch
author: Igor Malyarov
version: "1.2.3"
description: Use when the user wants to monitor GitHub PR CI status, wait for checks to finish, merge on green, or investigate failed checks. Triggers on phrases like "is CI done", "wait for checks", "watch the PR", "merge when green", or after pushing commits that invoke CI workflows. Prevents wasteful polling of `gh pr checks` and encodes the blocking/background decision.
---

# PR CI Watch

## Core rule

**Never poll.** `gh pr checks` without `--watch` is a snapshot. Calling it in a loop — with or without `sleep` between calls — is forbidden. Estimating CI duration and sleeping that long before checking is also forbidden. One call, `--watch`, branch on exit code.

## The command

**Always redirect output to a file** — raw `--watch` output contains hundreds of duplicate status lines across refreshes that bloat the context window. Branch on exit code, read the log only on failure.

```bash
gh pr checks <pr-number> --watch --fail-fast > /tmp/<repo>-pr-<pr>.log 2>&1
```

- Exit 0: all green. Nonzero: something failed. Exit 8: still pending (shouldn't occur with `--watch` but handle defensively).
- `--fail-fast` is the default for fast feedback. Drop it if the user wants to see all failures at once.
- No PR number given? Resolve from current branch: `gh pr view --json number -q .number`.
- Set `timeout: 600000` on the Bash tool call — `--watch` can block indefinitely if a check hangs.
- The `/tmp` redirect may trigger a write permission prompt on first use. This is a one-time grant — worth it to avoid polluting context with hundreds of status lines on every CI watch.

## Foreground by default

Run `--watch` in the foreground. The agent is cheap while blocked on a subprocess — no tokens burn, no context grows, resume is instant when checks settle.

Switch to **background** only if the user explicitly says they want to keep working in parallel — use `run_in_background: true` on the Bash tool call.

You will be notified when the background command completes. Read the log at `/tmp/<repo>-pr-<pr>.log` if details are needed.

## On success

### Report

Summarize the final state in 2–3 lines. Do NOT echo the raw `--watch` output — it contains hundreds of duplicate status lines across refreshes. Report:

- PR number and URL
- Overall status (all green)
- Notable outcomes: which jobs were skipped (validates path filters), which passed, total CI wall time if visible

### Auto-merge

Check whether auto-merge is already enabled before acting:

```bash
gh pr view <pr> --json autoMergeRequest -q '.autoMergeRequest'
```

- **Auto-merge already enabled** → skip to mergeability verification (below). Do not call `gh pr merge` again.
- **Auto-merge not enabled and user asked to merge on green** → enable it:

```bash
gh pr merge <pr> --merge --auto --delete-branch
```

- **User did not ask to merge** → skip merge, just report CI status.

### Verify mergeability

CI green does NOT mean the PR can merge. Auto-merge is blocked by conflicts, missing approvals, or other branch-protection rules. After checks pass, **always** verify:

```bash
gh pr view <pr> --json state,mergeable,mergeStateStatus,autoMergeRequest -q '.'
```

- `state: "MERGED"` → the PR already merged (auto-merge fired while CI was settling). Report success and stop — no further checks needed.

**Handle `UNKNOWN` state:** GitHub often returns `mergeable: "UNKNOWN"` or `mergeStateStatus: "UNKNOWN"` immediately after CI settles — the merge check hasn't finished computing yet. Wait 60 seconds and retry, up to 2 retries. On each retry, check `state` first — the PR may have auto-merged in the meantime. After 2 retries still `UNKNOWN`, report it explicitly as unresolved — do NOT treat it as success.

Interpret the result:

- `mergeable: "MERGEABLE"` + `mergeStateStatus: "CLEAN"` → auto-merge will proceed, report success.
- `mergeable: "CONFLICTING"` → auto-merge is blocked. Report the conflict immediately and offer to resolve it (fetch base branch, merge locally, fix conflicts, push). Do NOT tell the user "auto-merge will proceed" or "wait a moment."
- `mergeStateStatus: "BLOCKED"` with `mergeable: "MERGEABLE"` → a branch-protection rule (review, required check) is unsatisfied. Report which rule is blocking.

**Never declare a PR will auto-merge based solely on CI status.** The mergeability check is mandatory.

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
