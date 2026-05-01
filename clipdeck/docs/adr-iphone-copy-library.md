---
title: "ADR: iPhone Copy Library for Private Prompts and Skills"
date: 2026-05-01
status: accepted
artifact_type: adr
---

# ADR: iPhone Copy Library for Private Prompts and Skills

## Context

The user has a private GitHub repository containing short lists of reusable prompts and development skills.

Relevant repository paths:

- `prompts/`
- `dev-skills/public/`

The user wants a comfortable iPhone webpage that lists these items and lets each item be copied to the clipboard with one tap. Copied content must exclude YAML front matter while preserving the original Markdown/content body exactly.

The lists are short enough that caching, pagination, indexing, and search are unnecessary for the first version.

## Decision

Build a minimal iPhone-friendly webpage backed by a lightweight serverless/private endpoint.

The endpoint owns all private GitHub access and returns only sanitized, normalized items to the frontend.

The frontend renders two sections:

- `prompts`
- `skills`

Each cell/card behaves as a copy-to-clipboard button and shows:

- title
- subtitle
- visual status/type indicator when relevant

## Repository Access Boundary

The backend/serverless layer is the only component allowed to access GitHub.

It must:

- hold the GitHub token or equivalent private repo credential
- restrict reads to configured allowlisted paths only:
  - `prompts/`
  - `dev-skills/public/`
- read files from GitHub
- parse front matter for metadata
- strip front matter from copyable content
- normalize item metadata
- detect resource-backed skills
- avoid exposing raw GitHub API responses to the client
- avoid exposing front matter to the client

The frontend must never receive:

- GitHub token
- raw GitHub API response
- YAML front matter
- non-allowlisted repo structure

## Item Model Decision

The endpoint returns normalized items grouped by section.

Each item includes:

- stable id
- section: `prompts` or `skills`
- title
- subtitle
- copyable body without front matter
- item kind/status metadata for rendering

Title and subtitle derivation:

- title: front matter title if present, otherwise filename/folder-derived fallback
- subtitle: front matter description or summary if present, otherwise empty or fallback label

Copyable body:

- full file body minus YAML front matter
- original Markdown/content formatting preserved exactly

## Skill Shape Decision

Skills are read from `dev-skills/public/`.

A skill is centered on `SKILL.md`.

Skills that have additional folders or files next to `SKILL.md` must be visually distinguished in the UI because they may reference scripts, resources, or other files and may not be directly usable by copying `SKILL.md` alone.

Recommended skill categories:

- `standalone` — folder contains `SKILL.md` only
- `resource-backed` — folder contains `SKILL.md` plus any additional sibling files or folders

The frontend should render `resource-backed` skills differently, for example with a badge such as `uses resources` or `not copy-only`.

## Refresh Decision

Support explicit refresh only:

- visible Reload button
- pull/swipe-to-refresh where the browser/platform supports it

No auto-refresh is required.

## Access Decision

Use a single shared access secret/password for the webpage.

This is sufficient for the first version because the tool is personal/private and does not require multiple users, roles, or permission levels.

The shared secret protects access to the page/API, while the GitHub token remains server-side only.

## Storage Decision

Use no persistent storage in v1.

The endpoint may build an in-memory response per request, but it should not introduce a database, cache, search index, or background sync process.

## Consequences

Benefits:

- private repo token remains protected
- simple iPhone UX
- no database or cache operational burden
- deterministic behavior on reload
- sanitized client payload
- resource-backed skills are not misleadingly presented as plain copy-only snippets

Tradeoffs:

- every load/reload hits GitHub or serverless runtime logic
- no offline access
- no search or filtering
- no version history in the UI
- shared password is simpler but weaker than real user authentication

## Non-Goals

- no caching layer
- no pagination
- no database
- no search
- no editing
- no GitHub write access
- no multiple users/roles
- no per-user authentication
- no configurable extraction rules per folder/type
- no automatic refresh
- no exposure of GitHub token, raw GitHub response, or front matter to the client

## Accepted Scope

V1 is a private, read-only, copy-oriented webpage for short prompt and skill lists.
