---
date: 2026-05-01
model: gpt-5
description: "Review findings for ClipDeck ADRs, spec, and implementation plan"
---

# ClipDeck Docs Review

## Finding 1

**Location:** `clipdeck/docs/specs/spec-iphone-copy-library.md:160`

**Priority:** P2

**Title:** Empty front matter test contradicts stripping rule

The rule says to remove the closing delimiter and one immediately following newline, then preserve the remaining bytes. For `---\n---\n\nbody\n`, that leaves `\nbody\n`, but the test expects `body\n`. Fix either the rule or the test; given the ADR's byte-preservation invariant, update test 29 to expect `\nbody\n`.

## Finding 2

**Location:** `clipdeck/docs/adr/adr-001-iphone-copy-library.md:1-6`

**Priority:** P2

**Title:** ADR front matter is missing required metadata

Repo Markdown rules require every Markdown file except `SKILL.md`, `log.md`, and the repository-root `README.md` to include front matter with at least `date`, `model`, and `description`. This new ADR has `date` but no `model` or `description`. Add those fields to keep the doc compliant.

## Finding 3

**Location:** `clipdeck/docs/specs/spec-iphone-copy-library.md:1-6`

**Priority:** P2

**Title:** Spec front matter is missing required metadata

Repo Markdown rules require every Markdown file except `SKILL.md`, `log.md`, and the repository-root `README.md` to include front matter with at least `date`, `model`, and `description`. This new spec has `date` but no `model` or `description`. Add those fields to keep the doc compliant.
