---
date: 2026-05-09
model: claude-opus-4-7
description: "Drift report shape emitted by the doc-drift-agent on every run; pins finding fields, evidence layout, and the no-drift case"
---

# Drift Report Format

The agent emits exactly one report per run, in Markdown. The shape is fixed so the runtime, the maintainer, and any downstream consumer (Telegram notification, PR body assembly) read the same artifact unambiguously.

## Top-level structure

```markdown
# Doc Drift Report

- Run mode: <manual | scheduled>
- Run timestamp (UTC): <YYYY-MM-DD HH:MM>
- Repo commit: <short SHA> (<branch>)
- READMEs inspected: <count> (per `doc-drift-agent/agent/readme-inventory.md`)
- Findings: <count>
- Fix PRs opened: <count of new PRs>
- Already tracked: <count of findings already covered by an open [doc-drift] PR>

## Findings

<one ## block per finding, or the "No drift found" line below>

## Fix PRs

<one row per opened PR, or "None.">
```

## Run-mode line

`Run mode:` is exactly `manual` or `scheduled`. Anything else is a report defect.

## Repo commit line

`<short SHA>` is the 7-character commit the agent reviewed. `<branch>` is `trunk` for scheduled runs and for manual runs unless the maintainer's manual-trigger payload explicitly names a different branch.

## Findings section

Each finding is one `##` block:

```markdown
## Finding <N> — <category>

- **Category:** <README ↔ README | README ↔ repo state | Internal consistency>
- **READMEs touched:** <relative path(s)>
- **Severity:** <factual | gap>

### Doc-side claim

> <verbatim quote of the README claim>

`<readme path>:<line>`

### Contradicting evidence

> <verbatim quote of the contradicting source, OR a short "missing path" / "removed at <commit>" note>

`<evidence path>:<line>` (or `<commit ref>` for removed/renamed artifacts)

### Suggested change

`<readme path>:<line>` — replace `<old>` with `<new>`. Minimum edit.

### Proposed PR

<one of:>
- `<PR URL>` — newly opened during this run.
- `Existing #<N> — already tracked` — an open `[doc-drift]` PR was found that already covers this finding (per `agent.md` step 7); no new PR was opened.
- `Pending` — the report is being emitted before PR creation (e.g. dry run).
```

Field rules:

- **Category** is exactly one of the three values from `drift-methodology.md`. No new categories.
- **Severity** is `factual` when the README states something the evidence directly contradicts, `gap` when the README is silent on a fact present in the repo (e.g. new top-level dir not in Components table). Severity does not change handling — it only helps the maintainer triage at a glance.
- **Doc-side claim** is a verbatim block quote. No paraphrasing. If the claim spans multiple lines, quote the full span and use a line range (`<path>:<start>-<end>`).
- **Contradicting evidence** is either a verbatim block quote (when the contradiction is in another text artifact) or a short note when the evidence is the *absence* of a path. The note format for absences is `Path \`<missing path>\` not present in working tree at commit <short SHA>.` For removed-or-renamed artifacts, cite a commit ref: `Removed in <short SHA>: <commit subject>.`
- **Suggested change** is the minimum edit. No restructuring, no surrounding cleanup.
- **Proposed PR** is the GitHub URL once the runtime has opened the PR. If the report is rendered before PR creation (e.g. for a dry run), the value is `Pending`.

## No-drift case

If no findings survive the false-positive filters in `drift-methodology.md`, the Findings section is exactly:

```markdown
## Findings

No drift found.
```

`Findings: 0` and `Fix PRs opened: 0` in the header. The Fix PRs section reads `None.`

## Fix PRs section

```markdown
## Fix PRs

| Finding | Status | Branch | URL |
|---------|--------|--------|-----|
| <N> | new      | doc-drift/<slug> | <https://github.com/.../pull/<new-N>> |
| <M> | existing | doc-drift/<slug> | <https://github.com/.../pull/<existing-N>> |
```

- `Status` is `new` (PR opened during this run) or `existing` (an open `[doc-drift]` PR already covered this finding — no new PR was opened, per `agent.md` step 7).
- Branch follows `doc-drift/<slug>` per `agent.md`. For `existing` rows, the branch shown is the existing PR's branch.
- One row per finding that has a PR (new or existing). Findings with `Pending` status do not appear in this table.

The report header counts must be consistent: `Fix PRs opened: <count of new rows>`. Existing rows are counted separately in prose (e.g. "and 2 already tracked") if non-zero.

## Reproducibility check

The same repo commit + the same inventory + the same methodology must yield byte-identical reports across runs. If a run produces a report that differs from a prior run on the same commit without a methodology or inventory change in between, the difference itself is a defect — surface it on the next run as part of the report header rather than silently.
