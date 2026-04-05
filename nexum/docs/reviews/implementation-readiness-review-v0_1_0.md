---
date: 2026-04-06
model: opus-4.6
description: "Implementation readiness review of the nexum architecture doc set"
version: 0.1.0
status: open
type: review
---

# Nexum — Implementation Readiness Review

Review of the full nexum doc set to assess whether an implementer can build both components (frontend + backend) without ambiguity or unstated decisions.

Findings are categorized as:

- **Blocker** — cannot begin or complete a component without resolution
- **Gap** — implementer will hit a decision point that should have been pre-decided
- **Ambiguity** — wording supports multiple interpretations; pick one and state it
- **Observation** — not wrong, but worth noting for planning

---

## 1. Technology Stack Decisions

### 1.1 Frontend framework — Blocker

No normative doc names the frontend framework. React? Vue? Svelte? Vanilla? The frontend ADR describes a state machine, reducer, effect handler, services, and composition root — all framework-agnostic. This is a strength architecturally but a blocker for implementation planning. The implementer cannot scaffold the project, choose a build tool, or estimate effort.

**Location:** absent from all docs.
**Fix:** Add a one-line decision: "Frontend is built with [framework]. Chosen for [reason]." Can be a frontmatter field or a one-sentence section in the frontend ADR.

### 1.2 Backend runtime — Gap

`nexum-backend-adr-v0_3_0.md:123` says "single Supabase Edge Function." Supabase Edge Functions run on Deno. This is never stated. The implementer needs to know the runtime to choose language, dependencies, and testing tools.

**Fix:** Add: "Supabase Edge Functions run on Deno (TypeScript). Tests run via [Deno test / vitest / etc.]."

### 1.3 Database engine — Gap

The backend ADR names "Database" as an outbound dependency. Supabase implies PostgreSQL, but this is never stated, and no schema is in any normative doc.

**Fix:** State "PostgreSQL via Supabase" explicitly. See also finding 3.1 (DB schema).

---

## 2. Auth Decisions

### 2.1 Auth method — Blocker

`nexum-review-amendments-v0_1_0.md:202` explicitly flags this: "The concrete auth method (email/password, magic link, OAuth) is a product decision that blocks login UI implementation. Must be decided before frontend implementation begins."

This is still open. The frontend auth ADR defines the state machine but the login UI cannot be built without knowing the auth method.

**Fix:** Make the product decision and record it. One sentence: "v1 uses email/password via Supabase Auth" (or magic link, or GitHub OAuth).

### 2.2 JWT verification specifics — Gap

