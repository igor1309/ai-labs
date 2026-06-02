---
date: 2026-06-02
model: claude-opus-4-8
description: "Short-lived TODO: skill and agent ideas surfaced by the doc-drift Telegram-rendering session (2026-06-02)"
---

# TODO

Short-lived scratch list — skill and agent ideas surfaced while fixing the
doc-drift Telegram notification (PR #454). Each names the gap, the concrete shape,
and (where relevant) the session failure that motivates it. Promote into
`docs/TODO.md` / RFCs / actual skills as decided, then delete this file.

## 1. `openclaw-agent-ops` skill — operating the specialized OpenClaw agents

Three near-identical changes (maestro, dashboard-sync, doc-drift notification
wrappers) have each rediscovered the same operating pattern from scratch. Capture
it as a skill so the next one starts from the pattern, not from repo state alone.

Should encode:

- Read `inventory/vps/OpenClaw/` (README, log, gotchas, migration) **before**
  touching a deployed agent — access, routing, and runbook live there, not in
  `ai-labs`.
- Verify the **live** wrapper on the VPS before editing the repo copy; the two
  drift (doc-drift's repo copy was stale on routing *and* rendering while the
  live copy was current on routing).
- The notification rendering contract: parse the report, never forward raw
  stdout; plain text, no parse mode; one message per run; fail-closed alert
  (bounded tail) on non-zero exit or missing report.
- Deploy ritual: backup → scp → chmod 700 → diff byte-identical → `bash -n` →
  log in **both** `ai-labs` and `inventory`.
- Never "smoke test" by firing a real scheduled run — it invokes the agent and
  can open PRs.

Motivation: this session I asserted I couldn't reach the VPS and worked from
stale repo state; both would have been prevented by step 1.

## 2. Shared Telegram notification-rendering contract + drift check

The rendering contract (parse-don't-forward, plain text, one message,
fail-closed) is now copy-pasted into three agents' `notification-spec.md`.
doc-drift's drifted and nothing caught it until an unreadable message reached the
maintainer.

- Extract the contract into one referenced spec (or a `dev-skills` reference) the
  three specs link to.
- Add a `doc-drift-audit`-style check that flags any wrapper still posting raw
  output (e.g. `head -c "$output_file"` / forwarding `$output_file` to
  `sendMessage`), so the bug is caught at review/CI, not in Telegram.

## 3. Extend "Verify Before Hedging" to capability/access claims

The CLAUDE.md "Review Discipline: Verify Before Hedging" rule covers review
*findings*. It does not cover the failure mode hit this session: asserting "I
can't reach X" / "that's out of scope for me" without checking whether access or
a runbook exists.

- Tweak the rule (or `arch-doc-review`) so that **before asserting a limitation
  on access or capability**, check for access/runbook docs (`inventory/`, ADRs)
  and the live system. State the limitation only after the check fails.

## 4. `vps-deploy` runbook skill

`migration.md` treats scripts under `~/.openclaw/scripts/` as opaque artifacts
recovered from snapshot; there is no standard checklist for *deploying* a changed
one. Capture the ritual used this session as a reusable skill: timestamped backup
→ transfer → permissions/owner → verify byte-identical to source → syntax check →
log in the relevant `log.md`(s). Reversible and verifiable at each step.

## 5. Agent that takes work from GitHub issues

A *separate* agent that picks up `gh` issues as work items. Distinct from
doc-drift — which by design has **no** issue machinery (every doc-drift finding is
a doc-edit PR); captured here so the two are not conflated.