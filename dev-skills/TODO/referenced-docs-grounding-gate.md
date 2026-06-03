---
date: 2026-06-03
model: claude-opus-4-8
description: "Skill improvements from the scoped-orchestrator session — all shipped: cold-start-checkpoint referenced-docs grounding gate v1.2.0; adr-governance Mechanism Feasibility dimension v1.1.0; using-dev-skills session-start default v1.0.2. Remaining: VPS/OpenClaw operational grounding (tracked separately)."
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

## Related: VPS/OpenClaw operational grounding

Rather than a new skill, operational grounding for the OpenClaw VPS work is better placed
as a `CLAUDE.md` in the inventory repo at `vps/OpenClaw/` — it auto-loads when working in
that subtree and lives next to the canonical docs (`README.md`, `gotchas.md`,
`migration.md`, `log.md`) it points to, with no risk of duplicating them. Drafted
separately in that repo.
