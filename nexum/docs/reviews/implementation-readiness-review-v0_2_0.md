---
date: 2026-04-06
model: opus-4.6
description: "Implementation readiness review of the nexum architecture doc set (revised after stack ADR)"
version: 0.2.0
status: open
type: review
supersedes:
  - implementation-readiness-review-v0_1_0.md
---

# Nexum — Implementation Readiness Review v0.2.0

Revised after `nexum-stack-adr-v0_1_0.md` was added. That ADR decides the entire stack is Swift: server-side Swift + Hummingbird 2 for backend, Swift package for frontend core, Swift CLI, and Swift-to-Wasm for web UI. This resolves some v0.1.0 findings and introduces new ones.

Findings are categorized as:

- **Blocker** — cannot begin or complete a component without resolution
- **Gap** — implementer will hit a decision point that should have been pre-decided
- **Ambiguity** — wording supports multiple interpretations; pick one and state it
- **New** — introduced by the stack ADR, not present in v0.1.0

---

## 1. Technology Stack Decisions

### 1.1 Web UI rendering layer — Gap (was: Blocker)

v0.1.0 flagged "frontend framework" as a blocker. The stack ADR narrows the decision: Swift compiled to Wasm, frontend core is a Swift package. But the web rendering layer is explicitly "TBD (ElementaryUI, JavaScriptKit + thin JS, or similar)."

The frontend core (state machines, reducers, services) can be built and tested without this decision. But the web UI cannot. Downgraded from blocker to gap because the core implementation can proceed.

**Fix:** Decide the web rendering approach before starting UI work.

### 1.2 Backend runtime — Resolved

v0.1.0 flagged backend runtime as a gap. The stack ADR decides: server-side Swift with Hummingbird 2. Self-hosted, not Supabase Edge Function.

**Remaining doc debt:** `nexum-backend-adr-v0_3_0.md:123-127` still says "single Supabase Edge Function" and describes Supabase-specific deployment. This section is now contradicted by the stack ADR and needs updating.

### 1.3 Database engine — Gap

The database was never decided in any normative doc. The backend ADR names "Database" as an outbound dependency without specifying the engine. The Supabase deployment assumption gave an illusion of PostgreSQL being decided, but it wasn't — and the auth ADRs were already explicitly provider-agnostic.

For server-side Swift, the choice matters: PostgreSQL (via PostgresNIO), SQLite (via swift-sqlite, local-first), Supabase as remote PostgreSQL. Each has different testing, deployment, and migration stories.

**Fix:** Decide and document the database.

### 1.4 CLI component — Resolved

The CLI mirrors the web UI's full command set (add, list, edit note, search). It depends on the frontend core package. See 5.8.

### ~~1.5 Backend deployment model~~ — Retracted

v0.1.0 incorrectly flagged this as a gap. "Hosting is self-managed" was always a sufficient architecture-level decision. Specific hosting target and CI/CD are implementation concerns.

The backend ADR deployment section (`nexum-backend-adr-v0_3_0.md:123-127`) still describes Supabase Edge Function deployment — this is doc debt covered by 9.3.

---

## 2. Auth Decisions

### 2.1 Auth provider and method — Blocker

The auth provider was already undecided — both auth ADRs are explicitly provider-agnostic, and the supersession note removed Supabase Auth as normative. The stack ADR just makes this more visible by removing the Supabase deployment assumption.

The auth method (email/password, magic link, OAuth) is also undecided, as flagged in v0.1.0.

For server-side Swift, the provider options include: Supabase Auth (remote, via REST), self-hosted (JWT signing/verification with a Swift library), or a third-party provider.

**Fix:** Decide auth provider and method. Record as a product + stack decision.

### 2.2 JWT verification specifics — Gap

The concrete verification approach (algorithm, secret source, claims) is undecided. This was already the case — the backend auth ADR is provider-agnostic by design. v0.1.0 incorrectly assumed Supabase JWT narrowed this.

**Fix:** Blocked on 2.1. Once the auth provider is chosen, specify the verification mechanism.

### 2.3 Rejection shape — Ambiguity

Unchanged from v0.1.0. `Identity | Rejection` — Rejection payload undefined.

**Fix:** "Rejection is a discriminated result with no payload. The router produces the 401 error envelope."

### 2.4 SessionResolver validation depth — Gap

Unchanged from v0.1.0.

### 2.5 Token persistent storage mechanism — Gap (changed)

v0.1.0 discussed localStorage vs cookie for web. With Swift Wasm, the options change: JavaScript interop to localStorage, or a Wasm-compatible storage mechanism. For the CLI, it's file-based (keychain or dotfile). Two clients, two storage strategies.

**Fix:** Decide per client surface (web + CLI).

---

## 3. Data Model Gaps

### 3.1 Database schema — Gap

Unchanged from v0.1.0. The database engine is undecided (1.3), so engine-specific DDL can't be finalized. However, the logical schema (tables, columns, constraints) can still be documented independent of engine.

**Fix:** Add logical schema to backend ADR. Engine-specific DDL can follow once 1.3 is decided.

### 3.2 Snapshot `schemaVersion` — Ambiguity

Unchanged from v0.1.0.

### 3.3 Entry `addedAt` — who sets it? — Ambiguity

Unchanged from v0.1.0.

---

## 4. URL Validation

### 4.1 What constitutes a valid repo URL? — Gap

Unchanged from v0.1.0.

---

## 5. UX Decisions in Limbo

