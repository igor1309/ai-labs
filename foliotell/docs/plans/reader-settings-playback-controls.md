---
date: 2026-07-09
model: gpt-5
description: "Implementation plan for separating FolioTell reader settings from compact playback controls."
---

# Reader Settings and Playback Controls

## Goal

Move infrequent reader configuration out of the compact playback menu while
preserving every existing playback and voice-selection behavior.

## Execution mode

Execution mode: auto-continue

Human review between tasks: no

Push policy: no push

## Execution lock

Worktree mode: none

Expected worktree: /Users/igormalyarov/Developer/my-apps/ai-labs/ai-labs

Expected branch: claude/foliotell-russian-voices-wlneu4

Preflight check: [x] `git worktree list --porcelain` and `git branch --show-current` verified this worktree and branch on 2026-07-09.

## Scope guardrails

- Add a top-trailing gear that opens a dedicated reader settings page.
- Move the Front Matter Read/Skip control to that page.
- Add a leading bottom-bar Voice menu for Auto and installed Apple voices.
- Limit the trailing bottom-bar playback menu to Speed and Start Over.
- Preserve the current `AppStorage` keys, voice filtering, Auto selection,
  playback transport, audio-session behavior, and document rendering.
- Exclude neural runtime/model integration, model downloads, storage management,
  privacy/marketing changes, release tagging, push, and deployment.

## Task 1 — Implement and prove the reader-control split

### Step 1 — Define observable UI contracts

- Add stable accessibility identifiers for the gear, settings page, Front
  Matter controls, Voice menu, and compact playback menu.
- Extend the app and Maestro tests first to assert the following observable
  contract:
  - the gear is visible after a document opens;
  - the gear opens the settings page, which exposes Read and Skip;
  - the Voice menu exposes Auto and the installed voice list;
  - the compact playback menu exposes Speed and Start Over, and neither Voice
    nor Front Matter;
  - Play, Pause, Resume, speed change, and Stop retain their current labels and
    sequence.
- Run the changed test first. Its missing-UI assertion must fail while the
  current menu still owns Voice and Front Matter.

### Step 2 — Make the smallest UI change that satisfies the contracts

- Extract the Voice and compact playback menus from the current combined menu.
- Add the settings page and route Front Matter selections through the existing
  `frontMatterModeSelected` event.
- Add the gear and place the Voice and compact playback menus at their required
  toolbar positions.
- Keep all changes in the existing Swift sources unless a new source file is
  necessary; if one is added, register it in both `Package.swift` and
  `FolioTell.xcodeproj/project.pbxproj` as required by FolioTell's dual-build
  rules.

### Step 3 — Verify behavior and scope

- Run `swift test` and `swift build` with `foliotell/` as the working
  directory; each must exit 0.
- Run the following FolioTell CI-parity archive command with `foliotell/` as
  the working directory; it must exit 0 and create the archive:

  ```bash
  xcodebuild archive \
    -project FolioTell.xcodeproj \
    -scheme FolioTell \
    -configuration Release \
    -destination "generic/platform=iOS" \
    -archivePath /tmp/FolioTell.xcarchive \
    CODE_SIGNING_ALLOWED=NO \
    DEVELOPMENT_TEAM=VRVJ9YNRQU \
    PRODUCT_BUNDLE_IDENTIFIER=foliotell.FolioTell
  ```

- Run `maestro test .maestro/flows/playback-controls.yaml` three times with
  `foliotell/` as the working directory, using the documented iOS 26.3
  simulator and Pushkin fixture; all three runs must finish with zero failed
  assertions.
- Inspect the final diff and confirm it contains no neural model/runtime,
  download/storage, privacy/marketing, release, push, or deployment change.
- Commit the implementation only after all listed checks pass.

## Done criteria

1. Opening a document shows a top-trailing gear, a leading Voice menu, and a
   trailing compact playback menu, proven by the updated Maestro identifiers.
2. The settings page contains Front Matter Read and Skip; the compact playback
   menu does not, proven by Maestro visibility assertions.
3. The Voice menu contains Auto and the filtered installed-voice list, proven
   by Maestro assertions and focused app tests.
4. The compact playback menu contains only Speed and Start Over, proven by
   Maestro assertions for the intended controls and absence checks for moved
   controls.
5. Play, Pause, Resume, 1.5x speed change, and Stop complete in order in three
   consecutive Maestro runs.
6. `swift test`, `swift build`, and the unsigned iOS archive each exit 0.
7. The final implementation diff contains no excluded neural, network,
   privacy/marketing, release, push, or deployment work.

## Final closeout

After the proof is reported, stop for the user's Step 5 go. Do not push,
create a pull request, deploy, or upload a build. When the user approves final
closeout, move this plan to `foliotell/docs/plans/implemented/` and commit that
archive move separately.
