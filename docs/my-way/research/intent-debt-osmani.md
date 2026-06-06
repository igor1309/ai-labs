---
title: Intent Debt (Addy Osmani) — Summary and Implications for My Way
date: 2026-06-06
model: claude-opus-4
description: "Summary of Addy Osmani's 'intent debt' essay and a gap analysis of My Way against it."
author: Igor Malyarov
format: research
---

# Intent Debt (Addy Osmani) — Summary and Implications for My Way

## Purpose

Capture the argument of Addy Osmani's *intent debt* essay and use it as a mirror
for My Way: where the method already defends against intent debt, where it does
not, and what is worth borrowing. This research exists to sharpen the next
conversation about whether My Way needs new layers, gates, or vocabulary.

## Provenance and confidence

The primary source (`https://addyosmani.com/blog/intent-debt/`) could not be
retrieved from this environment: the network policy is allowlist-restricted
(`Host not in allowlist`) and the origin returns HTTP 403 to automated fetchers
across direct, RSS, proxy, and mirror routes. This summary was therefore
reconstructed from web-search excerpts of the essay plus closely related primary
sources (Osmani's *comprehension debt* essay and the academic *Triple Debt*
framing). Treat it as a faithful but second-hand reconstruction.

Confidence levels:

- **High** — the core definition, the contrast with technical debt, the
  "specs can't capture all intent" argument, the intent-first / ADR / BDD
  remedies. These appear consistently across multiple excerpts.
- **Medium** — exact attribution of the *Triple Debt Model* and the
  intent→cognitive→technical causal chain. The term and model appear to
  originate in academic work (Storey et al., *From Technical Debt to Cognitive
  and Intent Debt*, arXiv 2603.22106); Osmani's essay popularizes and builds on
  it. Verify wording against the original before quoting.
- **To verify** — any specific list ordering, headings, or direct quotes. Open
  the original when the allowlist permits.

## Core definition

**Intent debt** is the absence or erosion of the explicit rationale, goals, and
constraints that should guide how a system evolves. It accumulates when the
goals, constraints, and specifications that *should* steer a system are unclear,
poorly articulated, or — critically — **not captured in any artifact that humans
and, increasingly, AI agents can consult**.

The setting is AI-accelerated development: agents generate code faster than teams
can understand it. Two under-appreciated debts accumulate alongside ordinary
technical debt:

- **Cognitive debt** — erosion of *shared understanding* across the people on a
  team.
- **Intent debt** — absence of *externalized rationale* that developers and AI
  agents need to work safely with the code.

### The Triple Debt Model

A three-part model of software health (medium confidence on exact framing):

| Debt | Lives in | Question it answers |
|---|---|---|
| Technical debt | the code | "Is the implementation sound?" |
| Cognitive debt | the people | "Does anyone still understand it?" |
| Intent debt | externalized knowledge | "Is the *why* written down where it can be consulted?" |

The debts are causally linked: **intent debt causes cognitive debt** (if the
purpose isn't documented, new humans — and new agents — can't form accurate
mental models), and **cognitive debt causes technical debt** (people who don't
understand the system make poor implementation decisions). Intent debt is thus
the upstream root, not a peer symptom.

## Why it differs from technical debt

Technical debt **announces itself** through friction — slow builds, tangled
dependencies, the dread of touching one module. It is usually a *conscious
tradeoff*: you chose the shortcut, you know roughly where it lives, you can
schedule the paydown.

Intent debt **accumulates invisibly**. Even when the surrender of understanding
is intentional ("just ship it, the agent wrote it"), the resulting debt is silent
— the team does not realize what understanding it is losing until it is gone.
There is no build that slows down to warn you that the *reason* a decision was
made has evaporated.

## Why detailed specs alone are not enough

A tempting remedy is: write a detailed natural-language spec, put it in the PR,
review the *spec* instead of the code, and trust the AI translated it faithfully.
Osmani's sharpest point is that this is insufficient. Translating a spec into
working code requires an **enormous number of implicit decisions** — edge cases,
data structures, error handling, performance tradeoffs, interaction patterns —
that *no spec ever fully captures*. Two engineers (or two agents) implementing
the same spec produce systems with many observable behavioral differences. The
intent that lives in those implicit decisions is exactly the intent that goes
undocumented and becomes debt.

## Recommended practices

- **Intent-first workflows**: capture intent, constraints, and rationale
  *before* the AI generates code, not after.
- **Capture design rationale in ADRs**: the "why this over the alternatives" is
  the asset most worth externalizing.
- **BDD-style specifications that encode purpose**: specs that express intended
  behavior and its reason, not just surface requirements.
- **Governance starts upstream**: intent, constraints, and threat models should
  shape the agent's working context *before* generation begins, aiming at
  build-time boundaries that keep structurally invalid code out of the system.
