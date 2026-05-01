---
title: "ADR: iPhone Copy Library for Private Prompts and Skills"
date: 2026-05-01
status: accepted
artifact_type: adr
---

# ADR: iPhone Copy Library for Private Prompts and Skills

## Executive Summary

Two-tier architecture for an iPhone-friendly private webpage that copies reusable prompts and skills with one tap: a backend that is the sole GitHub principal and strips YAML front matter, and a passive frontend that renders only normalized, sanitized items received from the backend. Scope is v1: private, read-only, no persistence, no search, no per-user auth, single shared access secret.

## Context

The user maintains a private GitHub repository ("ai-labs") containing reusable prompts under `prompts/` and skills under `dev-skills/public/`. The user wants to copy individual items from an iPhone with one tap, without exposing repo credentials, raw GitHub API responses, or YAML front matter to the client. Lists are short enough that caching, pagination, indexing, and search are unnecessary in v1.

Rejected alternatives:

- direct browser-to-GitHub access — would leak the GitHub token to the client or require per-user GitHub auth
- static prebuilt JSON dump checked into a deploy artifact — couples publish cadence to GitHub commits and adds a build step
- persistent backend with database/cache — operational burden out of proportion to the problem size

## Decision

The system is split into two tiers:

- a backend that owns GitHub access (deployed as a serverless function or any equivalent server-side process). It reads only allowlisted source paths, parses and strips YAML front matter, and returns normalized items.
- a passive frontend gated by a shared access secret. It renders sections, shows item title and subtitle, and copies sanitized item bodies to the clipboard on tap.

The frontend MUST NOT speak to GitHub directly and MUST NOT receive the GitHub token, raw GitHub API responses, or YAML front matter under any condition.

## Rules / Invariants

### Repository access

- The backend MUST be the only component holding GitHub credentials.
- The backend MUST restrict reads to configured allowlisted source paths only:
  - `prompts/`
  - `dev-skills/public/`
- The allowlist MUST be defined in source-controlled configuration. Adding or removing an allowlisted path is an architectural change and MUST be made by amending this ADR or by a new ADR that supersedes the relevant rule here.

### Sanitization

- The backend MUST strip YAML front matter from copyable bodies before returning them.
- The backend MUST preserve all body content after the front matter byte-for-byte (Markdown syntax, indentation, blank lines, code fences, trailing newline).
- If a file's front matter is malformed, the backend MUST treat the file as having no front matter and return the entire file body as the copyable body. The response MUST NOT fail because of a single malformed item.
- The backend MUST NOT expose to the client: the GitHub token, raw GitHub API responses, YAML front matter, or any path/file outside the allowlist.

### Item model

- Each returned item MUST include: a stable id, a section identifier (`prompts` or `skills`), title, subtitle, copyable body, and a kind/status field for rendering.
- Item id MUST be the item's relative path inside the source repo, for example `prompts/example.md` or `dev-skills/public/example-skill/SKILL.md`. Renaming a file changes its id.
- Title MUST be drawn from front matter `title` if present; otherwise from the filename or the skill folder name.
- Subtitle MUST be drawn from front matter `description` or `summary` if present; otherwise it MAY be empty.

### Skill shape

- A skill folder containing only `SKILL.md` MUST be classified `standalone`.
- A skill folder containing `SKILL.md` plus any additional sibling files or folders MUST be classified `resource-backed`.
- The frontend MUST visually distinguish `resource-backed` skills so the user is not misled into treating the copied `SKILL.md` as self-contained.

### Access

- The webpage and its API MUST be gated by a single shared secret.
- The shared secret MUST be validated server-side on every API request and MUST be transported over HTTPS. Whether the secret travels in a header, cookie, or request body is an implementation choice and is not constrained by this ADR.
- The frontend MUST NOT receive the GitHub token under any condition.
- v1 does not model multiple users or roles.

### Storage and refresh

- v1 MUST NOT introduce a database, search index, persistent cache, or background sync.
- The backend MAY perform per-request, in-process work (parsing, grouping, normalization) and MAY use the deployment platform's request-scope memory, but MUST NOT retain item state across requests. Per-request, in-process memoization is not a "cache layer" for the purposes of this ADR.
- Refresh MUST be explicit: a Reload button and platform pull-to-refresh where available. No automatic refresh.

## Consequences

Benefits:

- the GitHub token never reaches the client
- minimal operational surface (no DB, no cache, no background jobs)
- deterministic behavior on reload
- resource-backed skills are not misrepresented as plain copy-only snippets

Tradeoffs accepted:

- every load/reload hits GitHub or serverless runtime logic; sustained reload bursts can hit GitHub API rate limits and the response will surface an error rather than degrade to a stale cached view
- no offline access
- no search or filtering
- no version history in the UI
- shared password is simpler than per-user auth and weaker; mitigated by the v1 single-user assumption

Future extension points:

- adding additional source paths requires amending the allowlist invariant in this ADR
- introducing caching, search, or per-user auth is explicitly future work and would require a new ADR

## Non-Goals

- no caching layer
- no pagination
- no database
- no search
- no editing
- no GitHub write access
- no multiple users or roles
- no per-user authentication
- no configurable extraction rules per folder/type
- no automatic refresh
- no client exposure of GitHub token, raw GitHub API responses, or front matter
