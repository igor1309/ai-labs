---
date: 2026-07-08
model: claude-fable-5
description: "Implementation plan: per-document playback position persistence and sentence-anchored resume"
---

# Implementation Plan — FolioTell Persist Playback Position

Implements [`../specs/persist-playback-position.md`](../specs/persist-playback-position.md)
(ADR: [`../adr/adr-001-per-document-playback-position.md`](../adr/adr-001-per-document-playback-position.md),
intake: [`../intake/persist-position-intake.md`](../intake/persist-position-intake.md)),
closing the "Persist playback position and resume" backlog item.

## Goal

Deliver a pure `FolioTellCore` mapping between spoken offsets and document-text
sentence anchors, plus App-layer persistence and resume wiring, so a document
reopened after stop, close, or relaunch resumes speaking from the start of the
interrupted sentence.

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
Expected branch: foliotell/persist-position
Preflight check: [x] done — clean tree on foliotell/persist-position verified at execution start (same session)
```

## ADR traceability matrix

| ADR-001 invariant | Phase |
|---|---|
| Anchor is document-text sentence start; no normalized-space offsets persisted | 1 |
| Offset-traceability mapping is pure, Core, Foundation-only | 1 |
| Safe degradation (skipped-front-matter, out-of-range, misaligned anchors) | 1 |
| Store protocol owned by App-layer client; UserDefaults first implementation | 2 |
| Path-keyed records; no cross-document sharing | 2 |
| Save at sentence transitions; no single-teardown-hook dependency | 2 |
| Stop preserves; completion clears; resume at sentence start | 2 |
| Speed/voice changes never reset the anchor | 2 |
| Position-only record; global settings untouched | 2 |
| pbxproj registration (dual-build rule) | 1–2 |

## Scope guardrails

Out of scope (spec non-goals and separate backlog items):

- Security-scoped bookmarks, recent-documents library, pruning.
- Per-document speed/voice/front-matter persistence.
- Previous/next-sentence navigation controls; scrubbable progress UI.
- Background/lock-screen work; Maestro flow changes; real-device validation
  (device checklist is a post-merge user pass).
- No new package dependencies.

## Phase 1 — Core mapping (strict TDD)

- **Objective**: `PlaybackPositionMapping` in `Sources/Core/`, behavior rules
  1–10 of the spec.
- **Key work items**: RED/GREEN/REFACTOR through the spec's enumerated tests
  1–14 in `Tests/Core/PlaybackPositionMappingTests.swift`, including the
  Russian Pushkin-shaped sample and markup-shifted offsets; register the new
  source in `FolioTell.xcodeproj/project.pbxproj` (all four sections).
- **Dependencies**: none.
- **Risks**: `.bySentences` enumeration boundaries differing between document
  text and normalized speech text (markup can merge/split sentences); the
  spec's round-trip rule 3 is the guard.
- **Validation**: `swift test` in `foliotell/` (full package suite).
- **Completion signal**: all 14 spec tests plus the pre-existing suite green.

## Phase 2 — App wiring

- **Objective**: spec rules 11–20 — store protocol + UserDefaults
  implementation, sentence-transition writes, stop/completion semantics,
  resume on play, Start Over menu action, progress indicator.
- **Key work items**: `PlaybackPositionStore` +
  `DefaultsPlaybackPositionStore` (new App source, pbxproj-registered);
  `SpeechController` position-change and completion callbacks plus a public
  offset-accepting play entry; `FolioTellApp` passes `fileURL` path;
  `ReaderView` wires store, Start Over, and the compact progress indicator
  inside the existing bottom controls.
- **Dependencies**: Phase 1.
- **Risks**: `onDisappear` currently calls `stop()` — teardown ordering must
  write the anchor before speech state resets; completion-vs-stop
  disambiguation via the existing `didFinish`/pending-stop machinery.
- **Validation**: `swift build` and `swift test` in `foliotell/`; `git diff`
  confirms global `@AppStorage` settings and visual rendering untouched.
- **Completion signal**: build and full suite green; diff scope clean.

## Phase 3 — CI parity and closeout gates

- **Objective**: prove the dual build before docs.
- **Key work items**: run the `xcodebuild archive` wrapper command from
  `.agents/foliotell.md`.
- **Dependencies**: Phases 1–2.
- **Risks**: missing pbxproj registration surfaces here ("cannot find X in
  scope").
- **Validation**: archive exits 0.
- **Completion signal**: wrapper archive green.

## Phase 4 — Docs and closeout

- **Objective**: repo bookkeeping for the change set.
- **Key work items**: add `foliotell/docs/log.md` entry (noting the on-device
  checklist as the pending user pass); remove the "Persist playback position
  and resume" item from `foliotell/backlog/product.md`; move spec to
  `foliotell/docs/specs/implemented/`; move this plan to
  `foliotell/docs/plans/implemented/`; refresh `docs/loc-dashboard.html` from
  `./scripts/loc-dashboard.sh --sort=name`.
- **Dependencies**: Phases 1–3.
- **Risks**: none material.
- **Validation**: markdown front matter/structure check; dashboard matches
  script output.
- **Completion signal**: docs updated and committed.

## Done criteria

- Spec "Done criteria" met except the on-device checklist (explicitly a
  post-merge user pass): interface in `FolioTellCore`, all listed tests pass,
  App wiring rules 11–20 implemented, pbxproj registration complete.
- `swift build` and `swift test` green in `foliotell/`; `xcodebuild archive`
  wrapper green.
- Backlog, log, spec/plan archives, and loc dashboard updated.
- PR opened from `foliotell/persist-position`, auto-merge set
  (`--merge --auto --delete-branch`), CI green.

## Final closeout

```
Final gates: swift build && swift test (in foliotell/) && xcodebuild archive wrapper
Archive plan: move to foliotell/docs/plans/implemented/ (same PR)
Commit archive move: yes
Push/PR: follow push policy — push at closeout, single PR via gh pr create then gh pr merge --merge --auto --delete-branch; watch via ./scripts/watch-pr.sh
```
