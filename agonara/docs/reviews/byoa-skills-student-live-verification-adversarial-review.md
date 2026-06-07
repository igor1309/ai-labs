---
date: 2026-06-07
model: gpt-5
description: "Adversarial review of the BYOA Student G5 live-verification closeout after rebase onto origin/trunk."
---

# BYOA Student G5 Adversarial Review

## Scope

Reviewed the rebased G5 closeout for:

- Student skill guidance in `agonara/skills/agonara-student/SKILL.md`.
- Runtime preview authorization in `agonara/src/corpus.js`.
- OpenAPI open-answer attempt request body in `agonara/docs/api/openapi.yml`.
- Live evidence and archived implementation-plan documents.

## Findings

### Archived Plan Links

- **Verdict:** fail, fixed.
- **Location:** `agonara/docs/plans/implemented/byoa-skills-student-live-verification.md:9`.
- **Why:** The plan was moved from `docs/plans/` to `docs/plans/implemented/`,
  but its opening links still used the old directory depth. Broken archive links
  violate the Markdown/link-maintenance expectation for implemented plans and
  make the G5 evidence path harder to audit.
- **Fix:** Repointed the implemented Student plan link to
  `byoa-skills-student.md` and the source artifacts to `../../api/openapi.yml`
  and `../../intent/student_user_stories.md`.
- **Tests:** Ran a mechanical link check over the changed Student plan and
  review Markdown files; no missing relative links remained.

### Preview Authorization Boundary

- **Verdict:** pass.
- **Location:** `agonara/src/corpus.js:946`, `agonara/src/corpus.js:1063`,
  `agonara/src/corpus.js:2246`.
- **Why:** The widened authorization is limited to the state-free list previews:
  accepted corpus and program navigation require an active identity plus an
  existing program, while detail reads still use
  `resolveAcceptedReadAuthorization` at `agonara/src/corpus.js:1106` and
  `agonara/src/corpus.js:1130`.
- **Fix:** No change required.
- **Tests:** Existing focused corpus and HTTP tests cover preview reads without
  membership and protected detail/curator routes.

### Open-Answer Contract Alignment

- **Verdict:** pass.
- **Location:** `agonara/docs/api/openapi.yml:2851`;
  `agonara/skills/agonara-student/SKILL.md:126`.
- **Why:** The OpenAPI request body and Student skill now name the runtime field
  `submittedAnswer`, matching the existing HTTP tests and live G5 transcript.
- **Fix:** No change required.
- **Tests:** Existing open-answer HTTP coverage already exercises
  `submittedAnswer`; G5 staging run `91e1aad8` submitted and evaluated an open
  answer with that shape.

### Skill Quality

- **Verdict:** pass.
- **Location:** `agonara/skills/agonara-student/SKILL.md:1`.
- **Why:** Using the `skill-review` axes, the Student skill keeps high-signal
  role guidance: dependencies are delegated to foundations, the student boundary
  is explicit, and the workflow sections carry exact routes and request bodies
  that a fresh agent needs to operate through the API.
- **Fix:** No change required.
- **Tests:** Covered by the live G5 evidence and the formal route/body scans
  performed during implementation.

## Warnings

None.

## Verification Commands

- `python3` mechanical relative-link check over the changed Student plan and
  review Markdown files.
- `./scripts/loc-dashboard.sh --sort=name`.
