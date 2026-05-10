---
title: "Spec: iPhone Copy Library for Private Prompts and Skills"
date: 2026-05-01
model: claude-opus-4-7
description: "API contract, behavior rules, and 30 enumerated tests for clipdeck's GET /api/items endpoint and the iPhone frontend"
status: draft
artifact_type: spec
---

# Spec: iPhone Copy Library for Private Prompts and Skills

## Goal

Serve sanitized, normalized prompt and skill items from the private ai-labs repo to an iPhone-friendly webpage, owned by clipdeck, so each item can be copied with one tap and YAML front matter is stripped server-side.

## Public interface

### Source repo

- The source repo is `igor1309/ai-labs`.
- The endpoint reads files from the tip of branch `trunk`.

### Authentication

Every API request MUST carry the shared access secret. The validation channel (request header, cookie, or request body) is implementation-defined; the same channel MUST be used consistently.

### `GET /api/items`

Request: no parameters beyond authentication.

Success response (`200`):

```json
{
  "sections": [
    {
      "id": "prompts",
      "title": "Prompts",
      "items": [
        {
          "id": "prompts/example.md",
          "kind": "prompt",
          "title": "Example Prompt",
          "subtitle": "Optional description",
          "body": "Copyable body without front matter"
        }
      ]
    },
    {
      "id": "skills",
      "title": "Skills",
      "items": [
        {
          "id": "dev-skills/public/example-skill/SKILL.md",
          "kind": "skill",
          "title": "Example Skill",
          "subtitle": "Optional description",
          "body": "Copyable SKILL.md body without front matter",
          "skillShape": "resource-backed"
        }
      ]
    }
  ]
}
```

Field semantics:

- `sections[].id` — `"prompts"` or `"skills"`.
- `sections[].title` — fixed human-readable label: `"Prompts"` for the `prompts` section, `"Skills"` for the `skills` section.
- `items[].id` — relative path of the source file inside the ai-labs repo.
- `items[].kind` — `"prompt"` or `"skill"`.
- `items[].title`, `items[].subtitle` — derived per the rules below.
- `items[].body` — file content with YAML front matter removed.
- `items[].skillShape` — present only when `kind == "skill"`; value is `"standalone"` or `"resource-backed"`.

Error responses:

- `401` — missing or incorrect shared secret. Response body: `{ "error": "unauthorized" }`. Body MUST NOT contain item data.
- `502` — upstream GitHub failure or a configured allowlist source path missing in the source repo. Response body:

```json
{
  "error": "upstream_github_failure" | "source_missing",
  "source": "prompts" | "skills"
}
```

`error == "upstream_github_failure"` covers any GitHub-side failure (network, 5xx, rate limit, auth rejection). `error == "source_missing"` is returned when one of the allowlisted paths does not exist in the source repo. `source` MUST identify which allowlisted path was being read when the failure occurred.

## Behavior rules

### Authentication

- A request without the shared access secret, or with an incorrect value, MUST receive `401` and MUST NOT include any item data.

### Allowlist

- The endpoint MUST read only `prompts/` and `dev-skills/public/`. No path outside the allowlist may appear in the response.

### Response shape

- The response MUST contain both sections, in this order: `prompts` first, then `skills`. A section with no discovered items MUST still appear with `items: []`.
- Items inside each section MUST be ordered by `id` ascending (lexicographic byte order).

### Prompt discovery

- Prompts MUST be discovered as files matching `prompts/<name>.md` (extension `.md` only, case-sensitive). Files with any other extension and files inside nested folders MUST be ignored.
- Each prompt file produces one item with `kind == "prompt"` and `id == "prompts/<name>.md"`.

### Skill discovery

- Skills MUST be discovered as folders under `dev-skills/public/` that contain a `SKILL.md`. Folders without `SKILL.md` MUST be ignored.
- Each skill produces one item whose `body` is the skill's `SKILL.md` and whose `id` is the path to that `SKILL.md`.
- A skill folder containing only `SKILL.md` MUST set `skillShape == "standalone"`.
- A skill folder containing `SKILL.md` plus any additional sibling files or folders MUST set `skillShape == "resource-backed"`.

### Front matter stripping

