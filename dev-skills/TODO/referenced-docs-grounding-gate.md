---
date: 2026-06-03
model: claude-opus-4-8
description: "Skill improvements from the scoped-orchestrator session: a referenced-docs grounding gate (concrete cold-start-checkpoint edit), a mechanism-verification step for adr-governance, and using-dev-skills as a session-start default."
---

# Skill Improvements — Grounding Discipline

Source: the scoped doc-drift orchestrator session (2026-06-02/03). One failure mode
recurred — **stating confident conclusions before grounding them against the cheapest
source of truth** — and it is worth turning into enforceable gates rather than relying
on prose instructions.

## Context (the two failures these address)

1. **Re-derivation against production.** The entry point was a handoff that explicitly
   cited three dated, verified research docs. Instead of reading them, the agent SSH'd
   into the live VPS and re-derived their contents (the `.lobster` schema, `/bin/sh`
   step execution, "a direct lobster run does not register in the ledger"). All of it
   was already written down. This wasted ~6 SSH round-trips against a production host
   and violated the standing grounding-pass rule.
2. **Accepting a wrong mechanism.** An ADR amendment asserted "native cron + cron run
   history" observability; the user accepted it; building immediately showed native
   `openclaw cron` cannot drive a multi-step wrapper and cron-run-history does not
   apply. The mechanism claim was never verified against the actual constraint before
   acceptance.

Both are the same root cause: a conclusion not anchored to a named source (a referenced
doc, or the concrete mechanism on the target system).

## Suggestion 1 — `cold-start-checkpoint`: add a referenced-docs grounding gate

`cold-start-checkpoint` already forces a no-tools understanding replay before execution.
It does **not** force reading the docs the entry artifact references before live/external
investigation — which is exactly the gap that produced failure #1. Add a step that fires
when the entry point is (or points to) a handoff / ADR / research note / plan / ticket:
enumerate every doc and path it links, read those **first**, and forbid re-deriving via
Bash/SSH/Web what a dated verified doc already states unless there is a concrete staleness
signal. Making it a checklist step (rather than background prose) is what makes it fire.

Why it improves work: it removes the single most expensive pattern from this session —
re-spelunking a production host a handoff already documents — at the point where it
starts, before any tool call.

### Concrete edit

Tweak the skill's opening (`SKILL.md`, line 6–8 of the front-matter `description` and the
body intro) to name the rule, and insert a new **Step 4** after the existing "Step 3 —
Branch on response". Paste-ready:

> **Front-matter `description` (append one sentence):**
>
> ```
>   user can catch misinterpretations before execution begins. When the request points
>   to a handoff/ADR/research/plan, read every doc it references before any live tool use.
> ```
>
> **New step (insert after Step 3):**
>
> ```markdown
> ## Step 4 — Ground from referenced docs (before any live/external tool use)
>
> If the entry point is — or names — a handoff, ADR, research note, plan, or ticket,
> first enumerate **every** doc and path it references, then read those with file tools
> **before** any Bash/SSH/Web/MCP investigation.
>
> - A dated, verified doc written against the current state *is* the grounding pass.
>   Read what it references instead of re-deriving the facts live.
> - Do **not** re-run grounding the doc already captures (e.g. re-spelunking a
>   production host a handoff documents). Against production that is costly, not diligent.
> - Re-verify live only when there is a concrete reason to suspect the doc is stale —
>   and say what that reason is.
>
> Only after the referenced docs are read does live/external investigation begin.
> ```

Note: Step 4 is the first place tools are allowed, so it does not conflict with the
"no tools" constraint of Steps 1–3 (those precede the user's Go).

## Suggestion 2 — `adr-governance`: verify mechanisms before acceptance

Add to the review standard: for each invariant or mechanism an ADR asserts, name the
command / doc / code that shows it is **achievable on the target system** before status
flips to `accepted`. This is precisely what would have caught "native `openclaw cron`
can't run a multi-step wrapper" at write time instead of after acceptance. It turns the
"Decision Stability" dimension from prose-coherence into executable-claim verification.

## Suggestion 3 — `using-dev-skills`: treat invocation as a session-start default

`using-dev-skills` exists to map the right skill before acting; in this session it was
skipped, and so were `intake` / `cold-start-checkpoint` / `process-gates`. Several of the
session's missteps would have been pre-empted by invoking the ladder at the first message.
The fix is discipline, not new capability: default to consulting `using-dev-skills` at
session start rather than treating it as optional.

## Related: VPS/OpenClaw operational grounding

Rather than a new skill, operational grounding for the OpenClaw VPS work is better placed
as a `CLAUDE.md` in the inventory repo at `vps/OpenClaw/` — it auto-loads when working in
that subtree and lives next to the canonical docs (`README.md`, `gotchas.md`,
`migration.md`, `log.md`) it points to, with no risk of duplicating them. Drafted
separately in that repo.