- **Externalize for both audiences**: rationale must land in artifacts that
  *both* humans and AI agents can read — chat logs and tacit knowledge don't
  count.

## Implications for My Way

My Way is, in the blog's vocabulary, **largely an intent-debt-prevention
method**. The alignment is strong enough that the most useful framing is "where
does it already pay this down, and where does it leak?"

### Where My Way already defends well

- **Intent-first by construction.** The chain starts at Product Intent (the
  user-facing *why*), not at technical uncertainty — exactly the "intent-first
  workflow" the essay asks for.
- **Rationale is externalized and committed.** ADRs record "why this path over
  alternatives," consequences, and non-goals; all artifacts are version-
  controlled alongside the code, "inspectable, reviewable, and traceable — not
  buried in chat logs." This is precisely "captured in an artifact humans and AI
  agents can consult."
- **Behavioral intent is encoded.** Spec-with-test-names as definition of done
  and the executable-spec → TDD chain push intent toward something checkable —
  close kin to the BDD remedy.
- **Intent stays living.** The loop feeds implementation reality back up to
  spec / ADR / Product Intent, resisting the *erosion* half of intent debt.
- **Drift is caught.** Review-as-enforcement and the traceability-review skill
  give a structured second pass against the canonical intent.

### Gaps worth closing

1. **Cognitive debt (the people axis) is under-addressed.** My Way captures
   intent in artifacts — strong for intent debt and for AI consumers — but has no
   explicit practice that verifies a *human still understands* the
   (often AI-generated) code: no comprehension check, no "explain it back," no
   onboarding-readiness gate. The Triple Debt Model names this as a distinct
   debt. Borrow: a lightweight human-comprehension gate or artifact, separate
   from artifact-conformance review.

2. **The implicit-decision leak is not actively captured.** The essay's hardest
   claim is that intent lives in implicit decisions the spec never states, which
   the agent then makes invisibly. My Way's Artifact stage is the natural home
   for "design decisions that informed the work but didn't rise to ADR level,"
   but it is *passive* ("when the knowledge is durable"). Borrow: make it
   *active* — at the end of a TDD slice, explicitly prompt "what did you decide
   that the spec didn't say?" and route the answer back to spec / ADR / artifact.

3. **No notion of paying down accumulated intent debt over time.** Intent debt
   "accumulates invisibly." My Way's traceability-review skill is the lever, but
   it isn't yet framed as a periodic *intent audit* (modules with no traceable
   rationale, ADRs whose rationale no longer matches reality, stale intent).
   Borrow: reframe traceability review partly as scheduled intent-debt paydown.

4. **Intent artifacts aren't provably *in the agent's context at generation
   time*.** The essay stresses governance "before generation begins." My Way
   commits artifacts to the repo (available) but doesn't guarantee the relevant
   ADR / spec / intent is *actively loaded* into the coding agent's working
   context, nor enforce build-time boundaries from them. Borrow: wire intent
   artifacts into the agent's inputs, not just the filesystem.

5. **Lite paths are where intent debt silently accrues.** The essay warns intent
   debt collects on the small, "obvious" changes. My Way's minor-feature and
   bug-fix paths collapse intent capture into a change note. Borrow: a minimal
   "why" floor even on lite paths, so the escape hatches don't become the leak.

6. **Erosion/decay is only modeled for Product Intent.** Change-propagation and
   impact review exist for Product Intent, but the *erosion* half of intent debt
   applies to every layer (an ADR's rationale can stop matching reality). Borrow:
   a general "intent freshness" concept across layers.

7. **Vocabulary.** "Intent debt" and "cognitive debt" give My Way a sharp name
   for the enemy it already fights. Borrow rhetorically: the elevator pitch /
   framing notes can state plainly that the method exists to prevent intent debt
   and keep cognitive debt low — naming the adversary sharpens the pitch.

### What *not* to borrow uncritically

- The essay's remedies (write ADRs, BDD specs) are weaker and less integrated
  than what My Way already runs. My Way's progressive commitment, separation of
  exploratory vs committed documents, and explicit Product Intent traceability
  anchor are *stronger* than "write ADRs." Adopt the vocabulary and the two
  people-facing gaps (cognitive debt, implicit-decision capture), not the basic
  prescriptions.

## Open questions

- Should My Way add an explicit **cognitive-debt / human-comprehension gate**,
  distinct from artifact-conformance review?
- Should the **Artifact stage become active** — a required "implicit decisions"
  capture at the end of a TDD slice — rather than opportunistic?
- Should intent artifacts be **injected into the coding agent's context** at
  generation time, with build-time boundaries, rather than merely committed?
- Is "intent debt" worth adopting as **first-class My Way vocabulary** in the
  elevator pitch and framing notes?
- Do the **lite paths need a minimal "why" floor** to stop being the silent leak?
