---
description: Ask Codex for an adversarial review, critically judge each finding (accept/hand-wave with reasons), fix the accepted ones, and save an audit log
argument-hint: <what to review, in plain words — e.g. "the migration plan in docs/plans/x.md" | "the working-tree changes" | "the diff against main">
---

Ask Codex for an adversarial review of the current work, then **judge it** — don't obey it. This command owns only the judge → fix → log loop. Decision mode is autonomous: decide and act in one run, no confirmation gate, with a durable audit log.

Target / focus:
`$ARGUMENTS`

## Step 1 — Ask Codex for an adversarial review (direct `codex exec`)

Call the standalone Codex CLI **directly** — do not route the review through a relay subagent (a relay cannot poll its backgrounded job, so status checks stall; verified 2026-07-15 when two plugin-runtime jobs also hung mid-command on a broker owned by another session).

**Every run gets its own directory.** `RUN="$(mktemp -d)"` — the prompt, the
findings file and the audit log all live in it. Never a shared scratchpad, and
least of all for a one-off review that is not a pipeline stage. A fresh
directory has nothing to delete, so **never `rm -f` an output file at launch**;
where that step survives, a second run destroys the first's findings before
producing its own.

1. **Assemble the prompt with the script. Never hand-write one.**

   ```bash
   ~/.claude/scripts/codex-judge/assemble-review-prompt.sh \
     --out <findings-file> \
     --path <artifact> [--path <artifact>...] \
     [--range <base>..HEAD --repo <dir>] > <prompt-file>
   ~/.claude/scripts/codex-judge/verify-review-prompt.sh <prompt-file>
   ```

   The template owns the prompt. `$ARGUMENTS` names **scope only** — resolved
   into `--path` / `--range`; its prose never reaches Codex. On `CONTAMINATED`,
   delete the offending text; never move it into the template.

   Never put in a prompt: your conclusions, a scope exclusion, a menu of
   acceptable answers, the failure modes you want flagged, or a WIP marker that
   suppresses findings. Mark WIP in the artifact instead; reasoning Codex needs
   goes in a file passed with `--path`.

   Verification proves provenance, not neutrality — it cannot tell you that a
   file you wrote is fair.

2. Run from the target repo/worktree as a background task:

   ```bash
   codex exec --sandbox read-only --output-last-message <findings-file> - < <prompt-file>
   ```

   `--sandbox read-only` guarantees no edits; `--output-last-message` persists the findings to a file you Read when the task completes.

- **Record the background task id at launch, and act only on that id.** A completion notification names the task, not the run — with two reviews in flight, the one that finishes first is indistinguishable from yours.
- **`pgrep codex` is not a liveness signal.** The ChatGPT app's `codex app-server` and helper processes are always present, so a dead job still looks alive. Judge liveness by whether the run log is *growing*, and arm a monitor that reports stall and crash, not only success.
- The findings file is the input to Step 2.
- If `codex` is unavailable or errors, **stop** and report (point the user at `/codex:setup`). Do not substitute your own review.
- Fallback (only if the plugin runtime's broker is healthy in this session and you want its status/cancel bookkeeping): `codex-companion.mjs adversarial-review --background --base <ref> --scope branch "<focus>"`, monitored via its `status`/`result` subcommands. If a job's log shows a `Running command:` with no completion for many minutes, `cancel` it and use direct `codex exec`.

## Step 2 — Judge the review critically

Codex is adversarial by design: it argues for *not shipping*, includes inference-based concerns, and reports confidence < 1. Treat it as a sparring partner, not an authority.

**First, assess the approach — write your verdict down before opening the findings file.** Ask, independently of Codex's list, whether the artifact's fundamental design is sound. A verdict formed after reading Codex's is indistinguishable from an echo; asking Codex to assess the approach for you skips this step. Record it as a top-level verdict in the log; if the approach is wrong, say so plainly and stop rather than polishing it finding-by-finding.

Then, for **each** finding, reach a grounded verdict:

- **ACCEPT** — you verified the finding against the actual code/plan and it holds. Record *why* it's real and what the fix is.
- **HAND-WAVE** — dismiss it, with a defensible reason: wrong on the facts, out of scope, already handled elsewhere, or speculative with no evidence in the provided context.

Grounding rules:
- Verify before you accept *and* before you dismiss — open the cited file/line or plan section; don't take Codex's word, and don't hand-wave just to save work.
- Don't accept on authority (confidence/severity is not proof). Don't dismiss because a fix is inconvenient.
- A finding that depends on an assumption: state whether the assumption actually holds here.
- The artifact's own governing requirements outrank the review. Whatever rules already define the document under review — the skill or template for its type — stay authoritative. A finding that is technically true but would make the artifact violate those requirements is out of scope: HAND-WAVE it (and route it onward if it is real work that belongs elsewhere). Never let a Codex finding redefine what the document type requires.

## Step 3 — Write the audit log (before any edits)

As soon as judgment is done — **before** making changes — create the log and record the decisions, so it survives even if a later fix fails:

```bash
LOG="$RUN/codex-judge-$(date +%Y%m%d-%H%M%S).md"
```

Write to `$LOG`:
- **Target** (`$ARGUMENTS`) and how the review was obtained (direct `codex exec`, read-only).
- The Codex findings **verbatim** — paste the findings-file text so the audit trail is durable and self-contained.
- One entry per finding: `file:line` / `file#section` / `global` → **ACCEPT** or **HAND-WAVE** → one-line rationale → action (to be) taken.

## Step 4 — Fix the accepted findings

Apply a fix for **every finding you marked ACCEPT**, regardless of Codex's own severity label; make **no** change for any **HAND-WAVE**. Do not pause to ask the user to confirm — decide, log the reason, and apply in the same run. Stop only if a fix genuinely cannot be determined from the repo/plan facts without inventing requirements.

- Make surgical changes that match the surrounding code/plan style. Note the file(s) touched for each fix.
- **Code targets:** run the repo's verification gates (per project instructions) and record the outcome.
- **Plan/doc targets:** re-open each changed section and confirm the accepted finding is actually addressed; run any Markdown/plan/process-gate checks the project defines and record the result.

Then append to `$LOG`: per-finding action taken (fix + files, or none), and **net result** counts (accepted/fixed, hand-waved) plus verification outcome. If a fix or verification failed, still print the audit-log path and report the work incomplete.

## Stop

Report a tight inline summary — what was accepted and fixed, what was hand-waved and why — and end with the audit-log path: `Audit log: <absolute $LOG path>`. Do not start unrelated work.
