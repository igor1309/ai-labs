---
date: 2026-06-07
model: claude-opus-4-8
description: "Adversarial review of the BYOA self-host paved-path gap-closing plan against ADR-017, the implementation-plan declaration checklist, and the actual on-disk deployment artifacts."
---

# BYOA Self-Host Paved Path — Plan Adversarial Review

## Scope

Reviewed `docs/plans/byoa-self-host-paved-path.md` for declaration-block
validity, ADR-017 fidelity, factual accuracy of its claims about existing
artifacts, link integrity, and scope honesty.

## Findings

### Declaration block validity

- **Verdict:** pass.
- **Why:** Against the `implementation-plan` acceptance checklist, all required
  fields are present and each enum value is legal — `Execution mode:
  human-review-gated`, `Worktree mode: none`, `Push policy: push at closeout`,
  `Preflight check` unchecked. Phases declare no worktree/branch/push of their
  own; `Expected worktree`/`Expected branch` resolve to one task-level target;
  push cadence is at task closeout, not per phase.
- **Fix:** None required.

### "Hardcodes /opt/agonara" overclaim

- **Verdict:** warn, fixed.
- **Location:** Problem section.
- **Why:** `scripts/deploy-prod.sh:11` reads
  `DEPLOY_ROOT="${AGONARA_DEPLOY_ROOT:-/opt/agonara}"` — `/opt/agonara` is an
  env-overridable default, not a hardcoded path. "Hardcodes" overstated the
  coupling and would fail a verify-before-hedging check.
- **Fix:** Reworded to "defaults its deploy root to `/opt/agonara`, and assumes
  the author's host, env files, and secrets." The substantive point (the script
  is `agonara-vps`/CI-shaped, not operator-facing) stands.

### demos.md overlap unacknowledged

- **Verdict:** warn, fixed.
- **Location:** Phase 2.
- **Why:** `docs/demos.md` already has a `## Docker Demo` section covering the
  local loopback path. Proposing a new `docs/self-hosting.md` without
  acknowledging that overlap risked duplicate, drifting Docker instructions.
- **Fix:** Phase 2 now states the runbook extends and cross-links the demos.md
  Docker Demo (loopback) and adds the reverse-proxy + TLS + own-domain
  production shape on top, rather than duplicating it.

### ADR-017 fidelity of reference choices

- **Verdict:** pass.
- **Why:** ADR-017's non-goals explicitly leave the reverse-proxy product, TLS
  mechanism, hostnames, and backup tooling undecided. The plan's Caddy /
  build-on-host / off-host-backup choices are framed as recommended operator
  defaults, not as new architectural narrowings, and the Caddy choice matches
  the author's existing proxy (`deployment-handoff.md:46`). No ADR-017 invariant
  is contradicted; the plan's scope guardrails name "changing ADR-017's
  boundary" as out of scope.
- **Fix:** None required.

### Forward link to the demo-instance sketch

- **Verdict:** pass.
- **Location:** Problem section and Traceability.
- **Why:** The plan links `../demo-instance-exception.md`, created in the same
  change set (sketch step). The link resolves at branch completion; it is an
  intra-branch forward reference, not a dangling cross-repo link.
- **Fix:** None required.

### Claim-level definition of done

- **Verdict:** pass.
- **Why:** The DoD ties acceptance to a non-author reaching a working HTTPS
  instance, a rehearsed restore drill (ADR-017 G3), and an agent connection from
  published docs alone — which is precisely what converts the BYOA "your
  instance" claim from hollow to backed. It does not declare success on document
  authoring alone.
- **Fix:** None required.

## Warnings

Both warnings above were fixed in this change set. None remain.

## Verification

- `grep -n DEPLOY_ROOT scripts/deploy-prod.sh` — confirmed the `/opt/agonara`
  default is env-overridable.
- `grep -n -i caddy docs/deployment-handoff.md` — confirmed Caddy is the
  author's existing proxy.
- `grep -n '^#' docs/demos.md` — confirmed the existing `## Docker Demo` section.
- Mechanical relative-link check over the plan's links from `docs/plans/`.
