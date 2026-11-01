---
date: 2026-06-03
model: gpt-5
description: "Spec: Agonara Quick Check product UI."
version: 0.0.1
status: implemented
type: spec
---

# Quick Check Product UI

## Goal

Define the browser UI contract that lets effective Program Curators manage deterministic single-select Quick Checks and effective Students answer them through the implemented Quick Check HTTP API.

## Public interface

### Route

| Method | Path | Auth | Response |
|---|---|---|---|
| `GET` | `/learn` | none for shell delivery; API calls require session cookie | HTML product shell for Quick Check workflows |

### Runtime state

```ts
type QuickCheckUiSessionState = {
  csrfToken: string | null;
  identity: { id: string; displayName: string } | null;
};

type QuickCheckUiProgramContext = {
  programId: string;
  roleMode: "curator" | "student";
};

type QuickCheckUiStatus =
  | { tone: "idle"; text: string }
  | { tone: "accepted"; text: string }
  | { tone: "rejected"; text: string }
  | { tone: "fault"; text: string };
```

### UI screens and controls

| Screen | Required controls | Backing route |
|---|---|---|
| Sign-in | login, password, submit, status | `POST /identity/sessions` |
| Session | signed-in identity summary, refresh, logout | `GET /identity/session`, `DELETE /identity/session` |
| Program context | program id input, role mode tabs for Curator and Student | none; controls scope subsequent API calls |
| Curator candidate list | status filter, refresh, candidate rows with title/status | `GET /programs/{programId}/quick-checks/candidates` |
| Curator candidate creation | title, prompt, option list, answer-key option choice, optional rationale, create | `POST /programs/{programId}/quick-checks/candidates` |
| Curator candidate actions | accept, reject, optional replacement target entity id, curation detail | `POST /quick-checks/candidates/{candidateId}/acceptance`, `POST /quick-checks/candidates/{candidateId}/rejection`, `GET /quick-checks/revisions/{revisionId}/curation` |
| Student delivery list | refresh, delivery rows with title/prompt/options | `GET /programs/{programId}/quick-checks` |
| Student delivery detail | revision detail, selectable options, submit | `GET /quick-checks/revisions/{revisionId}`, `POST /programs/{programId}/quick-check-attempts` |
| Student attempt list | refresh, optional revision filter, attempt rows | `GET /programs/{programId}/quick-check-attempts` |
| Student attempt detail | selected option, matched result, submitted timestamp | `GET /quick-check-attempts/{attemptId}` |

## Behavior rules

1. `GET /learn` returns an HTML shell without embedding bootstrap secrets, plaintext passwords, password hashes, session ids, CSRF tokens, cookies, authorization headers, idempotency keys, answer keys, SQL text, filesystem paths, stack traces, provider details, or infrastructure details.
2. The shell authenticates by posting login credentials to `POST /identity/sessions` and keeps the returned CSRF token only in browser runtime state.
3. Session refresh maps to `GET /identity/session` and replaces the runtime CSRF token with the returned current token.
4. Logout maps to `DELETE /identity/session` with `X-Agonara-CSRF`, clears runtime session state, and returns the shell to signed-out state.
5. State-changing Quick Check UI actions send `X-Agonara-CSRF` with the active session's CSRF token.
6. Student attempt submission generates a fresh `X-Agonara-Idempotency-Key` for a new answer attempt and reuses the same key only for an explicit retry of the same pending submission.
7. Program context requires a non-empty Program id before Curator or Student Quick Check requests run.
8. Curator candidate creation accepts only `single_select_quick_check`, a non-empty title, a non-empty prompt, at least two options, one selected answer-key option, and optional rationale.
9. Curator candidate creation keeps the answer-key selection visible only inside Curator screens.
10. Curator candidate listing may show candidate ids, answer-key option ids, rationale, accepted curator attribution, and acceptance time only in Curator screens.
11. Student delivery screens must not render candidate ids, answer-key option ids, per-option correctness metadata, rationale, accepted curator attribution, acceptance time, idempotency keys, or curator-only curation metadata.
12. Student attempt screens may render `matched` as a result signal but must not render the accepted revision answer key or per-option correctness metadata.
13. Non-owner attempt-detail responses that return `404 attempt_not_found` are displayed as unavailable attempts without exposing whether another Student owns the attempt.
14. HTTP `accepted`, `rejected`, and `fault` envelopes render as status messages without dumping raw JSON by default.
15. Fault rendering must not expose stack traces, SQL text, filesystem paths, database URLs, cookies, CSRF tokens, session identifiers, idempotency keys, or provider details.
16. The UI must keep Curator and Student views visually and programmatically separate so that a Student view cannot reuse Curator projections.
17. The UI must remain usable at desktop and mobile widths without overlapping text, buttons, tables, forms, or status messages.
18. This UI does not add Program discovery, material navigation, topic-level checks, period-level checks, mastery calculation, weak-area calculation, progress interpretation, review scheduling, grading, analytics, reporting, external provider calls, evaluator workers, queues, or human review behavior.

## Tests (required)

1. `GET /learn` serves an HTML shell with the product app root and without embedded secrets, session ids, CSRF tokens, cookies, idempotency keys, answer keys, SQL text, paths, or stack traces.
2. Browser test signs in through the shell and shows the signed-in identity without rendering the session cookie name or CSRF token.
3. Browser test uses Curator mode to create a Quick Check candidate with two options and one answer-key selection.
4. Browser test uses Curator mode to list draft candidates and accept a candidate.
5. Browser test uses Curator mode to reject a draft candidate.
6. Browser test uses Curator mode to read curation detail and confines answer-key display to the Curator screen.
7. Browser test uses Student mode to list accepted Quick Check deliveries for an effective Student.
8. Browser test uses Student mode to open a delivery, select an option, submit an attempt, and see a matched-or-not-matched result.
9. Browser test retries the same pending Student submission without creating duplicate UI rows or exposing the idempotency key.
10. Browser test lists and opens only the signed-in Student's attempts.
11. Browser test verifies non-owner attempt detail renders as unavailable without ownership disclosure.
12. Browser test verifies Student screens never render answer-key option ids, candidate ids, rationale, curator attribution, acceptance time, per-option correctness metadata, CSRF tokens, session ids, cookies, or idempotency keys.
13. Browser screenshot checks verify the Quick Check UI has no overlapping controls or clipped text at desktop and mobile viewport widths.
14. Browser accessibility checks verify every form control has an accessible name and every status update is discoverable by assistive technology.
15. HTTP shell tests verify `/learn` does not introduce out-of-scope routes for topic checks, period checks, progress, weak areas, grading, providers, workers, queues, or human review.

## Done criteria

- `GET /learn` serves a product shell for Quick Check workflows without embedding runtime secrets.
- Curator UI can create, list, accept, reject, and inspect Quick Check curation data through the implemented HTTP API.
- Student UI can list deliveries, submit attempts with idempotent retry behavior, list attempts, and inspect owned attempt detail through the implemented HTTP API.
- Student UI surfaces never render protected answer keys or curator-only metadata.
- Browser tests cover Curator and Student workflows, redaction, desktop/mobile layout, and accessibility expectations.
- Agonara tests, root build, browser tests, and `git diff --check` pass.

## Implementation status

Implemented by [Quick Check Product UI Implementation Plan](../plans/implemented/quick-check-product-ui.md), with the `/learn` shell in `agonara/src/learn-ui.js`, route wiring in `agonara/src/server.js`, HTTP shell coverage in `agonara/tests/http-api-quick-check-ui.test.js`, and browser workflow coverage in `agonara/tests/quick-check-product-ui.playwright.js`.
