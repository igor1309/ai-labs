---
date: 2026-05-09
model: claude-opus-4-7
description: "Pull request template for fix PRs opened by the doc-drift-agent; pins title prefix, body sections, scope-of-change checklist, and the do-not-auto-merge reminder"
---

# Fix PR Template

Every PR the agent opens follows this template. The title prefix is fixed; the body sections are fixed; one PR addresses one cohesive finding (or one cohesive group of findings on the same README).

## Title

```
[doc-drift] <readme path>: <one-line summary of the change>
```

Rules:

- Prefix is exactly `[doc-drift] ` (with the trailing space). Used for filtering and Telegram-side grouping.
- `<readme path>` is the relative path of the README being edited (e.g. `README.md`, `notio/README.md`).
- `<one-line summary>` is plain English describing the corrective edit, not the drift. ("update notio release tag to `notio-backend_v<version>`", not "fix drift").
- Title length stays ≤ 70 characters where possible; longer titles are allowed only when the README path itself forces it.

## Branch

`doc-drift/<slug>` per `doc-drift-agent/agent/agent.md`. The slug is short kebab-case derived from the finding (e.g. `doc-drift/components-table-missing-row`).

## Body

```markdown
## Finding

<one-paragraph restatement of the drift, copied from the report's Finding block>

- **Category:** <README ↔ README | README ↔ repo state | Internal consistency>
- **README:** `<relative path>`

## Evidence

### Doc-side claim

> <verbatim quote>

`<readme path>:<line>`

### Contradicting evidence

> <verbatim quote OR absence note OR commit ref>

`<evidence path>:<line>` (or `<commit ref>`)

## Change

Minimum edit. The diff in this PR is limited to the lines named above; no surrounding cleanup, no formatting passes.

## Scope-of-change checklist

- [ ] Only the README named under "Finding" is modified.
- [ ] No code, config, script, CI workflow, or non-README markdown is modified.
- [ ] No formatting/style/restructure changes outside the minimum edit.
- [ ] Front matter (if present) is unchanged.

## Do not auto-merge

This PR is opened by the doc-drift-agent. **Do not enable auto-merge.** The agent never merges or approves PRs (per `doc-drift-agent/docs/adr-specialized-openclaw-agent-readme-drift-review-v0.0.4.md`). The maintainer reviews and merges manually.

## Provenance

- Run mode: <manual | scheduled>
- Repo commit reviewed: `<short SHA>`
- Report: <link to the run's drift report, or inline-quoted if no link is available>
```

Body rules:

- Sections appear in the listed order. No additional sections. No removed sections.
- The scope-of-change checklist is rendered with empty checkboxes — the reviewer ticks them during review.
- The "Do not auto-merge" section is mandatory and verbatim. It is the social safety net behind the runtime's no-auto-merge guarantee.
- Provenance lets the maintainer reproduce the agent's reasoning from the cited commit + report.

## When a fix is rejected

If the maintainer closes the PR without merging, the agent's behavior on the next run is unchanged: it will detect the same drift again and open a fresh PR. To suppress repeated re-opening, the maintainer either (a) merges a different fix that resolves the drift, or (b) updates the inventory or methodology to record the case as a sanctioned exception. The agent does not track its own rejected PRs and does not back off on its own.
