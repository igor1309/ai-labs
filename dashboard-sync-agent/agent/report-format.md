---
date: 2026-06-01
model: claude-opus-4-8
description: "Sync-report shape returned by dashboard-sync-agent. Consumed by the runtime for the Telegram notification path; structurally mirrored in the fix PR body."
---

# Sync Report Format

The agent returns exactly one report per run. The runtime parses it to drive `notification-spec.md`; the same report content is rendered into the PR body per `fix-pr-template.md`. The shape is fixed so two consumers can extract identical fields.

## Top-level shape

```
# dashboard-sync-agent run report

- Run mode: <manual|scheduled>
- Run started: <UTC ISO 8601>
- Run completed: <UTC ISO 8601>
- Tracked projects: <N>
- Surfaces clean: <N> / 3
- Surfaces drifted: <N> / 3
- Surfaces in error: <N> / 3
- PR: <opened #<N> | updated #<N> | none>

## Per-surface status

| Surface | Status | Lines added | Lines removed | Notes |
|---------|--------|-------------|---------------|-------|
| scripts/loc-dashboard.sh | <clean|drift|error> | <int> | <int> | <one line> |
| docs/products.html | <clean|drift|error> | <int> | <int> | <one line> |
| docs/loc-dashboard.html | <clean|drift|error> | <int> | <int> | <one line> |

## Untracked candidates

<bulleted list of top-level dirs absent from both ## Components and ## Structure,
 excluding the excluded-directories list from project-registry.md.
 Empty list rendered as the literal "(none)".>

## Removed-directory drift

<bulleted list of registry keys whose top-level directory no longer exists
 in the source tree. Empty list rendered as "(none)".>

## Unmapped types

<bulleted list of ## Components Type values not in synthesis-spec.md's
 Type-to-Category mapping table. Each item: "<Component name>: <Type>".
 Empty list rendered as "(none)".>

## Errors

<bulleted list of hard errors encountered during the run, one per surface
 or registry. Each item: "<surface or registry>: <one-line reason>".
 Empty list rendered as "(none)".>
```

## Field rules

- **Run mode** is `manual` if the trigger message contains no `--scheduled` token, otherwise `scheduled`.
- **Tracked projects** is the size of the canonical tracked set (registry rule applied).
- **Surfaces clean / drifted / in error** sum to 3.
- **Lines added / removed** count net diff lines per surface (zero when status is `clean` or `error`).
- **PR field**:
  - `opened #<N>` when the agent opened a new PR this run.
  - `updated #<N>` when the agent force-updated the existing stable-branch PR.
  - `none` when all surfaces were clean (no PR action taken).
- **Surface notes** is one line per surface — for `drift` rows, a phrase like "added <name>; removed <name>"; for `error` rows, the failure reason; for `clean` rows, `"unchanged"`. When `docs/loc-dashboard.html` is held `clean` by the LOC drift threshold (per `synthesis-spec.md` "Surface (3) drift tolerance"), the note is `"clean (below LOC threshold: <delta> < <N>)"` instead of `"unchanged"`, so the suppressed numeric drift is visible in the report.

## Worked example (current trunk@HEAD, dry run)

```
# dashboard-sync-agent run report

- Run mode: manual
- Run started: 2026-05-10T18:00:00Z
- Run completed: 2026-05-10T18:00:14Z
- Tracked projects: 22
- Surfaces clean: 0 / 3
- Surfaces drifted: 3 / 3
- Surfaces in error: 0 / 3
- PR: opened #<N>

## Per-surface status

| Surface | Status | Lines added | Lines removed | Notes |
|---------|--------|-------------|---------------|-------|
| scripts/loc-dashboard.sh | drift | 4 | 4 | added dashboard-sync-agent to header, loop, known list |
| docs/products.html | drift | 23 | 0 | added Dashboard Sync Agent card under Editorial & Agents |
| docs/loc-dashboard.html | drift | 1 | 0 | added dashboard-sync-agent data row |

## Untracked candidates

- docker
- docs
- img
- migrate-to-skills
- neris
- niora
- research
- scripts
- tests

## Removed-directory drift

(none)

## Unmapped types

(none)

## Errors

(none)
```

This worked example is the expected report from the agent's first authoritative run on the current `trunk`. It is not a contract — actual numbers will vary as the repo evolves — but the shape is fixed.
