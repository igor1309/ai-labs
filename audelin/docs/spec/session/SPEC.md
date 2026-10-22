# Session

Observer: the client that starts and stops one recording of a call, through
an interface it owns: the control adapter for the user's hand, and
automatic recording for a call that starts and ends by itself.

A Session is a Core. It reads the call's two tracks and writes them through
interfaces of its own (open on the diagram: "Parts to start"). It knows no
device, file or model, and no text: reading the call is call text's.

## Decided

- Recording comes first: a track is written as it comes, and what reads
  the call reads the written audio, so live text failing or lagging never
  costs the call (mvp.md rule 1; user spec S-9).
- The mic is my track and the call audio is theirs (mvp.md rule 2).
- One recording at a time: a start while one runs is refused, and the
  running one goes on. Two at once would write one call twice; the live
  text preview's double start showed both into one transcript (5ce16fc6).
- A track that fails, or cannot start, ends only itself: the other goes on
  recording, and the client can tell which is missing, because half a call
  beats none (mvp.md rule 1). A start with neither track fails.
- Whether a call's end stops the recording is not the Session's: it stops
  when its client tells it to (automatic recording).

```gherkin
Feature: One recording of a call

  Scenario: S-1 Starting records both sides
    Given nothing is being recorded
    When I start a recording
    Then I can tell both sides are being recorded

  Scenario: S-2 A second start leaves the first recording
    Given a recording is running
    When I start another
    Then I can tell it was refused, and the first is still recording

  Scenario: S-3 Stopping keeps the call
    Given a recording is running
    When I stop it
    Then I can read all of the call's audio

  Scenario: S-4 A recording can follow a stopped one
    Given I stopped a recording
    When I start another
    Then I can tell both sides are being recorded

  Scenario: S-5 My audio can be read as soon as it is written
    Given a recording is running
    When the mic track delivers audio
    Then I can read that audio while the call goes on

  Scenario: S-6 A failing call track keeps mine
    Given a recording is running
    When the call track fails
    Then I can tell the call track is missing, and mine is recorded

  Scenario: S-7 A failing mic track keeps theirs
    Given a recording is running
    When the mic track fails
    Then I can tell my track is missing, and theirs is recorded

  Scenario: S-8 A call track that cannot start leaves mine
    Given the call track cannot start
    When I start a recording
    Then I can tell the call track is missing, and mine is recorded

  Scenario: S-9 A mic track that cannot start leaves theirs
    Given the mic track cannot start
    When I start a recording
    Then I can tell my track is missing, and theirs is recorded

  Scenario: S-10 A recording with no track fails
    Given neither track can start
    When I start a recording
    Then I can tell it failed

  Scenario: S-11 Their audio can be read as soon as it is written
    Given a recording is running
    When the call track delivers audio
    Then I can read that audio while the call goes on
```

Not Session's: reading the call's text (call
text), when a call starts or ends and whether that starts or stops a
recording (automatic recording), which processes to hear (call app
processes), call time (timed track), files, folder and title (transcript
writer), models on disk (setup), and not recording while calls move
(storage).
