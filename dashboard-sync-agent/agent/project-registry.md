---
date: 2026-09-05
model: gpt-6-astra
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
2. **Classify the row.** Each row is one of three things; pick the first that fits.

   - **Tracked — contributes to the tracked set.** Top-level directory in the source tree: `<key>/` exists at the repo root. The directory decides, whatever the Type cell says: `reinix` is `CLI release unit` and is tracked, because `reinix/` exists.
   - **Sub-component — skip silently, do not surface as drift.** A row with no top-level directory of its own that documents part of a tracked project: a release unit, a named sub-path, or anything that lives inside another project's directory. They exist for documentation, not as targets for the agent. Recognize them by any of: a `/` in the name (e.g. `docker/langfuse`), a Type cell that names a sub-unit role (`Release unit`, `CLI release unit`, or any equivalent worded variant — judge intent), or a `<parent>-<suffix>` shape where `<parent>` is itself tracked. Current examples in this repo: `notio-backend`, `notio-frontend`, `docker/langfuse`. These should never appear in your "Removed-directory drift" list.
   - **Removed-directory drift — surface in the report.** A registry row that intends to point at a top-level project, but the directory is gone. This is rare and should not include sub-components — if you find yourself flagging `notio-backend` as removed-directory drift, you've classified wrong; it's a sub-component.
3. **Deduplicate.** A directory may appear in both tables. It is counted once. The Components row is preferred when both exist (so surface (2) gets its `Type` and `Description`); for surface (1) the choice does not matter.
4. **Sort.** The canonical tracked set is sorted ASCII-ascending by registry key. This is the order the agent emits in the `for proj in ...` loop and the `known` list of `scripts/loc-dashboard.sh`.

## Untracked candidates

Top-level directories present in the source tree but absent from both `## Components` and `## Structure` are **untracked candidates**. The agent:

- Does not add them to the tracked set.
- Does not silently drop them from `scripts/loc-dashboard.sh` if they happen to already be in the `for proj` loop or `known` list — the agent leaves the script untouched for those names and surfaces them in the PR description.
- Lists each one in the PR description's "Candidates for Components or Structure registration" section, with no recommendation about which table they belong in (that is a maintainer decision).

As of `trunk@HEAD` (2026-05-25): no untracked candidates. `neris` and `niora` were promoted to `## Components`; the workspace dirs below were added to the excluded list.

## Excluded directories

The following top-level entries are excluded from the candidates check entirely. They are workspace machinery, not projects, and do not belong in either table:

- `node_modules/`, `vendor/`, `.git/`, `.github/`, `.claude/`, `.codex/`, `.lazyweb/`, `.wrangler/`
- `worktrees/`, `_inbox/`, `backlog/`
- `docker/`, `docs/`, `img/`, `migrate-to-skills/`, `research/`, `scripts/`, `tests/`
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

Inputs as of 2026-05-25:

- `## Components` rows whose key maps to a top-level dir: `nexum`, `notio`, `oracle`, `reinix`, `nomos`, `corpus-scout`, `web-scout`, `loki`, `claude-insights`, `session-digest`, `dragoman`, `clipdeck`, `doc-drift-agent`, `dashboard-sync-agent`, `neris`, `niora`, `tools`, `dev-skills`, `sandbox`.
- `## Components` rows skipped (not a top-level dir): `notio-backend`, `notio-frontend`, `docker/langfuse`.
- `## Structure` rows whose key maps to a top-level dir: `prompts`, `dev-skills`, `tools`, `sandbox`, `insights`, `reading`, `debates`, `gemini`.
- `## Structure` rows skipped (not a top-level dir): `migrate-to-skills/guides`, `tools/mac-health`.

Tracked set (sorted, deduplicated):

```
claude-insights, clipdeck, corpus-scout, dashboard-sync-agent, debates,
dev-skills, doc-drift-agent, dragoman, gemini, insights, loki, neris,
nexum, niora, nomos, notio, oracle, prompts, reading, reinix, sandbox,
session-digest, tools, web-scout
```

Untracked candidates (top-level dirs present in repo, absent from both tables, not in the excluded list): none. The workspace dirs (`docker`, `docs`, `img`, `migrate-to-skills`, `research`, `scripts`, `tests`) are excluded; all genuine projects are now in `## Components`.
