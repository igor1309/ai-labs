---
date: 2026-05-10
model: claude-opus-4-7
description: "Project-registry rule for dashboard-sync-agent: how to derive the canonical tracked project set from the root README's ## Components and ## Structure tables"
---

# Project-Registry Rule

The agent's tracked project set is derived deterministically from the root `README.md` on every run. This document is the rule. The agent does not invent its own list, does not consult per-project READMEs to decide membership, and does not use directory heuristics.

## Inputs

Two tables in the root `README.md`:

- `## Components` — columns: `| Component | Type | Description |`. The `Component` cell is the registry key for surfaces (1) and (2).
- `## Structure` — columns: `| Path | Purpose |`. The `Path` cell, with surrounding backticks and trailing slash stripped, is the registry key for surface (1) only.

Section headers are matched case-sensitively as `## Components` and `## Structure` on a line by themselves. The agent reads the first occurrence of each section in the file.

## Resolution

For every data row in either table:

1. **Extract the registry key.**
   - Components: take the `Component` cell verbatim.
   - Structure: take the `Path` cell, strip surrounding backticks if present, and strip the trailing `/` if present.
2. **Classify the row.** Compute the row's classification using the rules below in order; the first match wins.

   - **Sub-component (silently skipped):** the row is a sub-component of a tracked project, intentional in the table for documentation purposes but not itself a top-level project. A row is a sub-component iff any of:
     - The registry key contains a `/` (e.g. `docker/langfuse`, `migrate-to-skills/guides`).
     - The Components `Type` cell starts with `Release unit` or `CLI release unit` (e.g. `notio-backend`, `notio-frontend`).
     - The registry key matches a parent directory name that is itself a tracked Components or Structure entry, prefixed by `<parent>-` (e.g. `notio-backend` for parent `notio`). This is a fallback for sub-component rows that don't carry an explicit `Release unit` Type.
   - **Tracked (contributes to the tracked set):** the registry key is the name of an existing top-level directory in the source tree (i.e. `<key>/` exists at the repo root) and the row is not a sub-component.
   - **Removed-directory drift (surfaced, see below):** the registry key would be tracked except that no top-level directory by that name exists in the source tree.
3. **Deduplicate.** A directory may appear in both tables. It is counted once. The Components row is preferred when both exist (so surface (2) gets its `Type` and `Description`); for surface (1) the choice does not matter.
4. **Sort.** The canonical tracked set is sorted ASCII-ascending by registry key. This is the order the agent emits in the `for proj in ...` loop and the `known` list of `scripts/loc-dashboard.sh`.

## Untracked candidates

Top-level directories present in the source tree but absent from both `## Components` and `## Structure` are **untracked candidates**. The agent:

- Does not add them to the tracked set.
- Does not silently drop them from `scripts/loc-dashboard.sh` if they happen to already be in the `for proj` loop or `known` list — the agent leaves the script untouched for those names and surfaces them in the PR description.
- Lists each one in the PR description's "Candidates for Components or Structure registration" section, with no recommendation about which table they belong in (that is a maintainer decision).

The current empirical baseline at `trunk@HEAD` (2026-05-10): `neris` and `niora` are untracked candidates. Both are in the `loc-dashboard.sh` `for proj` loop today.

## Excluded directories

The following top-level entries are excluded from the candidates check entirely. They are workspace machinery, not projects, and do not belong in either table:

- `node_modules/`, `vendor/`, `.git/`, `.github/`, `.claude/`, `.codex/`, `.lazyweb/`, `.wrangler/`
- `worktrees/`, `_inbox/`
- Single-file siblings (no subdirectory case applies)

A directory matching one of these names is skipped silently. The list lives here, not in the agent prompt — extending it is a methodology change, not a prompt change.

## Removed directories

A registry key classified as **removed-directory drift** by step 2 (i.e. not a sub-component, registry key would otherwise be tracked, but the directory does not exist) is surfaced explicitly. The agent:

- Does not add the key to the tracked set — there is no directory to render content for.
- Surfaces the key in the PR description's "Registry rows referring to missing directories" section.
- Does not silently delete loop entries, cards, or data-array rows for the missing key — the agent leaves those untouched until the maintainer (or `doc-drift-agent`) removes the registry row.

This keeps the README the source of truth and prevents the agent from quietly deleting content when a directory is moved or renamed. **Sub-component rows are never surfaced as removed-directory drift** — they are silently skipped at step 2.

## Edge cases

- **Table missing.** If either `## Components` or `## Structure` is missing or empty, the agent runs against the surviving table only and surfaces the missing one in the PR description as a hard error. It does not infer a registry from elsewhere.
- **Row reordering.** Set semantics; the agent treats `## Components` as an unordered set. Reordering rows in the README does not produce drift.
- **Whitespace and case.** Registry keys are compared with surrounding whitespace stripped and exact case preserved. `Notio` and `notio` are distinct keys (the agent does not case-fold).
- **Duplicate registry keys within a single table.** If `## Components` contains two rows with the same `Component` value, the agent uses the first occurrence and surfaces the duplicate in the PR description.

## Worked example (current `trunk@HEAD`)

Inputs as of 2026-05-10:

- `## Components` rows whose key maps to a top-level dir: `nexum`, `notio`, `oracle`, `regentara`, `nomos`, `corpus-scout`, `web-scout`, `loki`, `claude-insights`, `session-digest`, `dragoman`, `clipdeck`, `doc-drift-agent`, `dashboard-sync-agent`.
- `## Components` rows skipped (not a top-level dir): `notio-backend`, `notio-frontend`, `docker/langfuse`.
- `## Structure` rows whose key maps to a top-level dir: `prompts`, `dev-skills`, `tools`, `sandbox`, `insights`, `reading`, `debates`, `gemini`.
- `## Structure` rows skipped (not a top-level dir): `migrate-to-skills/guides`.

Tracked set (sorted, deduplicated):

```
claude-insights, clipdeck, corpus-scout, dashboard-sync-agent, debates,
dev-skills, doc-drift-agent, dragoman, gemini, insights, loki, nexum,
notio, nomos, oracle, prompts, reading, regentara, sandbox,
session-digest, tools, web-scout
```

Untracked candidates (top-level dirs present in repo, absent from both tables, not in the excluded list): `docker`, `docs`, `img`, `migrate-to-skills`, `neris`, `niora`, `research`, `scripts`, `tests`. Of these, `neris` and `niora` are in the current `loc-dashboard.sh` `for proj` loop and would be the most prominent items in the agent's first PR description.

The maintainer's job after the first PR is to either add the genuine projects (`neris`, `niora`) to `## Components` or extend the excluded-directories list above for the workspace dirs (`docker`, `docs`, `img`, `research`, `scripts`, `tests`, `migrate-to-skills`).