`nexum-backend-auth-adr-v0_1_0.md:26-34` — The AuthVerifier is provider-agnostic by design, but the implementer needs to know: which algorithm (RS256 from Supabase's JWT secret?), where the secret comes from (env var? Supabase SDK?), and what claims to check beyond `exp` and `sub`.

**Fix:** Add a composition-root-level note: "Concrete verifier uses Supabase JWT secret (`SUPABASE_JWT_SECRET` env var), verifies RS256 signature and `exp` claim."

### 2.3 Rejection shape — Ambiguity

`nexum-backend-auth-adr-v0_1_0.md:29` — `Identity | Rejection`. Identity now carries `sub`. What does Rejection carry? The router returns `{ error: true, code, message }` on 401 — does Rejection contain the message, or does the router generate it?

**Fix:** Define: "Rejection is a discriminated result with no payload. The router produces the 401 error envelope."

### 2.4 SessionResolver validation depth — Gap

`nexum-review-amendments-v0_1_0.md:203` flags this as needing a deliberate choice. Check token existence only, or also inspect `exp` locally? Not blocking but the implementer will need to decide.

**Fix:** Record the decision. Suggestion: "SessionResolver checks token existence and local `exp`. If expired, resolves to unauthenticated without hitting the backend."

### 2.5 Token persistent storage mechanism — Gap

Frontend auth ADR says persistence is a decorator on collaborators but doesn't name the storage. localStorage? httpOnly cookie? sessionStorage? Affects security posture and XSS risk surface.

**Fix:** One-line decision: "Token persisted in localStorage" (or cookie, etc.).

---

## 3. Data Model Gaps

### 3.1 Database schema — Gap

The superseded pre-ADR (`nexum-pre-adr-spec-v0.0.1.md:222-224`) contains:
- `repos` table: UUID PK, normalized `repoUrl` (unique), `note`, `addedAt`
- `snapshot` table: single-row JSON blob with `schemaVersion`

This is not restated in any normative doc. The backend ADR defines protocols (RepoStore, SnapshotStore) but not the backing schema. The supersession note does not list the DB schema as "still valid."

The implementer needs the table definitions. The protocol signatures imply the schema, but there are open questions:
- Does `repos` have an auto-generated `created_at` or only the app-level `addedAt`?
- Does `snapshot` need a `schemaVersion` field? (Not in the OpenAPI response shape — is it internal-only?)
- Are there indexes beyond the `repoUrl` unique constraint?

**Fix:** Either (a) add a "Database Schema" section to the backend ADR, or (b) create a migration spec. Minimum: table DDL for `repos` and `snapshot`.

### 3.2 Snapshot `schemaVersion` — Ambiguity

Pre-ADR mentions `schemaVersion` in the snapshot blob. `SnapshotResponse` in the OpenAPI has only `{ repos: [] }`. Is `schemaVersion` internal-only (stored in DB, stripped before response)? Or was it dropped entirely?

**Fix:** State explicitly whether the snapshot blob in the DB carries a schema version field that is not exposed via the API, or whether it was dropped.

### 3.3 Entry `addedAt` — who sets it? — Ambiguity

`addedAt` is in the OpenAPI response and the DB schema, but no doc says who sets it. Is it `now()` at insert time in the DB? Set by the use case? Set by the client (not in the request body, so no)?

**Fix:** Add to backend ADR use case: "addedAt is set server-side at insert time."

---

## 4. URL Validation

### 4.1 What constitutes a valid repo URL? — Gap

`nexum-backend-adr-v0_3_0.md:65` defines `normalizeUrl` (lowercase, strip trailing slash, strip `.git`). But normalization is not validation. If someone POSTs `https://example.com/not-a-github-repo`:

- normalizeUrl succeeds (it's just string manipulation)
- RepoStore.add succeeds (it's just persistence)
- MetadataSource.fetch fails (not a GitHub repo)
- Under the amended best-effort model, the entry is persisted with null metadata

Is this intended? A repo entry that will never have valid metadata because the URL is not a GitHub repo? The pre-ADR says "GitHub repository URL" but no validation rule enforces this.

**Fix:** Decide and document: either (a) normalizeUrl also validates GitHub URL format and rejects non-GitHub URLs with 400, or (b) any URL is accepted and metadata is best-effort (meaning non-GitHub URLs are technically allowed but useless).

---

## 5. UX Decisions in Limbo

The supersession note (`nexum-pre-adr-superseded-note-v0.1.0.md`) lists product-intent points that "remain valid" but the detailed UX behaviors from the pre-ADR are neither restated in normative docs nor explicitly carried forward. An implementer reading only the normative docs (frontend ADR + auth ADR + OpenAPI) will not find these:

### 5.1 Duplicate handling UX — Gap

POST returns 409 with `{ existingId }`. What does the UI do? The pre-ADR says "the existing entry is opened." The frontend ADR does not specify. The reducer has a path for errors but not specifically for duplicates.

**Fix:** Add to frontend ADR: "On duplicate (409), the UI highlights the existing entry using `existingId`" (or whatever the intended behavior is).

### 5.2 Table columns — Gap

Pre-ADR: "Name, Stars, Description, Note, Added date." Not in any normative doc. An implementer needs to know what to render.

### 5.3 Search behavior — Gap

Pre-ADR: "case-insensitive substring over name, description, note; client-side filter; current sort preserved." Frontend ADR mentions `query` state but doesn't define the filtering algorithm.

### 5.4 Sort behavior — Gap

Pre-ADR: "single-column sorting, active column toggles ascending/descending on repeat tap." Not restated.

### 5.5 Inline editing — Gap

Pre-ADR: "note is the only inline-editable field; click/tap to edit; explicit save/cancel." Not restated.

### 5.6 Empty note confirmation — Gap

Pre-ADR: "Empty note is allowed only with explicit confirmation." OpenAPI allows any string for note. No frontend doc specifies this validation.

### 5.7 Recommended fix for 5.2–5.6

These are all product-level UX decisions, not architecture. They should not bloat the ADRs. Create a concise `nexum-ux-spec-v1.md` that captures the surviving product decisions from the pre-ADR:
- Table columns and their data sources
- Sort behavior (single-column, toggle direction)
- Search behavior (client-side, case-insensitive substring, fields searched)
- Inline editing rules (which fields, save/cancel flow)
- Empty note confirmation
- Duplicate UX (highlight existing entry)

Reference it from the frontend ADR.

---

## 6. Error Contract

### 6.1 Error codes not enumerated — Gap

`nexum-openapi-v1.yml` defines the error envelope `{ error: true, code, message }` but only specifies `code: "duplicate"` for 409. The implementer needs error codes for:
- 400 on POST (invalid input) — what codes? `missing_field`? `invalid_url`?
- 404 on PATCH — `not_found`?
- 401 — `unauthorized`?
- 500 — `internal_error`?

**Fix:** Add an error code table to the OpenAPI schema or backend ADR. Minimum: one code per HTTP status used.

---

## 7. Operational Gaps

### 7.1 CORS — Gap

Frontend (Vercel) and backend (Supabase Edge Function) are on different origins. CORS headers are not mentioned anywhere. Supabase Edge Functions don't auto-add CORS for custom functions.

**Fix:** Note in backend ADR deployment section: "The edge function must return appropriate CORS headers for the frontend origin."

### 7.2 Environment configuration — Gap

No doc lists the required env vars / secrets. The implementer will need at minimum:
- Backend: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (or equivalent DB credentials), `SUPABASE_JWT_SECRET`, GitHub API token (for MetadataSource)
- Frontend: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (for auth), backend base URL

**Fix:** Add an "Environment" section to the backend ADR (or a separate ops doc) listing required configuration.

### 7.3 GitHub API auth for MetadataSource — Gap

MetadataSource fetches repo metadata from GitHub. Unauthenticated GitHub API has a 60 req/hour limit. For a single-user app with snapshot rebuilds fetching N entries per write, this could be hit quickly.

**Fix:** Decide: does MetadataSource use a GitHub token? If yes, add to env config.

---

## 8. Minor Ambiguities

### 8.1 `findByUrl` vs `add` for duplicate detection

`nexum-backend-adr-v0_3_0.md` — RepoStore has both `findByUrl(url)` and `add(url, note) → entry / duplicate(existingId)`. The `add` operation's return type already handles duplicates. Is `findByUrl` used in AddRepo, or does `add` itself reject? The amendments note says this is an implementation decision, which is fine, but the use case step "Check for duplicate via RepoStore" is ambiguous about which method is called.

**Fix:** Clarify use case step: "Add entry via RepoStore — rejects duplicate with existingId" (remove the separate duplicate-check step if `add` handles it, or make it explicit that `findByUrl` is called first).

### 8.2 EditNote needs entry URL for metadata fetch

`nexum-backend-adr-v0_3_0.md` — EditNote step 1 does `findById(id) → entry`. The snapshot rebuild (step 3) fetches metadata for all entries including this one. The entry returned by `findById` must contain `repoUrl` so MetadataSource can fetch its metadata. This is implied but never stated.

**Fix:** State in the RepoStore protocol description: "An `entry` contains at minimum `id`, `repoUrl`, `note`, `addedAt`."

---

## Summary: Implementation Readiness Scorecard

| Area | Status | Blocking items |
|---|---|---|
| Backend architecture | Ready | — |
| Frontend architecture | Ready | — |
| API contract (OpenAPI) | Ready | — |
| Auth architecture | Ready (both components) | — |
| Auth method (product decision) | **Blocked** | 2.1 |
| Frontend framework | **Blocked** | 1.1 |
| DB schema | Gap | 3.1 |
| UX specification | Gap | 5.1–5.6 |
| Error codes | Gap | 6.1 |
| URL validation | Gap | 4.1 |
| Ops / config | Gap | 7.1–7.3 |
| Backend runtime | Gap | 1.2 |

### To reach implementation-ready

**Must resolve (2 blockers):**
1. Choose frontend framework
2. Choose auth method

**Should resolve (high-value, prevents implementer guessing):**
3. Create `nexum-ux-spec-v1.md` capturing UX decisions from pre-ADR
4. Add DB schema to backend ADR
5. Add error code table
6. Decide URL validation rule
7. Add environment/config section
8. Note CORS requirement
9. Decide GitHub API auth for MetadataSource

**Nice to have (minor polish):**
10. Clarify `addedAt` ownership
11. Clarify `schemaVersion` status
12. Clarify RepoStore entry shape
13. Clarify duplicate detection mechanism in use case steps
