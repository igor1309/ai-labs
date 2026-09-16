---
date: 2026-09-16
model: claude-opus-5
description: "Codex adversarial review — run the flow directly with the codex-judge scripts, never a relay subagent; and pick a tool by what it does, not by a keyword it shares with its name"
---

# Codex Review

When the user asks for a Codex review — of a diff, a plan, a state machine — run
the whole flow yourself: assemble the prompt with
`scripts/codex-judge/assemble-review-prompt.sh`, run `codex exec` directly,
judge each finding ACCEPT / HAND-WAVE against the actual code, fix the accepted
ones, and write the durable audit log.

Nothing here is installed any more. This whole tree is an archive: the rule, the
command file that spells the flow out in full (`commands/codex-judge.md`), and
the scripts it drives (`scripts/codex-judge/`). Paths in this file are relative
to the archive root, `research/- DOT and ROOT/claude/`.

**Never route a review through a relay subagent** (e.g. `codex:codex-rescue`).
Such an agent is a one-shot forwarder: it may issue a single `task` call and is
barred from `status`/`result`/polling, so the Codex thread is orphaned the moment
the subagent returns.

## Rules this generalizes to

- **Select a tool by what it does, not by a keyword it shares with its name.**
  "Ask codex" names a service, not a subagent. Read the command/skill roster for
  the entry that describes the *task* before reaching for an agent whose name
  merely contains the same word.
- **A subagent whose answer is "you'll be notified" instead of content has not
  done the work.** That is a mechanism failure, not a transient one — switch
  mechanisms; never re-run the same shape hoping for a different result. Related:
  [[background-task-liveness]] (never re-arm a blind wait against a reproducible
  hang) and [[subagent-step-sizing]].
