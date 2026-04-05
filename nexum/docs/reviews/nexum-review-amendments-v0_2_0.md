---
title: "ADR: Nexum Architecture Review Amendments v0.2.0"
date: 2026-04-05
model: claude-sonnet-4-6
version: 0.2.0
status: applied
type: adr
amends:
  - nexum-backend-adr-v0_3_0.md        # inline: inbound list, auth collaborators, Login use case, routing auth-bypass, composition root, deployment section
  - nexum-frontend-adr-v0_2_0.md       # amendment-doc only: rendering layer (1.1)
  - nexum-frontend-auth-adr-v0_1_0.md  # inline: remove TokenRefresher, simplify HTTP chain and composition root
  - nexum-backend-auth-adr-v0_1_0.md   # inline: remove stale Supabase reference, add concrete AuthVerifier note
  - nexum-openapi-v1.yml               # inline: add POST /auth/login and AuthResponse schema; version → 1.6.0
  - nexum-stack-adr-v0_1_0.md          # inline: clarify "Combine (current RxViewModel)" wording
references:
  - implementation-readiness-review-v0_2_0.md
  - nexum-review-amendments-v0_1_0.md
closes-review-findings:
  - "1.1: web UI rendering layer"
  - "1.3: database engine"
  - "2.1: auth provider and method"
  - "2.2: JWT verification specifics"
  - "2.3: Rejection shape"
  - "2.4: SessionResolver validation depth"
  - "2.5: token persistent storage"
  - "3.1: database schema"
  - "3.2: snapshot schemaVersion"
  - "3.3: addedAt ownership"
  - "4.1: URL validation rule"
  - "7.1: CORS"
  - "7.2: environment configuration"
  - "7.3: GitHub API auth for MetadataSource"
  - "9.3: backend ADR deployment section contradicted"
  - "9.4: Combine (current RxViewModel) reference"
---

# ADR: Nexum Architecture Review Amendments v0.2.0

## Context

Closes all 16 open findings from `implementation-readiness-review-v0_2_0.md`. Decisions are applied inline to source documents where noted; this file records what was decided and where to find it.

## Decisions

| Finding | Decision | Applied in |
|---|---|---|
| 1.1 Web UI rendering layer | JavaScriptKit + thin JS shim | amendment-doc only |
| 1.3 Database engine | SQLite via `SQLite.swift` | `nexum-backend-adr-v0_3_0.md` |
| 2.1 Auth provider + method | Self-hosted; single configured account via `AUTH_USERNAME` / `AUTH_PASSWORD_HASH` (bcrypt); backend issues HS256 JWT on `POST /auth/login` | `nexum-backend-adr-v0_3_0.md`, `nexum-openapi-v1.yml` |
| 2.2 JWT verification | HS256, `JWT_SECRET` env var (min 32 bytes), 24 h lifetime, `sub` / `iat` / `exp` claims | `nexum-backend-adr-v0_3_0.md`, `nexum-backend-auth-adr-v0_1_0.md` |
| 2.3 Rejection shape | Unit type — no payload; router produces the 401 envelope | `nexum-backend-auth-adr-v0_1_0.md` |
| 2.4 SessionResolver validation depth | Token existence in persistent storage **and** local `exp` check | `nexum-frontend-auth-adr-v0_1_0.md` |
| 2.5 Token persistent storage | Web: `localStorage` (JavaScriptKit interop), key `nexum_auth_token`; CLI: OS keychain / permissions-restricted dotfile fallback | amendment-doc only |
| 3.1 Database schema | `repos` table: `id` (UUID PK), `repo_url` (TEXT UNIQUE NOT NULL), `note` (TEXT NOT NULL DEFAULT ''), `added_at` (TEXT NOT NULL). `snapshot` table: singleton row (`id = 1`), `data` (TEXT JSON), `schema_version` (INTEGER), `updated_at` (TEXT). | amendment-doc only |
| 3.2 Snapshot `schemaVersion` | Internal to `SQLiteSnapshotStore`; not in API response | amendment-doc only |
| 3.3 `addedAt` ownership | Set by server at write time; not supplied by client | `nexum-backend-adr-v0_3_0.md` (AddRepo step 2) |
| 4.1 URL validation | Must match `https://github.com/{owner}/{repo}` after normalisation (lowercase scheme+host, strip trailing slash, strip `.git`); exactly two non-empty path segments; no query or fragment; 400 on failure | amendment-doc only |
| 7.1 CORS | Same-origin deployment via reverse proxy; no CORS headers in the application | `nexum-backend-adr-v0_3_0.md` |
| 7.2 Environment config | `DATABASE_PATH`, `JWT_SECRET`, `AUTH_USERNAME`, `AUTH_PASSWORD_HASH` required; `PORT` (default 8080) and `GITHUB_TOKEN` optional; process refuses to start on missing required vars | `nexum-backend-adr-v0_3_0.md` |
| 7.3 GitHub API auth | Optional `GITHUB_TOKEN`; unauthenticated fallback (60 req/h); read at construction by concrete `GitHubMetadataSource`; protocol has no knowledge of it | `nexum-backend-adr-v0_3_0.md` |
| 9.3 Backend ADR deployment section | Supabase Edge Function text replaced with self-hosted Swift process | `nexum-backend-adr-v0_3_0.md` |
| 9.4 Stack ADR "Combine (current RxViewModel)" | Clarified as design pattern considered, not existing production code | `nexum-stack-adr-v0_1_0.md` |