- If a file begins with a YAML front matter block (an opening `---` line, lines of YAML, a closing `---` line), the returned `body` MUST start at the first byte after the newline that terminates the closing `---` line. No further bytes are skipped — any blank line between the closing `---` and the body is preserved verbatim, consistent with ADR-001's byte-preservation invariant.
- All bytes after that point MUST be preserved unchanged: Markdown syntax, blank lines, indentation, code fences, trailing newline.
- If a file does not begin with `---`, the returned `body` MUST be the entire file content unchanged.
- If a file begins with `---` but the front matter is malformed (no closing delimiter, invalid YAML, etc.), the file MUST be treated as if it had no front matter; its `body` MUST be the entire file content unchanged. The endpoint MUST NOT fail the response because of a single malformed item.
- A well-formed front matter block with no YAML keys (the second `---` line immediately follows the first) is valid; the returned `body` follows the same rule as above (start at the first byte after the closing `---` line's terminating newline; preserve everything that follows verbatim), and the item MUST behave as having no front matter for `title` and `subtitle` derivation.

### Title and subtitle derivation

- `title` MUST be the front matter `title` value when present; otherwise the file's basename without extension for prompts, or the skill folder name for skills.
- `subtitle` MUST be the front matter `description` value when present; else `summary` when present; else the empty string.
- Front matter content MUST NOT appear in the response payload other than via `title` and `subtitle`.

### Sanitization

- The response MUST NOT contain the GitHub token, the raw GitHub API response, YAML front matter content, or any path/file outside the allowlist.

### Source repo credential

- The lifecycle of the backend's source-repo credential is governed by ADR-002. A request that cannot be served because the credential is missing, rejected, or expired MUST surface as the upstream-GitHub-failure path (HTTP `502`) and MUST NOT leak credential state or token bytes in the response.

### Frontend behavior

- The page MUST be gated behind the shared access secret; until the secret is accepted by the backend, no item data is rendered.
- Each rendered item MUST show its title, subtitle, and (for skills) a visual distinction when `skillShape == "resource-backed"`.
- Tapping an item MUST copy that item's `body` to the clipboard verbatim and MUST surface a visible feedback indicator that reports either copy success or copy failure. The indicator MUST be observable in the rendered DOM (a visible element whose text or attribute reflects the outcome).
- A Reload action MUST refetch `GET /api/items` and replace the rendered list. Pull/swipe-to-refresh MUST behave identically where the platform supports it.
- The frontend MUST NOT request data from GitHub directly and MUST NOT receive the GitHub token under any condition.

## Tests

Each test corresponds to a behavior rule and defines the failure surface. An implementation that does not pass each test below is not done.

1. `GET /api/items` without the shared secret returns `401` and no item data.
2. `GET /api/items` with an incorrect shared secret returns `401` and no item data.
3. `GET /api/items` with the correct shared secret returns `200` with two sections, `prompts` and `skills`.
4. A file at `prompts/foo.md` appears as an item with `kind == "prompt"` and `id == "prompts/foo.md"`.
5. A file at `prompts/sub/bar.md` does not appear in the response.
6. A folder `dev-skills/public/example/` containing only `SKILL.md` appears with `kind == "skill"`, `id == "dev-skills/public/example/SKILL.md"`, `skillShape == "standalone"`.
7. A folder `dev-skills/public/example/` containing `SKILL.md` plus a sibling `helper.py` returns the same item with `skillShape == "resource-backed"`.
8. A folder under `dev-skills/public/` without a `SKILL.md` does not appear in the response.
9. A file beginning with a well-formed front matter block returns `body` starting at the first byte after the closing `---` line's terminating newline; all subsequent bytes are preserved exactly (no separator newline is consumed).
10. A file with no front matter returns `body == file content`.
11. A file beginning with `---` but no closing delimiter returns `body == file content` and does not fail the request.
12. A file with front matter containing invalid YAML returns `body == file content` and does not fail the request.
13. `title` is read from front matter `title` when present.
14. `title` falls back to the filename basename (prompts) or the folder name (skills) when front matter `title` is absent.
15. `subtitle` is read from front matter `description` when present.
16. `subtitle` falls back to `summary` when `description` is absent and `summary` is present.
17. `subtitle` is the empty string when neither `description` nor `summary` is present.
18. The top-level response object has exactly one key `sections`. Each section object has exactly the keys `id`, `title`, `items`. Each item object has exactly the keys `id`, `kind`, `title`, `subtitle`, `body`, plus `skillShape` only when `kind == "skill"`. No additional keys are present. No string field's value contains the verbatim YAML front matter of any source file, and no item field equals the GitHub access token.
19. A configured allowlist source path missing in the source repo returns `502` with body `{ "error": "source_missing", "source": "prompts" | "skills" }` identifying which source is missing.
20. A simulated upstream GitHub failure (network error, 5xx, rate limit, or auth rejection) during item read returns `502` with body `{ "error": "upstream_github_failure", "source": "prompts" | "skills" }`.
21. The page does not render any item data until the backend accepts the shared secret.
22. Tapping a rendered item writes that item's `body` to the clipboard verbatim AND a visible feedback indicator (DOM element) appears reporting the outcome.
23. The Reload action refetches `GET /api/items` and replaces the rendered list.
24. Resource-backed skills are visually distinct from standalone skills in the rendered list.
25. The response always lists the `prompts` section before the `skills` section.
26. A section with no discovered items appears in the response with `items: []`.
27. Items inside each section are returned in lexicographic ascending order of `id`.
28. A non-`.md` file in `prompts/` (for example `prompts/README.txt` or `prompts/.DS_Store`) does not appear in the response.
29. A file beginning `---\n---\n\nbody\n` returns `body == "\nbody\n"` (the blank line between the closing `---` and `body` is preserved verbatim) and is treated as having no front matter for `title`/`subtitle` derivation.
30. A backend whose source-repo credential is missing, rejected by GitHub, or expired returns `502` and the response body contains no token bytes or credential state.

## Done criteria

- `GET /api/items` is implemented per the Public interface section.
- The frontend implements the rules in "Frontend behavior".
- All tests in the Tests section pass.
- This spec moves to `clipdeck/docs/specs/implemented/` once the above are met.
