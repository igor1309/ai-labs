---
title: "Spec: iPhone Copy Library for Private Prompts and Skills"
date: 2026-05-01
status: draft
artifact_type: spec
---

# Spec: iPhone Copy Library for Private Prompts and Skills

## Goal

Create an iPhone-friendly private webpage that lists reusable prompts and skills from a private GitHub repository and lets the user copy each item with one tap.

Copied content must exclude YAML front matter and preserve the original body formatting exactly.

## Repository Inputs

Configured allowlisted source paths:

```yaml
sources:
  prompts:
    path: prompts/
  skills:
    path: dev-skills/public/
```

## Sections

The UI renders two sections:

1. `prompts`
2. `skills`

Both sections are loaded from the backend/serverless endpoint.

## User Experience

### Page Layout

The page contains:

- access gate using a shared secret/password
- Reload button
- pull/swipe-to-refresh support where available
- `prompts` section
- `skills` section
- copy feedback after tapping a cell/card

### Cell/Card Behavior

Each cell/card is a copy button.

Each cell/card shows:

- title
- subtitle
- optional badge/status indicator

On tap:

- copy the sanitized body to clipboard
- show clear feedback, for example `Copied`

### Skill Visual Distinction

A skill backed only by `SKILL.md` may look like a normal copyable item.

A skill with additional sibling files or folders next to `SKILL.md` must look different because copying only `SKILL.md` may be incomplete.

Suggested UI treatment:

- badge: `uses resources`
- secondary hint: `May reference files/scripts`
- different icon or muted warning style

The cell may still copy `SKILL.md`, but the UI must not imply that the copied text is necessarily self-contained.

## Backend Responsibilities

The backend/serverless endpoint owns:

- validating the shared secret/password
- storing and using GitHub credentials
- reading the private GitHub repo
- enforcing allowlisted paths only:
  - `prompts/`
  - `dev-skills/public/`
- discovering prompt files
- discovering skill folders/files
- reading prompt content
- reading each skill’s `SKILL.md`
- parsing YAML front matter for metadata
- stripping YAML front matter from copyable body
- preserving body formatting exactly after stripping
- detecting resource-backed skills
- returning normalized sanitized JSON

The backend must not return:

- GitHub token
- raw GitHub API response
- YAML front matter
- files outside configured allowlisted paths

## Frontend Responsibilities

The frontend owns:

- rendering the access gate
- requesting normalized data from the endpoint
- rendering sections and cards
- handling Reload button
- handling pull/swipe-to-refresh where supported
- copying sanitized item body to clipboard
- showing copy success/failure feedback
- visually distinguishing resource-backed skills

The frontend must not:

- call GitHub directly
- strip front matter itself
- receive raw GitHub content containing front matter
- know or expose the GitHub token

## Normalized API Shape

Recommended response shape:

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
          "body": "Copyable body without front matter",
          "badges": []
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
          "badges": ["uses resources"],
          "skillShape": "resource-backed"
        }
      ]
    }
  ]
}
```

## Metadata Rules

For every item:

- title comes from front matter `title` if present
- title falls back to filename or skill folder name
- subtitle comes from front matter `description` or `summary` if present
- subtitle may be empty if no useful metadata exists

Front matter is used only server-side.

## Front Matter Stripping Rules

The backend strips YAML front matter when a file starts with a front matter block:

```markdown
---
title: Example
summary: Example summary
---

Body starts here.
```

Returned `body` starts after the closing delimiter.

The body content after the front matter block must be preserved exactly, including:

- Markdown syntax
- blank lines
- indentation
- code fences
- spacing

## Discovery Rules

### Prompts

Prompt discovery reads files under:

```text
prompts/
```

Expected prompt file format:

```text
prompts/<name>.md
```

Nested prompt folders are out of scope unless explicitly added later.

### Skills

Skill discovery reads folders under:

```text
dev-skills/public/
```

Expected skill format:

```text
dev-skills/public/<skill-name>/SKILL.md
```

Skill shape detection:

- `standalone`: folder contains `SKILL.md` only
- `resource-backed`: folder contains `SKILL.md` plus any additional sibling files or folders

Resource-backed skills must receive a visual badge/status in the frontend.

## Refresh Behavior

Supported:

- Reload button
- pull/swipe-to-refresh where supported

Not supported:

- automatic refresh
- background polling
- persistent cache invalidation

## Error States

Minimum error states:

- invalid shared secret/password
- GitHub access failure
- configured path missing
- malformed file/front matter fallback
- clipboard copy failure

Errors should be concise and actionable.

## Security Constraints

- GitHub token is server-side only.
- Frontend never calls GitHub directly.
- Backend reads only configured allowlisted paths.
- Client receives sanitized normalized JSON only.
- Front matter is never returned to the client.
- Shared secret/password is required before data is shown.

## Out of Scope

- caching
- pagination
- database
- search
- editing
- GitHub write access
- multiple users/roles
- per-user authentication
- configurable extraction rules
- automatic refresh
- exposing repo structure beyond normalized configured sections

## Acceptance Criteria

- Opening the page requires a shared secret/password.
- After successful access, the page shows two sections: `prompts` and `skills`.
- The `prompts` section is loaded from `prompts/`.
- The `skills` section is loaded from `dev-skills/public/`.
- Each item shows title and subtitle.
- Tapping an item copies body content without YAML front matter.
- Copied content preserves original formatting exactly after front matter removal.
- Reload button refreshes the list.
- Pull/swipe-to-refresh refreshes the list where supported.
- Resource-backed skills look different from standalone skills.
- Client never receives GitHub token, raw GitHub API response, or front matter.
- No persistent cache, pagination, database, search, or editing is introduced.
