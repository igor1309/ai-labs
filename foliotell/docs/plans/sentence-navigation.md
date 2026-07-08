---
date: 2026-07-08
model: claude-fable-5
description: "Implementation plan: sentence navigation — back/forward buttons active in every playback state"
---

# Implementation Plan — FolioTell Sentence Navigation

Implements [`../specs/sentence-navigation.md`](../specs/sentence-navigation.md)
(intake: [`../intake/sentence-navigation-intake.md`](../intake/sentence-navigation-intake.md)),
closing the "Add compact progress navigation controls" backlog item.

## Goal

Back/forward buttons in the reader's bottom controls that move the listening
position by one sentence per tap in every playback state — restarting speech
when speaking, silently repositioning when paused or idle.

## Execution mode

```
Mode: auto-continue
Human review between tasks: no
Stop conditions: failed gates, unclear scope, missing credentials/tooling, destructive operations, explicit user interruption
Push policy: no push
```

## Execution lock

```
Worktree mode: reuse existing
Expected worktree: /Users/igormalyarov/Developer/my-apps/ai-labs/ai-labs.worktrees/foliotell-backlog
Expected branch: foliotell/live-progress
Preflight check: [x] done — on foliotell/live-progress in this worktree, clean tree at execution start (same session)
```

## Scope guardrails

Out of scope (spec non-goals and separate backlog items):

- Paragraph-unit jumps, long-press/repeat acceleration, time-based skips.
- Scrubbable progress; lock-screen/remote transport commands.
- Maestro flows and real-device validation (device checklist is the user
  pass).
- No new files, no new dependencies, no pbxproj changes.
- **No push** — local commits only; the user pushes/PRs when ready.

## Phase 1 — Core sentence queries and reposition (strict TDD)

- **Objective**: spec rules 1–4 — `previousSentenceStartUTF16Offset` /
  `nextSentenceStartUTF16Offset` on `PlaybackPositionMapping`, and
  `reposition(toUTF16Offset:)` on `PlaybackStateMachine`.
- **Key work items**: RED/GREEN through spec tests 1–6
  (`PlaybackPositionMappingTests`) and 7–9 (`PlaybackStateMachineTests`).
- **Dependencies**: none.
- **Risks**: `.bySentences` gap handling between sentences (rule 1's
  containing-sentence convention).
- **Validation**: `swift test` in `foliotell/` (full suite).
- **Completion signal**: all 9 spec tests plus the pre-existing suite green.

## Phase 2 — Controller and reader wiring

- **Objective**: spec rules 5–11.
- **Key work items**: `SpeechController.jumpToPreviousSentence()` /
  `jumpToNextSentence()` (speaking restart; paused silent reposition with
  utterance discard + position-change callback); resume fallback to
  restart-from-offset when `continueSpeaking()` has nothing to continue;
  `ReaderView` back/forward buttons (back · play/pause · forward · stop) and
  the idle jump path over store + mapping.
- **Dependencies**: Phase 1.
- **Risks**: paused-jump silence (discarded utterance must not emit audio or
  corrupt callback state — reuse `ignoredUtteranceIDs`); bottom-bar layout
  fit at compact widths.
- **Validation**: `swift build` and `swift test` in `foliotell/`; `git diff`
  confirms controls stay in the bottom container and global settings are
  untouched.
- **Completion signal**: build and full suite green; diff scope clean.

## Phase 3 — CI parity and docs closeout

- **Objective**: prove the dual build; repo bookkeeping.
- **Key work items**: `xcodebuild archive` wrapper from
  `.agents/foliotell.md`; `foliotell/docs/log.md` entry (device checklist as
  the pending user pass); remove the "Add compact progress navigation
  controls" backlog item; move spec and this plan to their `implemented/`
  directories; refresh `docs/loc-dashboard.html` from
  `./scripts/loc-dashboard.sh --sort=name`.
- **Dependencies**: Phases 1–2.
- **Risks**: none material.
- **Validation**: archive exits 0; markdown structure check; dashboard
  matches script output.
- **Completion signal**: docs updated and committed locally.

## Done criteria

- Spec "Done criteria" met except the on-device checklist (explicit user
  pass): Core interfaces exist, all 9 listed tests pass, App wiring rules
  5–11 implemented.
- `swift build` and `swift test` green in `foliotell/`; `xcodebuild archive`
  wrapper green.
- Backlog, log, spec/plan archives, and loc dashboard updated.
- Everything committed locally on `foliotell/live-progress`; **nothing
  pushed**.

## Final closeout

```
Final gates: swift build && swift test (in foliotell/) && xcodebuild archive wrapper
Archive plan: move to foliotell/docs/plans/implemented/ (same change set)
Commit archive move: yes
Push/PR: follow push policy — no push; report and hand the branch to the user
```
