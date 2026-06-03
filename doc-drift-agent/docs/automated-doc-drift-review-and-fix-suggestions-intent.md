---
date: 2026-06-02
author: Igor Malyarov
version: 0.0.4
---

# Automated Doc Drift Review and Fix Suggestions. Intent

`ai-labs` is a mono-repo with multiple projects. Each project has documentation —
a README and, for most, a `docs/` tree — plus the repo's root README.

The intent is to detect when **project documentation** drifts — from other docs
and from the actual repo state — and to help the maintainer decide what should be
fixed. Documentation is reviewed in **scopes**: one scope for all READMEs across
the repo (cross-project consistency), and one scope per top-level project covering
that project's docs (its `README.md` and `docs/`). Scopes are reviewed
independently so each review stays focused.

README drift was the original and biggest pain; this intent generalises that first
scope to the full set.

## User stories

As a repo maintainer,
I want to be notified when documentation drifts,
so I can notice documentation problems without checking manually.

As a repo maintainer,
I want to initiate a doc-drift review manually — a single scope or the whole set,
so I can check docs when I need to.

As a repo maintainer,
I want to receive documentation fix suggestions as PRs, scoped to the affected
project's docs,
so I can review and accept documentation changes through the normal repo flow.

## Success

Success means the maintainer can see:

- what drift was found, and in which scope
- what evidence supports it
- what documentation change is suggested
- which fixes are proposed as PRs

## Boundaries

The maintainer decides whether a drift finding is valid.

The maintainer decides whether to accept a documentation fix.

Fixes are limited to **documentation** — a project's docs within its scope. Code,
config, and scripts are never edited; if the real fix is code-side, the maintainer
decides that on the PR.

Auto-merge is out of scope.

## Revision history

- v0.0.4 (2026-06-02): generalised the scope from READMEs only to the scope set
  (cross-project READMEs + per-project `docs/`) and the edit surface from
  README-only to a project's documentation. Supersedes the README-only framing of
  v0.0.3.