### 5.1 Duplicate handling UX — Resolved

Covered in `nexum-ux-spec-v1.md`: UI highlights the existing entry using `existingId`.

### 5.2–5.6 Table columns, search, sort, inline editing, empty note — Resolved

All captured in `nexum-ux-spec-v1.md`.

### 5.7 Recommended fix — Resolved

Created `nexum-ux-spec-v1.md` capturing surviving product decisions. Referenced from the frontend ADR.

### 5.8 CLI UX — Resolved

The CLI mirrors the web UI's full command set: add, list, edit note, and search. Specific CLI ergonomics (output format, flags) are implementation details, not architecture decisions.

This also resolves 1.4 (CLI scope): the CLI depends on the frontend core package and exposes the same operations as the web UI.

---

## 6. Error Contract

### 6.1 Error codes not enumerated — Gap

Unchanged from v0.1.0.

---

## 7. Operational Gaps

### 7.1 CORS — Gap (changed)

With self-hosted backend, CORS depends on the deployment topology. If backend and web UI are served from the same origin (reverse proxy), CORS may not be needed. If separate origins, it is.

**Fix:** Depends on deployment model (1.5). Note the dependency.

### 7.2 Environment configuration — Gap (changed)

The Supabase-specific env vars from v0.1.0 no longer apply if the stack is fully self-hosted. The required config depends on decisions in 1.3 (database) and 2.1 (auth provider).

**Fix:** Blocked on 1.3 and 2.1. Once decided, enumerate env vars.

### 7.3 GitHub API auth for MetadataSource — Gap

Unchanged from v0.1.0.

---

## 8. Minor Ambiguities

### 8.1 `findByUrl` vs `add` for duplicate detection — Resolved

Removed the separate duplicate-check step from AddRepo. Step 2 is now "Add entry via RepoStore — rejects duplicate with existingId = 409." `findByUrl` remains on the RepoStore protocol for other potential use but is not called in AddRepo.

### 8.2 EditNote needs entry URL for metadata fetch — Resolved

RepoStore protocol description now states: "An entry contains at minimum: `id`, `repoUrl`, `note`, `addedAt`."

---

## 9. Doc-Quality Issues in Stack ADR

### 9.1 Stale `amends` references — Resolved

References updated to `nexum-backend-adr-v0_3_0.md` and `nexum-frontend-adr-v0_2_0.md`.

### 9.2 Inconsistent filename convention — Resolved

Renamed to `nexum-stack-adr-v0_1_0.md`.

### 9.3 Backend ADR deployment section contradicted — fail

`nexum-backend-adr-v0_3_0.md:123-127` describes Supabase Edge Function deployment, CI/CD to Supabase, and Supabase base URL. All superseded by the stack ADR but not updated.

**Fix:** Revise the backend ADR deployment section to be stack-agnostic or reference the stack ADR for deployment specifics.

### 9.4 "Combine (current RxViewModel)" reference — Ambiguity

`nexum-stack-adr-v0-1-0.md:42` says "Combine (current RxViewModel) -> Observation." This implies existing code using Combine/RxViewModel. If no code exists yet, this is misleading. If it refers to a pattern choice, it should say so.

**Fix:** Clarify whether this references existing code or a design pattern that was considered.

---

## Summary: Implementation Readiness Scorecard (Revised)

| Area | v0.1.0 Status | v0.2.0 Status | Blocking items |
|---|---|---|---|
| Backend architecture | Ready | Ready | — |
| Frontend architecture | Ready | Ready | — |
| API contract (OpenAPI) | Ready | Ready | — |
| Auth architecture | Ready | Ready | — |
| Language / stack | **Blocked** | **Decided** (Swift) | — |
| Web UI rendering layer | **Blocked** | Gap | 1.1 |
| Backend runtime | Gap | **Resolved** | — |
| Auth provider + method | **Blocked** | **Blocked** | 2.1 |
| Database engine | Gap | Gap | 1.3 |
| DB schema | Gap | Gap | 3.1 |
| CLI scope | — | **Resolved** | — |
| UX specification | Gap | **Resolved** | — |
| Error codes | Gap | Gap | 6.1 |
| URL validation | Gap | Gap | 4.1 |
| Ops / config | Gap | Gap (changed) | 7.1–7.3 |
| Doc consistency | — | **fail** (1 item) | 9.3 |

### To reach implementation-ready

**Must resolve (1 blocker):**
1. Choose auth provider and method (2.1)

**Should resolve before implementation begins:**
2. Decide database engine (1.3)
3. ~~Define CLI scope or defer it (1.4)~~ — Resolved
4. Fix contradicted backend ADR deployment section (9.3)

**Should resolve before UI work begins:**
6. Decide web rendering layer (1.1)
7. ~~Create `nexum-ux-spec-v1.md` (5.7)~~ — Resolved

**Should resolve (high-value, prevents implementer guessing):**
8. Add logical DB schema to backend ADR (3.1)
9. Add error code table (6.1)
10. Decide URL validation rule (4.1)
11. Decide GitHub API auth for MetadataSource (7.3)

**Nice to have (minor polish):**
12. Clarify `addedAt` ownership (3.3)
13. Clarify `schemaVersion` status (3.2)
14. ~~Clarify RepoStore entry shape (8.2)~~ — Resolved
15. ~~Clarify duplicate detection mechanism (8.1)~~ — Resolved
16. Clarify Rejection shape (2.3)
17. Clarify "current RxViewModel" reference (9.4)
