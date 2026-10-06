---
date: 2026-08-03
model: gpt-5.6
description: "Read-only independent-review findings, audit, judgment, and owner-routing contract for adversarial-cycle."
---

# Independent Review Contract

## Purpose

An independent review is a read-only second pass over a committed plan or
implementation. It attacks the artifact against its upstream contract and
returns evidence for the cycle orchestrator to judge. The reviewer does not
edit the target, apply fixes, update the tracker, or spend a review round.

The cycle resolves the reviewer from the selected runtime profile. This file
defines the neutral findings and audit vocabulary used after that resolution.

## Findings contract

The reviewer returns one structured record with these fields:

| Field | Required value |
|---|---|
| `artifact` | Absolute or repository-relative path and artifact kind |
| `artifact_sha` | Commit SHA the review read |
| `upstream_contract` | Brief, plan, or source paths used as the authority |
| `reviewer.runtime` | Runtime that produced this pass |
| `reviewer.model` | Concrete model identifier used for this pass |
| `reviewer.reasoning_effort` | Concrete effort used for this pass |
| `reviewer.launcher` | Resolved launcher adapter |
| `reviewer.provider` | Provider recorded by the resolved profile |
| `classification` | `cross-runtime`, `same-runtime-fresh-pass`, or `legacy-codex-review` |
| `read_only` | `true`; any edit is a contract failure |
| `findings` | Zero or more finding objects |
| `verdict` | `clean` or `findings` |

Each finding object contains a stable `id`, exact `location`, `severity`,
`impact`, the violated contract or rule, evidence from the artifact or its
upstream source, and a concrete proposed fix. A clean result explicitly uses
an empty `findings` array; absence of text is not a clean verdict.

The audit records the orchestrator runtime/model/provider alongside the
reviewer values. `cross-model` may be recorded only when the concrete model
identifiers differ. `cross-vendor` may be recorded only for `cross-runtime`
when the recorded providers differ. A fresh pass on the same runtime remains
`same-runtime-fresh-pass` even when its model differs.

## Judgment

The orchestrator independently verifies each finding against the upstream
contract and actual code before choosing a verdict:

- **ACCEPT** when the location and premise are proven, the impact is material,
  and the proposed change belongs to this artifact's owner.
- **HAND-WAVE** when the premise is factually wrong, already handled, out of
  scope, or unsupported by the evidence. The reason is recorded with the
  finding; convenience, reachability difficulty, or model confidence is not a
  reason.

The audit appends the original findings, each judgment, the rationale, the
owner, and the resulting action. A reviewer is never allowed to apply an
accepted fix before judgment.

## Owner-routed fixes

Accepted findings are routed to the owner of the artifact:

| Artifact | Fix owner |
|---|---|
| Brief or plan | Planner |
| Implementation step | Implementer for that step |
| Review/audit evidence | Orchestrator, limited to evidence correction |

The owner makes a surgical follow-up commit, reruns the affected gate, and
returns the artifact to review. The orchestrator preserves the original review
record and links the follow-up commit to the accepted finding.

## Two-round rule

Each artifact has a stateful fix-round counter. Before dispatching a follow-up,
the orchestrator increments and commits the counter. A dispatched but
interrupted follow-up consumes its round. After two rounds, any unresolved fail
or warning is a terminal `stopped` condition; the cycle does not keep looping
or silently weaken the contract.

## Legacy trackers

Committed trackers that use the historical `codex-audit` key are not rewritten.
On resume, the entry is interpreted as an independent audit with
`classification = legacy-codex-review`. New records use the neutral
independent-review names and include the resolved execution-manifest digest.
