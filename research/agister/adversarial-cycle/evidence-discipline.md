---
date: 2026-07-23
model: claude-opus-4-8
description: "The Reviewer's falsification rulebook for the adversarial-cycle engine — how a committed proof is attacked. Caller-agnostic; consumed by the ## reviewer step, not the caller."
---

# Evidence discipline

The rules the Reviewer applies when it attacks an Implementer's committed proof. The task's
brief supplies *what* must be proven (surfaces, acceptance criteria); this file is *how* a proof
is judged real. A proof that fails any applicable rule is a finding.

## Artifact-gated

- **No artifact, no checkmark.** Each DoD item names its artifact, what the artifact must show,
  and provenance — producing command, build SHA, simulator UDID, timestamp. Confidence is not
  evidence.
- **Evidence pins to a tree, not a branch.** Every artifact cites the SHA it ran against; any
  commit after the last verified run — a "pure" refactor, a lint pass, a squash — breaks the pin
  until a green re-run at the new tip or an explicit `git diff <verified-sha> <tip>`-empty
  equivalence statement.

## Oracle and causality

- **Capture the oracle first.** Expected values come from captured backend bodies or the spec —
  never from memory. Assertions compare against the captured oracle.
- **Causality needs a negative control.** Show the defect present without the fix and absent with
  it. Walking the path *before* the fix yields this for free — the baseline is both reproduction
  proof and negative control.
- **Coincidence is an adversary; sentinels defeat it.** When a live value happens to equal the
  suspect hardcode, live-data runs prove nothing for that leg. Stub sentinel values that exist in
  no build and look nothing like real data (433/7177, not "almost-real" 591/1501), and cover the
  grid: value missing / each source alone / all sources present with distinct values.

## The judge tier

- **For request-shaped defects, the wire is the judge.** The captured request body carries the
  verdict; UI renders downstream are corroboration, not the judge.
- **Prefer a discriminating assertion over visual comparison.** Encode the expected behavior as an
  assertion that *fails on the unfixed build*; the check then carries the verdict itself,
  re-runnable, no eyeballing.
- **Classify each check: presence or rendering.** Presence (an element/string is there, or gone)
  is judged by the hierarchy — a flow assertion first, a hierarchy-dump grep when no selector
  expresses it. Rendering fidelity (color, truncation, overlap, wrong asset, spacing) never
  reaches the hierarchy — there the screenshot is the judge, disciplined as before/after pairs on
  the same simulator and scale, cropped to the region. A hierarchy check that passes on the
  unfixed build means the defect lives below the hierarchy: move that item to the screenshot tier.
- **Gate visual checks behind a passed presence assertion.** Capture the screenshot only after the
  hierarchy confirms the asserted state — a capture anchored to a passed assertion provably shows
  that state rather than an arbitrary moment.
- **Absence is evidence.** An expected call that never fires (traffic tail, with the capture
  window noted) is a finding, not missing data.

## Coverage

- **Verify every implicated surface; split verdicts per surface.** Distinct surfaces render the
  same data from different code paths; a proof that patches one and asserts on another is weak.
- **The tracker is history.** Record fail verdicts and rounds as they happened; append, do not
  overwrite earlier rounds.
