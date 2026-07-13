---
date: 2026-07-13
description: "Implementation plan: FolioTell Android Stage 1 — :core document/speed/chunking/playback logic (TDD) and the Compose/TTS reader app"
---

# Implementation Plan — FolioTell Android Stage 1 (The App)

Implements the [Android technical spec v0.0.1](../specs/foliotell-android-technical-spec.md)
(Stage 1 of the [Android roadmap](../../../docs/foliotell-android-roadmap.md)),
under the ADR-003 invariants.

## Goal

Deliver the Stage 1 app: pure-JVM `:core` logic (speed presets, document
loading/validation, utterance chunking, playback state machine) built
test-first, and the `:app` Compose reader (SAF open flow, transport controls,
platform `TextToSpeech`) wired to that core.

## Execution mode

```
Mode: auto-continue
Human review between tasks: no
Stop conditions: failed gates, unclear scope, missing credentials/tooling, destructive operations, explicit user interruption
Push policy: push at closeout
```

## Execution lock

```
Worktree mode: none
Expected worktree: /home/user/ai-labs (remote session root checkout)
Expected branch: claude/handoff-continuation-d129sp
Preflight check: [x] done — worktree=/home/user/ai-labs, branch=claude/handoff-continuation-d129sp, separate_worktree=pass (mode none)
```

Same-session plan: authored and executed in one remote session on the
designated branch, so the lock is concrete. The remote sandbox cannot build
`:app` locally (Google Maven unreachable — see `.agents/foliotell.md`);
`:core` gates run locally via the system Gradle, `:app:assembleDebug` gates
in `foliotell-android-core.yml` on the pushed branch.

## Scope guardrails

- Stage 1 scope only. Deferred per the roadmap: playback positions,
  word/sentence highlighting, front-matter handling, voice picker,
  background/lock-screen playback, external VIEW/SEND intent filters.
- No code shared with iOS; everything lands under `foliotell/android/`
  (ADR-003).
- No root Gradle build script (ADR-003 / `.agents/foliotell.md`).
- No new Gradle dependencies beyond the existing catalog entries; `:core`
  stays pure JVM (kotlin-test only).
- No release/distribution work (Stage 2/3): no signing, no Play config, no
  release-unit registration.
- Emulator/physical-device acceptance cannot run in this environment; it is
  the roadmap's remaining Stage 1 gate and stays with the user after merge.
  This plan's done criteria stop at green CI plus documented build commands.

## ADR traceability matrix

| ADR-003 invariant | Where this plan holds it |
|---|---|
| MUST NOT share code with iOS | All phases touch only `foliotell/android/**` (+ family docs) |
| MUST NOT add a root Gradle build script | No phase touches `settings.gradle.kts` module layout or adds root scripts |
| `:core` pure JVM / `:app` Compose+TTS split | Phases 1–4 land logic in `:core`; phase 5 keeps engine/UI code in `:app` |

## Phase 1 — `:core` SpeedPreset

- **Objective**: the five-preset speed mapping with persistence-safe restore.
- **Key work items**: strict TDD over the spec's `SpeedPreset` test list;
  replace the scaffold's `FolioTellCore` seed object/test when the first real
  type lands.
- **Dependencies**: none.
- **Risks**: none material.
- **Validation**: `gradle :core:test -PskipAndroidApp=true` green.
- **Completion signal**: all seven `SpeedPreset` spec tests green; commit.

## Phase 2 — `:core` DocumentLoader

- **Objective**: strict-UTF-8 document validation with `EMPTY` /
  `INVALID_ENCODING` failures and name fallback.
- **Key work items**: strict TDD over the spec's `DocumentLoader` test list
  (strict decode, BOM strip, NUL rejection, blank handling).
- **Dependencies**: none (parallel-safe after phase 1 commit).
- **Risks**: charset-decoder edge cases (BOM, truncated multibyte) — covered
  by the enumerated tests.
- **Validation**: `gradle :core:test -PskipAndroidApp=true` green.
- **Completion signal**: all nine `DocumentLoader` spec tests green; commit.

