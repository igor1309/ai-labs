# Call app processes

Observer: system audio capture, which asks which running processes to tap
for the call app the recorder named, giving what it chose last time.

Call app processes picks, from the processes macOS lists as playing or able
to play audio, the ones that carry the call. Its rules are Amanu's
(`AudioProcesses.swift`, [research](../../research/system-audio.md)).

## Decided

- A call app is named by a bundle-id prefix or by a display name. Prefixes
  are used, not exact ids, because the process that plays a call is rarely
  the one a person would name: Chrome plays it from
  `com.google.Chrome.helper.Renderer`, and Zoom and Teams ship several
  helpers (Amanu).
- A helper whose bundle id has `.helper` in it and whose name is its app's
  name followed by "Helper" counts as the app: "Comet Helper" and
  "Comet Helper (Renderer)" belong to "Comet", and "Cometary" does not
  (Amanu).
- A process with no bundle id is matched by its executable's name (Amanu).
- With none of the app's processes running, the choice is every app except
  Audelin. Amanu takes every app, and Muesli also leaves itself out.
  Recording everything is wrong in a small way; recording nothing loses the
  call (Amanu).
- When the app's processes all leave mid-call, the choice stays as it was
  (Amanu keeps the tap it has), so a call app restarting is not a reason to
  start tapping everything. Once the app's processes come back, or first
  appear after a start without them, they are the choice (Amanu re-points
  its tap whenever the app's processes change).

```gherkin
Feature: Choosing the processes that carry a call

  Scenario: S-1 The call app's own process is chosen
    Given the call app is running
    When I ask which processes to tap
    Then I can tap the call app's process

  Scenario: S-2 The call app's helpers are chosen
    Given the call app plays through helpers of its own
    When I ask which processes to tap
    Then I can tap each of those helpers

  Scenario: S-3 Another app is left out
    Given the call app and another app are running
    When I ask which processes to tap
    Then I cannot tap the other app

  Scenario: S-4 An app with a similar name is left out
    Given an app whose name only starts like the call app's
    When I ask which processes to tap
    Then I cannot tap that app

  Scenario: S-5 A process with no bundle id is found by name
    Given the call app runs as a process with no bundle id
    When I ask which processes to tap
    Then I can tap that process

  Scenario: S-6 With the call app not running, every other app is chosen
    Given no process of the call app is running
    When I first ask which processes to tap
    Then I can tap every app but Audelin

  Scenario: S-7 A helper opened later is chosen
    Given processes were chosen for the call app
    When the call app opens another helper
    Then I can tap that helper as well

  Scenario: S-8 A call app that leaves keeps its choice
    Given processes were chosen for the call app
    When all of them leave
    Then I can keep tapping what was chosen

  Scenario: S-9 A call app that starts after every app was chosen is chosen
    Given every app was chosen because the call app was not running
    When the call app starts
    Then I can tap the call app's processes instead
```

Not call app processes': deciding which app holds the call (call
detection), and tapping (system audio capture).
