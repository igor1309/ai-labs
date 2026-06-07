---
date: 2026-06-07
model: claude-opus-4-8
description: "Adversarial review of the demo-instance exception sketch against ADR-017, the deployment-handoff standing decisions, and internal consistency."
---

# Demo-Instance Exception (Sketch) — Adversarial Review

## Scope

Reviewed `docs/demo-instance-exception.md` for ADR-017 fidelity, honesty about
the tension it introduces, conflicts with standing operational decisions, link
integrity, and internal consistency.

## Findings

### ADR-017 fidelity and honest framing

- **Verdict:** pass.
- **Why:** The sketch correctly states ADR-017's "private-instance product …
  not public multi-tenant SaaS" and its rejection of managed-SaaS-first
  (verified in ADR-017 Context/Decision), and it does not pretend the demo is
  free of tension — it frames the demo as a *deliberate, scoped exception* that
  is void if it drifts into the rejected SaaS posture. The "Status: sketch — not
  accepted, pending its own ADR" banner matches the repo's provisional-doc
  convention (cf. `deployment-target.md`).
- **Fix:** None required.

### Public `/admin` vs. the standing block

- **Verdict:** warn, fixed.
- **Location:** Proposed shape ("Clearly labeled") and Guardrails.
- **Why:** The sketch listed `/admin` as a labeled demo surface, but
  `deployment-handoff.md` records a standing decision that public `/admin` is
  blocked at the reverse proxy. A demo that publicly exposes `/admin` would
  silently override that decision — exactly the kind of unflagged conflict an
  adversarial pass should catch.
- **Fix:** The "Clearly labeled" bullet now conditions `/admin` exposure on the
  admin-access decision, and a new guardrail requires the demo to either keep
  `/admin` unexposed (run `/learn` only) or have its ADR explicitly revisit the
  standing block for the isolated demo host.

### LLM cost/abuse surface

- **Verdict:** pass.
- **Why:** The sketch names open-answer evaluation and LLM-assisted suggestions
  as the abuse/cost surface and bounds them (budgeted/rate-limited demo-only key
  or a deterministic stub provider — the deterministic provider already exists
  in the codebase for LLM-assisted suggestions). Isolation from any private
  instance's keys is explicit.
- **Fix:** None required.

### Relationship to the paved path

- **Verdict:** pass.
- **Why:** The sketch is explicit that the demo is an optional on-ramp, not a
  replacement for self-hosting, and links the paved-path plan. It does not let
  the demo become the real route to owning an instance. The "is a demo even the
  lowest-friction on-ramp?" open question keeps the proposal honestly tentative.
- **Fix:** None required.

### Link integrity

- **Verdict:** pass.
- **Why:** `plans/byoa-self-host-paved-path.md` and `deployment-handoff.md`
  resolve from `docs/`; both exist on this branch.
- **Fix:** None required.

## Warnings

The one warning above was fixed in this change set. None remain.

## Verification

- ADR-017 Context/Decision re-read for the SaaS-rejection and private-default
  claims.
- `grep -n -i caddy docs/deployment-handoff.md` — confirmed the standing public
  `/admin` block.
- Mechanical relative-link check over the sketch's links from `docs/`.
