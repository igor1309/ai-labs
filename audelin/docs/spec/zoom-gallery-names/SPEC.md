# Name the far side of a Zoom call in any view

Observer: the user, recording a Zoom call and reading its panel, transcript
and notes.

## Decided

- Zoom marks the speaker with a `Talking: <name>` label only in Speaker view.
  In Gallery view it marks nobody, at any call size. What every view shows is
  each participant's tile: name, and whether their audio is muted, unmuted or
  not connected.
- In a call with exactly one other participant, all far-side speech is that
  participant's, so the far side carries their name in every view, from the
  moment Zoom shows their tile.
- In a larger call where Zoom marks no speaker, far-side speech heard while
  exactly one other participant is unmuted is shown under that participant's
  name, as tentative. Speech heard while several are unmuted, or none, keeps
  "Them".
- A `Talking:` label, where Zoom shows one, decides over the unmuted rule.
- Names from the tiles are confirmed after the call as other live names are
  now; the after-call pass can still change or drop them.
- Audelin names only the far side. It never names a far-side row after the
  user.
- A speaker found from Zoom's green tile border in a screen capture is out of
  scope: it would need the Screen Recording permission.

## Open

- How Audelin tells the user's own tile from the others. Zoom names the user
  only sometimes (the Workplace window's account button, seen in a minority
  of calls). Suggested: remember the user's Zoom name whenever Zoom shows it
  and use the remembered name in later calls; until a name is known, the
  one-other-participant rule applies only when one of two tiles is that
  name, and otherwise the far side keeps "Them".

```gherkin
Feature: Name the far side of a Zoom call in any view

  Scenario: S-1 One other participant in Gallery view
    Given I am in a Zoom call with one other participant
    And Zoom shows the call in Gallery view
    When the other participant speaks
    Then the panel shows their name for the far side
    And the transcript and notes use their name

  Scenario: S-2 One other participant who joins late
    Given I am alone in a Zoom call and recording
    When another participant joins and speaks
    Then the far side carries their name from when their tile appears

  Scenario: S-3 One unmuted participant in a larger call
    Given a Zoom call in Gallery view with three or more participants
    And exactly one other participant is unmuted
    When the far side speaks
    Then the panel shows that participant's name as tentative

  Scenario: S-4 Several unmuted participants
    Given a Zoom call in Gallery view with three or more participants
    And two or more other participants are unmuted
    When the far side speaks
    Then that speech keeps "Them"

  Scenario: S-5 Speaker view still wins
    Given Zoom shows "Talking: Anna" while Boris is the only unmuted other participant
    When the far side speaks
    Then the panel shows "Anna"

  Scenario: S-6 Own tile unknown
    Given Zoom has never shown which tile is mine
    And the call has two tiles
    When the far side speaks
    Then the far side keeps "Them"

  Scenario: S-7 Confirmed after the call
    Given a far-side name came from the tiles during the call
    When the call ends and its after-call pass runs
    Then the transcript shows the names the pass confirms
```
