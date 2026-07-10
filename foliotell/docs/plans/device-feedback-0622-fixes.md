---
date: 2026-07-10
model: gpt-5
description: "Implementation plan: repair the stop, control-icon, voice-label, and per-document voice-selection regressions reported from FolioTell 0.6.2."
---

# FolioTell 0.6.2 Device-Feedback Fixes

## Goal

Repair the device-observed playback and voice-selection regressions in the
0.6.2 release. Stop must reset position, controls must communicate one action,
and voice choice must follow each document's language.

## Execution mode

Mode: auto-continue

Human review between tasks: no

Stop conditions: failed gates, unclear scope, unavailable release tooling,
destructive operations, explicit user interruption

Push policy: push at closeout

## Execution lock

Worktree mode: create new

Expected worktree: /Users/igormalyarov/Developer/my-apps/ai-labs/ai-labs.worktrees/codex-foliotell-playback-0622-fixes

Expected branch: codex/foliotell-playback-0622-fixes

Preflight check: [x] `git worktree list --porcelain` and `git branch --show-current` verified this worktree and branch on 2026-07-10.

## Scope guardrails

- Change only Stop position semantics, the primary-control icon, voice labels,
  and document-language voice resolution.
- Preserve the single main-actor playback coordinator introduced in 0.6.2.
- Exclude new reader controls, background/remote playback, voice-download UI,
  and broad language-detection work beyond the reported English/Russian flow.

## Phase 1 — Reproduce the released behavior

**Objective:** add composed tests that express each device report.

**Key work items:**

- Assert Stop clears the persisted anchor and a following Play speaks from zero.
- Assert Resume uses a play-only icon.
- Assert enhanced voice titles do not repeat language or quality metadata.
- Assert a Russian stored voice falls back to the document-appropriate English
  auto voice for English text.

**Dependencies:** none.

**Risks:** tests could assert an implementation detail rather than user-visible
behavior.

**Validation:** each test compiles and fails on the 0.6.2 release code.

**Completion signal:** four distinct behavioral assertions fail without
production changes.

## Phase 2 — Repair ownership and presentation

**Objective:** make the coordinator, state projection, and voice resolver meet
the reported behavior.

**Key work items:**

- Clear persisted position inside the coordinator's Stop transition.
- Map paused Resume to `play.fill`.
- Display concise voice names.
- Classify non-Cyrillic document text as English for the current English/Russian
  product scope, allowing a stored Russian manual voice to fall back to English
  auto selection.

**Dependencies:** Phase 1 RED tests.

**Risks:** a stale callback may rewrite state after Stop; existing token tests
must remain green.

**Validation:** targeted tests turn green, then full Swift tests and the
unsigned iOS archive pass.

**Completion signal:** all four composed regressions pass with no new queue,
relay, or duplicate source of playback state.

## Phase 3 — Release candidate

**Objective:** put the repair on TestFlight for device acceptance.

**Key work items:**

- Update release metadata, notes, logs, and generated manifest.
- Merge the frozen candidate to `trunk`, tag it, and verify the TestFlight
  upload workflow.

**Dependencies:** Phase 2 gates pass.

**Risks:** release gates can fail for unrelated root-suite or CI issues.

**Validation:** release-unit `verify`, `test-foliotell`,
`deploy-foliotell-testflight`, and `github-release` all succeed.

**Completion signal:** App Store Connect accepts the release candidate and it
is ready for the user's device test.

## Done criteria

1. Stop clears the document anchor and the next Play begins at the first
   sentence.
2. Resume is labeled "Resume" and rendered with `play.fill` only.
3. An enhanced voice displays its concise name once, without repeated language
   or quality text.
4. A pure English document resolves an English voice instead of retaining a
   Russian selection from a preceding document.
5. Targeted and full Swift tests plus the unsigned iOS archive pass.
6. The release candidate uploads to TestFlight successfully.

## Verification evidence

1. PASS — `test_stopTapped_shouldClearSavedAnchorBeforeRestartingPlayback`
   proves Stop clears the persisted document anchor, and
   `test_primaryTapped_shouldSpeakFromDocumentStart_afterStop` proves the next
   utterance starts at offset zero.
2. PASS — `test_playbackStateControls_shouldExposePrimaryAction_onPlaybackState`
   expects `play.fill` for the paused/Resume state.
3. PASS — `test_menuTitle_shouldUseVoiceNameWithoutRepeatingLanguageOrQuality`
   expects the concise AV voice name only.
4. PASS —
   `test_voiceSelection_shouldResolveEnglishAutoVoice_onEnglishDocumentAfterRussianSelection`
   proves the Russian stored selection resolves to the English Auto voice for
   English text.
5. PASS — `swift test` passed 196 tests and the unsigned iOS archive completed
   with `ARCHIVE SUCCEEDED` on 2026-07-10.
6. PENDING — release candidate metadata, tag, and TestFlight workflow.

## Final closeout

Final gates: targeted regression tests, `swift build`, `swift test`, unsigned
iOS archive, release-unit workflow, and TestFlight upload confirmation.

Archive plan: move to `foliotell/docs/plans/implemented/`.

Commit archive move: yes.

Push/PR: follow push-at-closeout policy.
