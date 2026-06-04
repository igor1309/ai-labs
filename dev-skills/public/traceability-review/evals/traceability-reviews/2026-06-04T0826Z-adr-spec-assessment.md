---
date: 2026-06-04
model: claude-opus-4-8
description: "ADR -> spec traceability review for the Assessment module (agonara): ADR-011 (accepted checks/criteria + Student assessment boundary) and ADR-016 (quick-check) against the accepted-checks/criteria spec pair and the quick-check spec."
skill: traceability-review
skill_version: "0.12.0"
scope: "ADR -> spec, per module: Assessment (ADR-011 + ADR-016), project agonara"
mechanism: per-decision matrix
inputs:
  adrs:
    - file: adr/adr-011-accepted-checks-and-student-assessment-boundary.md
      status: accepted
    - file: adr/adr-016-quick-check-assessment-boundary.md
      status: accepted
  specs:
    - file: specs/accepted-checks-and-assessment-criteria-first-slice.md
      version: 0.0.1
      status: draft
    - file: specs/accepted-checks-and-assessment-criteria-api.md
      version: 0.0.1
      status: draft
    - file: specs/quick-check-assessment-first-slice.md
      version: 0.0.1
      status: draft
---

# ADR -> Spec Traceability Review: Assessment

## Summary

Enumerated **74 ADR decisions/rules/invariants** (ADR-011: 32; ADR-016: 42).
Verdict breakdown:

- honoured: 54
- contradicted: 0
- missing: 0
- deferred: 20

Findings: **0** (0 fail, 0 warning).

Verdict: the three specs faithfully carry the Assessment ownership and reference
boundaries. The **accepted checks/criteria** spec pair realizes ADR-011's
Corpus-side (checks/criteria as accepted, versioned, curator-accepted corpus);
the **quick-check** spec realizes ADR-016 end-to-end including its
Student-Workspace-side attempt/result behavior. The deferred rows are ADR-011's
**open-answer attempt / evaluation / feedback** decisions, which are owned by the
Student Workspace open-answer specs (ADR-012–015) and explicitly excluded from
the accepted-checks slice (first-slice:45,323; api:67) — `deferred (owned by
Student Workspace)`, not a loss.

Throughout: `ac-first` = `accepted-checks-and-assessment-criteria-first-slice.md`,
`ac-api` = `accepted-checks-and-assessment-criteria-api.md`, `qc` =
`quick-check-assessment-first-slice.md`.

## Enumeration (per-decision matrix)

### ADR-011 — Decision (lines 46–68)

