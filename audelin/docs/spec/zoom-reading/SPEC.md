# ZoomAccessibility — who speaks on Zoom's side

Observer: the Zoom observer, which polls a reading of Zoom's windows and
reports each change of the far-side speaker to CallNames.
Oracle: `../zoom-gallery-names/SPEC.md`.

## Decided

- **What Zoom 7.2 shows.** Speaker view shows a `Talking: <name>` label;
  Gallery view shows none, at any call size. Every view shows a tile per
  participant, described as `<name>, <audio>, <video>`, where audio is
  `Computer audio muted`, `Computer audio unmuted` or `No audio connected`.
  The account button of Zoom's Workplace window, `Zoom, <name>, In a Zoom
  Meeting, ...`, names the user, when that window is open.
- **The far-side speaker, in order:** the Talking label; else the only tile
  other than the user's; else the only other tile that is unmuted; else
  nobody.
- **The user's name decides which tile is theirs.** The name read from the
  account button wins over the remembered one. With neither, only the
  Talking label names anyone.
- **The Talking label never names the user.**
- **No meeting window, no speaker.** Tiles and labels outside Zoom's meeting
  windows are not read.

```gherkin
Feature: Who speaks on Zoom's side

  Scenario: S-1 Talking label
    Given Zoom shows "Talking: Anna" and tiles for Anna, Boris and me
    When a reading is taken
    Then I can read Anna as the speaker

  Scenario: S-2 One other participant
    Given Zoom shows tiles for me and Anna, and no Talking label
    And my name is known
    When a reading is taken
    Then I can read Anna as the speaker

  Scenario: S-3 One unmuted other participant
    Given tiles for me, Anna unmuted, and Boris muted, and no Talking label
    And my name is known
    When a reading is taken
    Then I can read Anna as the speaker

  Scenario: S-4 Several unmuted
    Given tiles for me, Anna unmuted, and Boris unmuted, and no Talking label
    When a reading is taken
    Then I can read nobody as the speaker

  Scenario: S-5 My name unknown
    Given tiles for me and Anna, no Talking label, and no known name of mine
    When a reading is taken
    Then I can read nobody as the speaker

  Scenario: S-6 My name shown by Zoom
    Given the account button shows my name
    When a reading is taken
    Then I can read my name from it
    And the speaker is decided with that name over a remembered one

  Scenario: S-7 Talking label naming me
    Given Zoom shows "Talking: <my name>"
    When a reading is taken
    Then I can read nobody as the speaker

  Scenario: S-8 No meeting window
    Given Zoom shows no meeting window
    When a reading is taken
    Then I can read that no meeting is observed, and nobody as the speaker
