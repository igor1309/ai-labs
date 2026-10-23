# Call app processes

Observer: the client that records a call and asks, through an interface it
owns, which processes to hear for the call app it was given.

Call app processes is no adapter: it decides from the processes with audio open,
which it reads through an interface of its own, and remembers what it
decided last. It taps nothing and knows nothing of Core Audio.

## Decided

- A call app is named by a bundle-id prefix or a display name, because the
  process that plays a call is rarely the one a person would name: Chrome
  plays it from `com.google.Chrome.helper.Renderer`, and Zoom and Teams
  ship several helpers (Amanu `AudioProcesses.swift:52-60`).
- A helper counts as its app when its bundle id has `.helper` in it and its
  name is the app's name followed by "Helper": Chromium apps name their
  helpers so ("Comet Helper (Renderer)"), and a bare name prefix would also
  take "Cometary" (Amanu `AudioProcesses.swift:73-90`).
- A process with no bundle id, such as a command-line tool, is matched by
  its executable's name, the only name it has.
- With none of the app's processes running, the answer is every process but
  Audelin's own: mvp.md's first rule is not to lose the call, and other
  apps' sound only adds noise to the «они» track.
- When the app's processes all leave, the answer stays as it was: a call
  app restarting is not a reason to hear every app. Once its processes are
  back, or first appear, they are the answer.

```gherkin
Feature: Which processes carry the call

  Scenario: S-1 The call app's own process is chosen
    Given the call app is running
    When I ask which processes to hear
    Then I know to hear the call app's process

  Scenario: S-2 The call app's helpers are chosen
    Given the call app plays through helpers of its own
    When I ask which processes to hear
    Then I know to hear each of those helpers

  Scenario: S-3 Another app is left out
    Given the call app and another app are running
    When I ask which processes to hear
    Then I know not to hear the other app

  Scenario: S-4 An app with a similar name is left out
    Given an app whose name only starts like the call app's
    When I ask which processes to hear
    Then I know not to hear that app

  Scenario: S-5 A process with no bundle id is found by name
    Given the call app runs as a process with no bundle id
    When I ask which processes to hear
    Then I know to hear that process

  Scenario: S-6 With the call app not running, all but Audelin is chosen
    Given no process of the call app is running
    When I first ask which processes to hear
    Then I know to hear every process but Audelin's

  Scenario: S-7 A helper opened later is chosen
    Given I was told which processes to hear, and the call app opened a helper
    When I ask again
    Then I know to hear that helper as well

  Scenario: S-8 A call app that leaves keeps its answer
    Given I was told which processes to hear, and all of them left
    When I ask again
    Then I know to hear what I was told before

  Scenario: S-9 A call app that starts after is chosen
    Given I was told to hear all but Audelin, and the call app started
    When I ask again
    Then I know to hear the call app's processes instead
```

Not call app processes': which app holds the call and listing the
processes (Core Audio processes), when to ask again (the client), and
hearing them (system audio capture).