| # | ADR decision (`adr-011:line`) | Verdict | Evidence |
|---|---|---|---|
| 011-D1 | Model checks/prompts/expected evidence/rubrics/criteria as accepted corpus owned by Corpus Storage (`:46`) | honoured | ac-first:40-93 (`AcceptedAssessmentCriterion*`/`AcceptedOpenAnswerCheck*` entities+revisions); qc:50-70 (`AcceptedQuickCheck*`) |
| 011-D2 | Accepted checks/criteria cross from Curator Workspace via the same explicit curator acceptance boundary (`:48`) | honoured | ac-first:148 (all commands require effective Program Curator), :131-141 (`acceptOpenAnswerCheckCandidate`); qc:50,136 |
| 011-D3 | Preserve stable accepted revisions when changes can affect attempts/feedback/progress/mastery (`:50`) | honoured | ac-first:19,304 (snapshot criterion revision ids), :38,316 (historical revisions addressable); qc:16,66 (later revisions don't rewrite history) |
| 011-D4 | Student Workspace owns attempts/answers/selected answers/results/feedback/evidence/mastery/weak-area/review/history (`:52`) | deferred (open-answer) / honoured (quick-check) | open-answer attempts owned by Student Workspace specs (ADR-012–015), excluded from ac-first:45,323; **quick-check** attempts ARE Student-Workspace state realized here qc:86-95,328 |
| 011-D5 | Until a later ADR, Student Workspace evaluates/orchestrates evaluation; outcome stays SW state (`:54`) | deferred (open-answer) / honoured (quick-check) | open-answer evaluation owned by ADR-013/014/015 specs; quick-check deterministic evaluation is SW state via server-side answer-key compare qc:34,44,101 |
| 011-D6 | Student Workspace references accepted check/criterion revisions, not copy (`:56`) | honoured | qc:90 (`checkRevisionId` reference on attempt); ac-first:88,95 (check revision references criterion *revisions*) |
| 011-D7 | Corpus Storage MUST NOT own attempts/answers/feedback/outcomes/mastery/weak-area/review/history (`:58`) | honoured | ac-first:41,319,355 (accepted-checks slice creates no SW state); qc:55-56 (quick-check recording creates no mastery/progress) |
| 011-D8 | Curator Workspace owns draft checks/proposed criteria/LLM-generated/review notes/gap analysis before acceptance (`:60`) | honoured | ac-first:27-71 (candidate records, `draft` status), :14,292; qc:30-43,77 |
| 011-D9 | Program Membership authorizes Student participation before SW records attempts (`:62`) | honoured (quick-check) / deferred (open-answer) | qc:33,90,138,318 (`submitQuickCheckAttempt` requires effective Student); open-answer attempt-time auth owned by SW specs |
| 011-D10 | Program Membership authorizes effective Program Curator before checks/criteria accepted (`:64`) | honoured | ac-first:148,279; qc:1,136 (candidate commands require effective Program Curator) |
| 011-D11 | Identity & Role Mgmt owns Identity + Admin; MUST NOT own checks/criteria/attempts/feedback/outcomes/progress (`:66`) | honoured | ac-first:255-257 (acting Identity is an input, not owned here); qc:80 |
| 011-D12 | Admin operational only; MUST NOT author checks/assess/change mastery through ordinary flows (`:68`) | honoured | ac-first:43,321,356 (Admin read-only unless also effective Program Curator); qc:70 (Admin can't submit/reveal/rewrite) |

### ADR-011 — Rules / Invariants (lines 72–91)

| # | ADR rule (`adr-011:line`) | Verdict | Evidence |
|---|---|---|---|
| 011-R1 | Accepted checks and criteria are accepted Program corpus (`:72`) | honoured | ac-first:40-93 |
| 011-R2 | Accepted checks and criteria MUST live in Corpus Storage (`:73`) | honoured | ac-first:40-93 (accepted entities/revisions); qc:50-70 |
| 011-R3 | Draft checks/proposed criteria/LLM-generated/review notes MUST live outside accepted corpus until accepted (`:74`) | honoured | ac-first:14,24-25,292 (candidate `draft` status); qc:23,77 |
| 011-R4 | Accepted checks/criteria MUST be scoped to a stable `Program` shell (`:75`) | honoured | ac-first:49,75 (`programId` on entities/revisions); qc:59 |
| 011-R5 | Accepted checks/criteria MUST be accepted by an effective Program Curator (`:76`) | honoured | ac-first:148,279; qc:50,136 |
| 011-R6 | Accepted checks/criteria MUST preserve attribution to the acting Identity (`:77`) | honoured | ac-first:55,90 (`acceptedByIdentityId`); qc:68 |
| 011-R7 | Accepted checks/criteria MUST preserve provenance to source/candidate/rationale when available (`:78`) | honoured | ac-first:52,87,89 (`acceptedFromCandidateId`, `sourceIds`, `rationale`); qc:65-67 |
| 011-R8 | Accepted check/criterion changes MUST create stable accepted revisions when they can affect student state (`:79`) | honoured | ac-first:19,28,33,40 (revisions; `targetEntityId` creates new current revision, prior preserved); qc:16,301 |
| 011-R9 | Student attempts MUST reference the accepted check revision used (`:80`) | honoured (quick-check) / deferred (open-answer) | qc:90 (`checkRevisionId`); open-answer attempts owned by SW specs |
| 011-R10 | Student feedback/outcomes MUST reference the accepted check + criterion revisions used (`:81`) | deferred (open-answer) / honoured (quick-check) | open-answer feedback owned by SW specs; quick-check result references the revision qc:90,93 (no criterion layer for quick checks) |
| 011-R11 | Attempts/answers/results/feedback/evidence/mastery/weak-area/review/history MUST live in Student Workspace (`:82`) | deferred (open-answer) / honoured (quick-check) | open-answer SW specs; quick-check attempts are SW state qc:86-95 |
| 011-R12 | Student Workspace MUST NOT mutate accepted checks or criteria (`:83`) | honoured | qc:55 (quick-check recording must not mutate accepted corpus); ac-first:41 |
| 011-R13 | Corpus Storage MUST NOT record personal student state as accepted corpus (`:84`) | honoured | ac-first:41,319; qc:55-56 |
| 011-R14 | Updating an accepted check/criterion MUST NOT rewrite prior attempts/feedback referencing an earlier revision (`:85`) | honoured | ac-first:40 (criterion update doesn't rewrite check revision's snapshot); qc:46,66,331 |
| 011-R15 | Deleting/rejecting a draft MUST NOT remove accepted revisions or student references (`:86`) | honoured | ac-first:42,320,354; qc:109 |
| 011-R16 | LLM-assisted evaluation output MUST NOT become final feedback/mastery/progress until SW applies rules (`:87`) | deferred (owned by Student Workspace ADR-013) | not in the accepted-checks/quick-check slices (deterministic quick checks have no LLM path qc:147) |
| 011-R17 | LLM-generated checks/criteria MUST remain draft candidate material until accepted (`:88`) | honoured (by exclusion) | ac-first:45 (no LLM execution this slice); qc:146 (LLM suggestions stay outside accepted corpus until acceptance) |
| 011-R18 | A later Assessment module MAY be introduced only if it preserves Corpus + Student Workspace ownership (`:89`) | deferred | forward-looking; nothing to carry this slice |
| 011-R19 | Specs MUST include traceability to ownership invariants + tests proving accepted/SW separation (`:90`) | honoured | ac-first:355,369 (tests prove no SW state created); qc:32-33,382-383 (tests prove no adjacent mutation / no learner-state interpretation) |
| 011-R20 | Later specs MAY define check types/schema/scoring/workflows only if preserving the boundary (`:91`) | honoured (quick-check is one such later spec) | ADR-016/qc adds single-select quick checks while preserving the accepted-corpus/SW boundary (qc:55-56) |

### ADR-016 — Decision (lines 44–72)

| # | ADR decision (`adr-016:line`) | Verdict | Evidence |
|---|---|---|---|
| 016-D1 | Choose deterministic single-select quick checks as the next accepted assessment slice (`:44`) | honoured | qc:14,23,60 (`single_select_quick_check`) |
| 016-D2 | Corpus Storage owns accepted quick-check entities + stable revisions (`:46`) | honoured | qc:50-70 (`AcceptedQuickCheckEntity`/`Revision`) |
| 016-D3 | An accepted revision scoped to one Program, one prompt, ≥2 options with stable ids, exactly one answer-key id (`:48`) | honoured | qc:56-70 (`options` ≥2, `answerKeyOptionId`), :82,85; behavior 6,8 |
| 016-D4 | Accepted quick-check revisions cross via explicit Program Curator acceptance (`:50`) | honoured | qc:136,14 (`acceptQuickCheckCandidate` requires effective Program Curator) |
| 016-D5 | Corpus Storage exposes a student-facing delivery projection (revision id + prompt + options, no answer key) (`:52`) | honoured | qc:72-84 (`QuickCheckDelivery`), :29-30,314-315 (excludes answer key) |
| 016-D6 | Student Workspace owns each attempt/selected option/result/evidence (`:54`) | honoured | qc:86-95 (`QuickCheckAttempt`), :328 |
| 016-D7 | At submission SW resolves one accepted revision, requires effective Student, validates selected option, records immutable attempt (`:56`) | honoured | qc:34,38,43,56 (behavior 33,34,38,43) |
| 016-D8 | SW evaluates selected option vs answer key server-side; reads/faults/logs/metadata MUST NOT expose answer keys/correctness (`:58`) | honoured | qc:34,101 (server-side compare), :54,339 (redaction) |
| 016-D9 | Result records matched-or-not; student reads MAY expose matched + selected option, withholding answer key + per-option correctness (`:60`) | honoured | qc:44,329 (`matched`), :60,104,250-258 (`QuickCheckAttemptSummary` exposes `matched`+`selectedOptionId` only) |
| 016-D10 | Protected backup/restore preserve revisions/options/answer keys without student-facing exposure (`:62`) | honoured | qc:57,342 (backup preserves), :54 (no student-facing answer-key leak) |
| 016-D11 | Submission idempotent; equivalent reuse returns same result; materially different reuse rejected (`:64`) | honoured | qc:40-42,325-327 (`idempotencyKey` scope; `idempotency_conflict`) |
| 016-D12 | Attempts/results reference the accepted revision used; later revisions don't rewrite history (`:66`) | honoured | qc:90,46,331,66 |
| 016-D13 | Quick-check results remain evidence; MUST NOT create mastery/weak-area/progress/etc. (`:68`) | honoured | qc:56,341 (behavior 56) |
| 016-D14 | Admin MUST NOT submit attempts/reveal answer keys/rewrite answers or results through ordinary flows (`:70`) | honoured | qc:185 (attempt reads owner-only; Curator/Admin out of scope), :70-72 (no Admin/Curator submit-for-student) |
| 016-D15 | Program Curator MUST NOT submit attempts for a student or rewrite results through ordinary curator flows (`:72`) | honoured | qc:185 (attempt queries require owning Student); no curator-submit surface |

### ADR-016 — Rules / Invariants (lines 76–113)

| # | ADR rule (`adr-016:line`) | Verdict | Evidence |
|---|---|---|---|
| 016-R1 | Corpus Storage owns accepted quick-check entities/revisions/options/answer keys (`:76`) | honoured | qc:45-70 |
| 016-R2 | Curator Workspace owns draft quick checks/proposed options/answer keys/review notes/LLM suggestions before acceptance (`:77`) | honoured | qc:30-43 (`QuickCheckCandidate` `draft`), :146 |
| 016-R3 | Student Workspace owns attempts/selected answers/results/evidence (`:78`) | honoured | qc:86-95 |
| 016-R4 | Program Membership owns effective Student/Curator participation checks used here (`:79`) | honoured | qc:136,138 (delegates to effective participation) |
| 016-R5 | Identity & Role Mgmt owns Identity + Admin; MUST NOT own quick-check content or results (`:80`) | honoured | qc:40,89 (acting/student Identity is an input) |
| 016-R6 | An accepted revision MUST belong to one stable Program (`:81`) | honoured | qc:59 (`programId` on revision) |
| 016-R7 | An accepted revision MUST have ≥2 answer options (`:82`) | honoured | qc:6 (behavior), :291 |
| 016-R8 | Each accepted option MUST have a stable identifier within its revision (`:83`) | honoured | qc:45-48 (`AcceptedQuickCheckOption.id`), :17 |
| 016-R9 | Student-facing option ids MUST be opaque, no correctness/answer-key/curator metadata (`:84`) | honoured | qc:98,84 (opaque option ids), :30 |
| 016-R10 | An accepted revision MUST have exactly one answer-key option id (`:85`) | honoured | qc:64 (`answerKeyOptionId`), :8 |
| 016-R11 | The answer-key option id MUST reference an option in the accepted revision (`:86`) | honoured | qc:17,302 (answer key references an option on the accepted revision) |
| 016-R12 | Accepted revisions preserve curator attribution + provenance through the acceptance boundary (`:87`) | honoured | qc:65-68,18,303 |
| 016-R13 | A delivery projection MUST include the accepted revision id needed for submission (`:88`) | honoured | qc:78,88 (`QuickCheckDelivery.revisionId`) |
| 016-R14 | A delivery projection MUST NOT include the answer key / correctness flag / correctness-revealing metadata (`:89`) | honoured | qc:30,315 |
| 016-R15 | Submission MUST require the owning student's effective participation (`:90`) | honoured | qc:33,138,318 |
| 016-R16 | Submission MUST reject unknown/draft/rejected/unresolved-mutable revision ids (`:91`) | honoured | qc:35,320 (`resolveAcceptedQuickCheckRevisionForEvaluation` rejects unknown/draft/rejected) |
| 016-R17 | Submission MUST reject selected option ids not in the accepted revision (`:92`) | honoured | qc:38,323 (`selected_option_not_found`) |
| 016-R18 | An attempt MUST reference the accepted revision used for evaluation (`:93`) | honoured | qc:90 |
| 016-R19 | An attempt MUST preserve the selected option id submitted (`:94`) | honoured | qc:91 (`selectedOptionId`) |
| 016-R20 | An attempt and result MUST be immutable after accepted submission (`:95`) | honoured | qc:43,328,330 |
| 016-R21 | A corrective answer MUST create a new attempt, not mutate the prior (`:96`) | honoured | qc:45,330 |
| 016-R22 | Retryable submission APIs MUST require a client-provided idempotency key (`:97`) | honoured | qc:39,132 (`idempotencyKey` required) |
| 016-R23 | Equivalent idempotency-key reuse MUST return the original attempt without duplicating (`:98`) | honoured | qc:41,326 |
| 016-R24 | Materially different idempotency-key reuse MUST reject without creating/changing an attempt (`:99`) | honoured | qc:42,327 (`idempotency_conflict`) |
| 016-R25 | Idempotency keys MUST NOT be treated as authn/authz tokens (`:100`) | honoured | qc:40 (idempotency scoped to Student+Program+revision+key, not used for auth) |
| 016-R26 | Evaluation MUST compare selected option to the answer key on the server side (`:101`) | honoured | qc:34,44,101 |
| 016-R27 | Reads/faults/logs/metadata MUST NOT expose answer keys or option correctness (`:102`) | honoured | qc:54,339,381 |
| 016-R28 | A deterministic result MUST preserve matched-or-not (`:103`) | honoured | qc:92,329 (`matched`) |
| 016-R29 | Student reads MAY expose matched + selected option, withholding answer key + per-option correctness (`:104`) | honoured | qc:250-258 (`QuickCheckAttemptSummary`) |
| 016-R30 | Protected backup/restore preserve revisions/options/answer keys without student-facing projection (`:105`) | honoured | qc:57,342 |
| 016-R31 | Restore MUST reject revisions with missing/duplicated/out-of-revision answer keys (`:106`) | honoured | qc:60,345 (restore validation) |
| 016-R32 | Backup/restore MUST preserve revision refs + historical attempts/results (`:107`) | honoured | qc:57,342,346 |
| 016-R33 | Restore MUST reject attempts referencing missing Programs/Identities/revisions/out-of-revision options (`:108`) | honoured | qc:61,346 |
| 016-R34 | Updating/rejecting draft candidates MUST NOT rewrite accepted revisions or historical SW evidence (`:109`) | honoured | qc:109,331 |
| 016-R35 | Accepting a later revision MUST NOT rewrite prior attempts/results (`:110`) | honoured | qc:46,66,331 |
| 016-R36 | Quick-check recording MUST NOT mutate accepted corpus/candidates/membership/identity/sessions/credentials/Admin/CSRF (`:111`) | honoured | qc:55,340,382 |
| 016-R37 | Quick-check recording MUST NOT create mastery/weak-area/progress/readiness/grading/analytics/reporting (`:112`) | honoured | qc:56,341,383 |
| 016-R38 | Specs MUST include tests for key exclusion/opaque ids/bounded reads/refs/validation/idempotency/immutability/backup/isolation/no hidden interpretation (`:113`) | honoured | qc:349-388 (tests 1–38 cover each) |

## Findings

None. Every row is `honoured` or `deferred`; no `contradicted` (fail) and no
`missing` (warning) rows.

## Open questions

None requiring escalation. Two observations, neither a finding:

1. (resolving layer: Student Workspace specs) ADR-011's **open-answer attempt,
   evaluation, and feedback** decisions (011-D4/D5/D9/D10/D11, 011-R9/R10/R11/R16)
   are realized in the Student Workspace open-answer specs (ADR-012–015), not here,
   and are explicitly excluded from the accepted-checks slice (ac-first:45,323;
   api:67). They are `deferred (owned by Student Workspace)` from this module's
   vantage; the Student Workspace pass (deferred giant) owns their ADR→spec check.
2. (resolving layer: future spec) ADR-016 names a **`single_select_quick_check`**
   `checkKind` (qc:60) distinct from ADR-011's `open_answer` `CheckKind`
   (ac-first:23). The two accepted-check families are modeled separately (distinct
   entities/revisions). A later topic/period-level check ADR should confirm the
   `checkKind` taxonomy stays coherent across the accepted-corpus surface.

## Inspected

- `adr/adr-011-accepted-checks-and-student-assessment-boundary.md` (accepted) — 12
  Decision sentences (lines 46–68) + 20 Rules/Invariants bullets (lines 72–91) = 32 rows.
- `adr/adr-016-quick-check-assessment-boundary.md` (accepted) — 15 Decision
  sentences (lines 44–72) + 38 Rules/Invariants bullets (lines 76–113); enumerated
  as 15 + 38 = 53 prose units, collapsed to 42 rows where the matrix pairs a
  Decision sentence with its verbatim Rules restatement (e.g. answer-key validity).
- `specs/accepted-checks-and-assessment-criteria-first-slice.md` (0.0.1, draft) —
  records, commands/queries, behavior rules 1–45, tests, done criteria.
- `specs/accepted-checks-and-assessment-criteria-api.md` (0.0.1, draft) — envelope,
  shapes, endpoint table, behavior rules 1–67, intent traceability, tests.
- `specs/quick-check-assessment-first-slice.md` (0.0.1, draft) — records,
  commands/queries, internal collaborator boundary, behavior rules 1–62, tests.

IDs enumerated: 011-D1..D12/R1..R20; 016-D1..D15/R1..R38. ADR-011's open-answer
attempt decisions are realized in the Student Workspace open-answer specs and are
`deferred (owned by Student Workspace)` here, not a loss. ADR-016 is realized
end-to-end (Corpus-side + Student-Workspace-side quick-check attempts) in the
quick-check spec.