## Phase 3 — `:core` UtteranceChunker

- **Objective**: deterministic paragraph→sentence→whitespace→hard chunking
  within the engine's utterance limit.
- **Key work items**: strict TDD over the spec's `UtteranceChunker` test
  list, including the content-preservation and limit properties.
- **Dependencies**: none.
- **Risks**: boundary off-by-ones at the limit — the oversized-sentence and
  unbroken-run tests pin them.
- **Validation**: `gradle :core:test -PskipAndroidApp=true` green.
- **Completion signal**: all ten `UtteranceChunker` spec tests green; commit.

## Phase 4 — `:core` ReaderPlayback

- **Objective**: the playback state machine exactly as the spec's
  state × event matrix defines it.
- **Key work items**: strict TDD over the spec's `ReaderPlayback` seed list —
  the mechanical projection of the matrix (paired state/effect tests per
  covered cell, stale-callback and repeated-event guards).
- **Dependencies**: none (types are independent of phases 1–3).
- **Risks**: divergence between matrix and reducer — prevented by writing
  tests cell-by-cell from the matrix, not from the implementation.
- **Validation**: `gradle :core:test -PskipAndroidApp=true` green.
- **Completion signal**: all twenty-nine `ReaderPlayback` spec tests green;
  commit.

## Phase 5 — `:app` reader

- **Objective**: the Compose open-screen/reader flow wired to `:core` and the
  platform `TextToSpeech` engine per the spec's app behavior rules.
- **Key work items**: SAF `ACTION_OPEN_DOCUMENT` launcher + content
  resolution (bytes, display name, read-failure mapping); open screen with
  per-error messages; reader screen (filename, Play/Pause/Resume/Stop, five
  presets); a `TextToSpeech` effect handler executing `Speak`/`StopSpeech`
  and feeding `ChunkDone`/`SpeechError` back through the reducer;
  `SharedPreferences` speed persistence; back-navigation stop.
- **Dependencies**: phases 1–4 (uses every `:core` type).
- **Risks**: `:app` is not buildable in this sandbox — compile errors surface
  only in CI; keep the module small and let `foliotell-android-core.yml`
  gate it on the pushed branch. TTS engine variance (per-OEM) is a known
  Stage 1 risk owned by the device-acceptance gate, not this plan.
- **Validation**: `gradle :core:test -PskipAndroidApp=true` still green
  locally; `:app:assembleDebug` green in CI after push.
- **Completion signal**: reader flow implemented per spec; commit; CI green
  on the pushed branch.

## Phase 6 — Docs and closeout

- **Objective**: the change set is discoverable and the family docs stay
  current.
- **Key work items**: debug-APK build commands in `.agents/foliotell.md`
  (clean-checkout instructions per the roadmap done criteria);
  `foliotell/docs/log.md` entry (outcome + pointer); README Components row
  wording ("scaffolded" → app exists); refresh `docs/loc-dashboard.html`
  from `./scripts/loc-dashboard.sh --sort=name`; archive this plan.
- **Dependencies**: phases 1–5.
- **Risks**: none material.
- **Validation**: docs-only checks (front matter, links, diff scope);
  dashboard matches script output.
- **Completion signal**: pre-push gate passes end to end.

## Done criteria

- Every `:core` test enumerated in the spec exists and
  `gradle :core:test -PskipAndroidApp=true` is green locally.
- `foliotell-android-core.yml` (`:core:test` + `:app:assembleDebug`) is green
  on the pushed branch.
- The spec's app behavior rules are implemented in `:app`.
- Debug-APK build commands are documented for a clean checkout.
- Family log, README row, and LOC dashboard updated; plan archived.
- Out of scope by declaration: emulator/device manual acceptance (user gate
  after merge — see Scope guardrails).

## Final closeout

```
Final gates: gradle :core:test -PskipAndroidApp=true; docs-only checks for changed docs; git status clean; loc-dashboard refreshed
Archive plan: move to foliotell/android/docs/plans/implemented/
Commit archive move: yes
Push/PR: push at closeout to claude/handoff-continuation-d129sp; PR opening stays with the user
```
