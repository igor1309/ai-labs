---
name: arch-doc-review
version: "1.0.0"
description: Checklist for reviewing architecture and design docs in PRs
trigger: when reviewing architecture docs, design docs, or ADRs in pull requests
---

# Architecture Doc Review

Use this checklist when reviewing architecture/design docs in PRs.

- Ambiguity (`fail/warn/pass`): Core terms are defined once, and rules have one reasonable interpretation.
- Clarity (`fail/warn/pass`): The doc states scope, allowed behavior, and prohibited behavior in concrete terms.
- Consistency (`fail/warn/pass`): No internal contradictions across sections; examples match stated rules.
- Readability (`fail/warn/pass`): Structure is skimmable (`Purpose`, `Rules`, `Testing`, `Checklist`) with concise bullets and minimal prose.
- Best practices (`fail/warn/pass`): Guidance aligns with repo architecture constraints (ownership boundaries, composition rules, testing strategy).
- Drift resistance (`fail/warn/pass`): Critical rules use enforceable wording (`must/must not`) and include at least one verification mechanism (review checklist, tests, or CI gate).

Review output requirements:
- Provide verdict per criterion (`pass/warn/fail`).
- Reference exact locations (`file:line`).
- Provide concrete fix text for each `warn/fail`.
- Review only changed/added doc scope, unless a change creates a cross-doc contradiction.
