---
date: 2026-06-06
model: gpt-5
description: "Agonara API contract map for route families, ownership, auth, and response rules"
---

# Agonara API Contract Map

## Sources Of Truth

- Product snapshot: `agonara/README.md`
- Responsibility boundaries: `agonara/docs/module_responsibility_map.md`
- Route contracts: `agonara/docs/specs/*.md`
- HTTP adapter: `agonara/src/server.js`
- Domain owners: `agonara/src/identity.js`, `program.js`, `corpus.js`,
  `curator-workspace.js`, `student-workspace.js`,
  `open-answer-evaluator-runtime.js`
- HTTP coverage: `agonara/tests/http-api.test.js`,
  `agonara/tests/executable-acceptance.test.js`
- Browser/product API usage: `agonara/src/admin-ui.js`,
  `agonara/src/learn-ui.js`, `agonara/tests/*.playwright.js`

Use this command to find every documented HTTP contract table:

```bash
rg -n '^\\| `(GET|POST|DELETE|PUT|PATCH)`' agonara/docs/specs/*.md
```

## Transport Invariants

- `GET /admin` and `GET /learn` serve HTML shells. API calls behind those
  shells still use the backend contracts.
- Session-authenticated browser clients use the `agonara_session` cookie.
- State-changing session routes require `X-Agonara-CSRF: <csrfToken>` before
  body parsing or mutation. `POST /identity/bootstrap/admin` and
  `POST /identity/sessions` create sessions and are exempt.
- Student attempt routes also require idempotency keys where the spec says so.
- `POST /operations/open-answer-evaluator/tick` is an operations route. It can
  use an Admin session or a configured bearer trigger token.
- Fault responses, logs, diagnostics, UI shells, and backups must not expose
  secrets, session ids, CSRF tokens, authorization headers, cookie headers, SQL
  text, stack traces, filesystem paths, database URLs, provider credentials, raw
  prompts, or raw model responses.

## Response Shape

Most domain-backed routes return the shared result envelope:

```json
{ "status": "accepted", "value": {} }
{ "status": "rejected", "reason": "session_not_found" }
{ "status": "fault", "reason": "internal_error" }
```

`/operations/health` returns an operational health object directly. HTML shell
routes return HTML. Keep those exceptions explicit and do not generalize them
to product-domain routes.

## Ownership Boundaries

| Area | Owner | API implication |
|---|---|---|
| Identity, sessions, credentials, Admin authority, audit | Identity & Role Management | Admin routes can inspect/mutate identity state, but must not own program participation or learning state. |
| Program shell, invitations, participation lifecycle | Program Membership | Other modules ask for effective participation rather than reading policy internals. |
| Accepted program corpus, accepted checks, accepted criteria | Corpus Storage | Student and curator reads use accepted revisions; drafts enter only through curator acceptance. |
| Candidate content, coverage gaps, LLM curation suggestions | Curator Workspace | Curator routes can prepare and review drafts, but cannot auto-promote accepted corpus outside explicit acceptance routes. |
| Answers, attempts, evaluation evidence, learner state, readiness attempts | Student Workspace | Student routes own personal learning state and must not mutate accepted corpus or membership policy. |
| Open-answer provider adapter and worker tick | Student Workspace runtime boundary | Provider adapters are side-effect limited and must not own product state. |

## Route Families

| Family | Spec | Main route prefixes | Auth shape |
|---|---|---|---|
| Operations | `operations-health-version.md`, `operational-cross-cutting-first-slice.md` | `/operations/health`, `/operations/diagnostics`, `/operations/open-answer-evaluator/tick` | health is public; diagnostics requires Admin; tick requires Admin or trigger token |
| Identity and Admin | `identity-role-management-api-cli.md` | `/identity/*` | bootstrap/login create sessions; Admin routes require Admin session; mutations require CSRF |
| Program shell and membership | `program-shell-and-membership-api.md`, `program-membership-invitations-and-recovery.md` | `/programs`, `/program-memberships`, `/program-invitations`, `/admin/program-memberships` | session required; curator/Admin/student role varies by route; mutations require CSRF |
| Corpus curation and accepted corpus | `corpus-storage-and-curator-acceptance-api.md` | `/programs/{programId}/sources`, `/corpus-candidates`, `/accepted-corpus-revisions` | curator mutations require CSRF; accepted reads require participation |
| Accepted checks and criteria | `accepted-checks-and-assessment-criteria-api.md` | `/assessment-criteria`, `/open-answer-checks` | curator candidate routes; student/curator/Admin accepted reads |
| Navigation | `topic-concept-material-navigation.md` | `/navigation-candidates`, `/programs/{programId}/navigation`, `/navigation/entities`, `/navigation/revisions` | curator candidate mutations; accepted navigation reads for participants |
| Quick Check | `quick-check-assessment-api.md`, `quick-check-product-ui.md` | `/quick-checks`, `/quick-check-attempts`, `/learn` | curator candidate routes; student deliveries/attempts; attempts require CSRF and idempotency |
| Open-answer attempts and evaluation | `student-workspace-open-answer-attempt-api.md`, `student-workspace-open-answer-evaluation-status-and-evidence.md`, `student-workspace-open-answer-evaluator-orchestration.md`, `student-workspace-open-answer-evaluator-worker.md` | `/open-answer-attempts`, evaluator worker domain APIs | owner-only student reads; public evaluator mutation routes remain out of scope |
| Learner state | `learner-state-interpretation.md` | `/learner-state-target-links`, `/programs/{programId}/learner-state`, `/learner-state/targets` | curator target-link curation; owner-only student state/detail reads |
| Readiness checks | `topic-period-readiness-checks.md` | `/readiness-checks`, `/readiness-check-attempts` | curator candidate routes; student deliveries/attempts; attempts require CSRF and idempotency |
| Coverage gaps | `curator-coverage-gaps.md` | `/programs/{programId}/coverage-gaps` | Program Curator session |
| LLM curation suggestions | `llm-assisted-curation-suggestions.md` | `/llm-curation-suggestions` | Program Curator session; mutations require CSRF; outputs remain draft suggestions |

## Contract Review Checklist

- Does the route belong to the module named by the spec?
- Does the route require the documented session role and CSRF/idempotency gates?
- Does `server.js` parse the body only after required CSRF checks for mutations?
- Does the response envelope and HTTP status mapping match existing tests?
- Does the projection hide non-owner state, answer keys, provider internals, and
  infrastructure details?
- Does the change avoid adding explicitly out-of-scope routes named in the spec?
