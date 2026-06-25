---
date: 2026-06-25
model: claude-opus-4-8
description: "Intellectual comparison of cairana's practice-workbench product thinking against the six-product market feature landscape — organizing-artifact lens"
---

# Cairana vs. the Market Feature Landscape

An intellectual comparison — not a feature checklist — between cairana's current
product thinking and the competitive landscape.

Sources:

- Cairana product thinking: [`../docs/cairana-product-recap.md`](../docs/cairana-product-recap.md)
  ("Personal Practice Workbench" was the generic placeholder used in discussion
  before the cairana name existed; it refers to cairana).
- Market landscape: [`feature-landscape.md`](feature-landscape.md), synthesized
  from the six first-tier product reports in [`products/`](products/).

## 1. The lens

Rather than comparing feature-by-feature, this reads both through one question:
**what does each treat as the precious, organizing artifact** — the thing the
whole system exists to produce and protect? That single choice cascades into
what AI is pointed at, what is kept versus discarded, and who the system faces.

Two alternative lenses were considered and set aside (either can be run later):
jobs-to-be-done (what job the clinician hires each for), and a whitespace
overlay (replaying the landscape's §5 gaps against cairana).

## 2. The market's organizing artifact: the note-as-transaction

All six products center on moving a note *out of the clinician's head and into a
payer / EHR / audit trail* quickly: capture → draft → code → compliance-scan →
claim. Continuity features (Upheal Treatment Summaries, Blueprint pre-session
summaries, treatment plans) are scaffolding around that engine. Even the
intelligence layers (Mentalyc Alliance Genie, Eleos Clinical Insights) are
per-session signals that ultimately feed documentation. The note is an **output
that exits**.

## 3. Cairana's organizing artifact: the maintained understanding

Cairana treats the Session Record — the very artifact the market competes
hardest to produce — as *feedstock*, and pushes the raw transcript into cold
archive (recap §5–§6). What it builds to protect is the **evolving
understanding**: Case Memory (Current Case View + Case Journal), and across
cases, an understanding of *the practitioner* (Practice Projection). The output
is **cognition that stays**.

That one inversion explains most of cairana's Non-Goals (recap §2) at a stroke.
Billing/RCM, compliance/audit, EHR, multi-user, marketplace — the commercial
superstructure the market differentiates on (Eleos, JotPsych, Oasys especially)
— is carved away because none of it serves a maintained private understanding.

## 4. Where cairana's concepts have — and lack — market analogues

| Cairana primitive | Closest market analogue | Why it is not the same |
|---|---|---|
| Session Record | Everyone's progress note | Market: terminal deliverable. Cairana: base feedstock. |
| Client Brief | Upheal Treatment Summaries; Blueprint pre-session summaries | Market versions are on-demand generations; cairana's is backed by a *maintained* dual-view memory. |
| Current Case View | Charts / client records (all six) | Charts accrete; none maintains a compact "what I need to know *now*" distinct from the note pile. |
| Practice Projection / Toolbox Evaluation | Practice analytics (all six) + Alliance Genie | Market analytics are *operational* (revenue, utilization, no-shows); Alliance Genie is per-session and client-facing. None looks *cross-case at the clinician's own technique*. |

## 5. The two uncontested moves

1. **Case Memory as a current-view-plus-journal primitive.** The market has
   containers (charts); it has no maintained, compact, self-pruning understanding
   with a git-log-style history of how the case understanding changed.
2. **Practitioner self-observation as a product spine** (recap §8 — Toolbox,
   Stuckness, Development Projection, feeding Agonara). This is the clearest
   whitespace in the entire feature landscape: across six products, essentially
   nothing turns a full caseload into a mirror on *the practitioner*. It is
   defensible and ties to the existing Agonara bet.

## 6. Two honest tensions

- **Cairana still cannot escape the market's hardest table-stake.** Reliably
  turning messy residue (transcript / dictation / handwriting / OCR) into a
  *trustworthy* compact record is exactly what the six pour effort into. Cairana
  discards the superstructure but inherits this one core competency. That is a
  real build-versus-leverage question: the capture→record layer is the single
  place cairana overlaps the market, and could even consume a market tool as a
  component rather than rebuild it.

- **A client-outcome blind spot, by choice.** The market has a live fork on
  outcomes — Blueprint's questionnaire-driven measurement-based care versus
  Mentalyc's session-content-derived progress. Cairana picks neither; its
  measurement energy goes to the practitioner side. Coherent for a private
  development tool — but source pain #3 ("tracking whether the client is
  improving", recap §3) is named and then left unserved. Worth deciding
  consciously whether that is deferred or abandoned.

## 7. One-line synthesis

The market sells a faster, more defensible **exit** for the session (note →
claim → audit trail). Cairana keeps the session **inside** the practitioner's
cognition — as durable Case Memory and cross-case self-observation — and treats
the market's headline capability (the AI scribe) as a demoted input.
