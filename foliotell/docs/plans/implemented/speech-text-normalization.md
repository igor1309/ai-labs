---
date: 2026-07-08
model: claude-fable-5
description: "Implementation plan: SpeechTextNormalization — content-only speech string for FolioTell playback"
---

# Implementation Plan — FolioTell Speech Text Normalization

Implements [`../../specs/implemented/speech-text-normalization.md`](../../specs/implemented/speech-text-normalization.md)
(intake: [`../../intake/speech-normalization-intake.md`](../../intake/speech-normalization-intake.md)),
closing the "Normalize text for speech" backlog item.

## Goal

Deliver a pure `FolioTellCore` speech-text normalizer and wire it into the
reader's speech path so playback speaks document content instead of raw
Markdown markup, with the visual rendering untouched.

## Execution mode

```
Mode: auto-continue
Human review between tasks: no
Stop conditions: failed gates, unclear scope, missing credentials/tooling, destructive operations, explicit user interruption
Push policy: push at closeout
```

## Execution lock

```
Worktree mode: reuse existing
Expected worktree: /Users/igormalyarov/Developer/my-apps/ai-labs/ai-labs.worktrees/foliotell-backlog
Expected branch: foliotell/backlog
Preflight check: [x] done — clean tree on foliotell/backlog verified at execution start (same session)
```

## Scope guardrails

Out of scope (spec non-goals and separate backlog items):

- Visual Markdown rendering improvements ("Render Markdown more clearly").
- Playback-position persistence, navigation controls, recent-documents
  library, background/lock-screen work.
- Tables, raw HTML, reference-style links/footnotes, setext headings,
  backslash escapes, angle-bracket autolinks.
- Maestro flow changes and real-device validation.
- No new package dependencies.

## Phase 1 — Core normalizer (strict TDD)

- **Objective**: `SpeechTextNormalization.speechText(from:)` in
  `Sources/Core/`, behavior rules 1–11 of the spec.
- **Key work items**: RED/GREEN/REFACTOR through the spec's enumerated tests
  1–20 in `Tests/Core/SpeechTextNormalizationTests.swift`, including the
  Pushkin-shaped inline valid-artifact string (BOM + quoted-value YAML front
  matter + `#` heading + Russian paragraph) and the mixed
  Markdown/plain-text case.
- **Dependencies**: none.
- **Risks**: emphasis-pairing edge cases (word-internal underscores,
  unpaired markers); fence-state tracking across lines.
- **Validation**: `swift test` in `foliotell/` (full package suite).
- **Completion signal**: all 20 spec tests plus the pre-existing suite green.

## Phase 2 — Wire the speech path

- **Objective**: reader speech string = normalizer composed after
  `FrontMatterPlaybackMode.speechText(from:)` (spec rule 12).
- **Key work items**: use one composed speech-string definition in
  `ReaderView` for playback (`playbackButtons`) and for `documentSpeechText`
  (language detection / voice filtering); no changes to
  `FrontMatterRendering` or `documentText`.
- **Dependencies**: Phase 1.
- **Risks**: accidental divergence between the play-button string and
  `documentSpeechText`.
- **Validation**: `swift test` and `swift build` in `foliotell/`; `git diff`
  inspection confirms visual-path files/functions untouched.
- **Completion signal**: build and full suite green; diff shows speech path
  only.

## Phase 3 — Docs and closeout

- **Objective**: repo bookkeeping for the change set.
- **Key work items**: add `foliotell/docs/log.md` entry; remove the
  "Normalize text for speech" item from `foliotell/backlog/product.md`; move
  spec to `foliotell/docs/specs/implemented/`; move this plan to
  `foliotell/docs/plans/implemented/`; refresh `docs/loc-dashboard.html`
  from `./scripts/loc-dashboard.sh --sort=name`.
- **Dependencies**: Phases 1–2.
- **Risks**: none material.
- **Validation**: markdown front matter/structure check; dashboard matches
  script output.
- **Completion signal**: docs updated and committed.

## Done criteria

- Spec "Done criteria" fully met: interface in `FolioTellCore`, all listed
  tests pass, speech path composed, visual rendering untouched, existing
  tests unchanged and green.
- `swift build` and `swift test` green in `foliotell/`.
- Backlog, log, spec/plan archives, and loc dashboard updated.
- PR opened from `foliotell/backlog`, auto-merge set
  (`--merge --auto --delete-branch`), CI green.

## Final closeout

```
Final gates: swift build && swift test (in foliotell/)
Archive plan: move to foliotell/docs/plans/implemented/ (same PR)
Commit archive move: yes
Push/PR: follow push policy — push at closeout, single PR via gh pr create then gh pr merge --merge --auto --delete-branch; watch via ./scripts/watch-pr.sh
```
