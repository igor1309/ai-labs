# Core Audio processes

Observer: the client that wants, through interfaces it owns, the processes
with audio open and a stream of calls starting and ending. An adapter over
Core Audio's process objects.

## Decided

- One wrapper, not a list adapter and a call watcher apart: both read the
  same Core Audio objects (owner, 2026-10-22).
- Calls come as events, never from re-reading the list: Core Audio tells a
  process appearing or leaving, and a process's `IsRunning` or device list
  fired each time Voice Memos, a browser tab and Amanu started or stopped
  using the microphone ([measured](../../research/system-audio.md#measured-on-this-mac)).
  The recording flag, never told by itself, is re-read when they fire.
- A call is a call app on the owner's list using the microphone: Zoom
  (`us.zoom.xos`), Telemost (`ru.yandex.desktop.telemost`) and the browser
  families where calls in a tab run, by Amanu's bundle ids
  (`MicActivityMonitor.swift:66-85`). Any app on the microphone would make
  dictation, Siri and Voice Memos calls. A bundle-id prefix takes the
  app's helpers, and an app is on the microphone while any of its
  processes is.
- A call ends once no call app has used the microphone for 30 s (the
  owner's number), on a clock it is given, so a mute or a device switch
  does not end it. A second call app joins a running call, which keeps
  its first app.
- The list is every process Core Audio knows, with its bundle id, name
  (its executable's without one) and Audelin's own marked.

```gherkin
Feature: Processes with audio and the calls among them

  Scenario: S-1 A process with audio open is listed
    Given a process has audio open
    When I ask for the processes with audio open
    Then I can find it with its bundle id and name

  Scenario: S-2 A process with no bundle id is listed by name
    Given a process with no bundle id has audio open
    When I ask for the processes with audio open
    Then I can find it by its executable's name

  Scenario: S-3 Audelin is marked as itself
    Given Audelin has audio open
    When I ask for the processes with audio open
    Then I can tell which one is Audelin

  Scenario: S-4 Zoom on the microphone starts a call
    Given no call is on
    When Zoom starts using the microphone
    Then I can tell a call started in Zoom

  Scenario: S-5 Another app on the microphone is not a call
    Given no call is on
    When an app not listed as a call app starts using the microphone
    Then I can tell no call is on

  Scenario: S-6 A call ends 30 s after the microphone
    Given a call is on in Zoom
    When Zoom has not used the microphone for 30 s
    Then I can tell the call ended

  Scenario: S-7 A short silence does not end the call
    Given a call is on in Zoom
    When Zoom stops using the microphone and starts again within 30 s
    Then I can tell the same call is still on

  Scenario: S-8 A second call app joins the call
    Given a call is on in Zoom
    When a browser starts using the microphone, and Zoom stops for 30 s
    Then I can tell the one call in Zoom is still on

  Scenario: S-9 An app is on the microphone while any of its processes is
    Given a call is on in Chrome, and two Chrome processes use the microphone
    When one of them stops for 30 s and the other goes on
    Then I can tell the call is still on

  Scenario: S-10 A list the system refuses fails
    Given the system refuses the process list
    When I ask for the processes with audio open
    Then I can tell it failed

  Scenario: S-11 Telemost on the microphone starts a call
    Given no call is on
    When Telemost starts using the microphone
    Then I can tell a call started in Telemost

  Scenario: S-12 A browser on the microphone starts a call
    Given no call is on
    When a browser's helper starts using the microphone
    Then I can tell a call started in that browser

  Scenario: S-13 A call ends 30 s after the last call app leaves
    Given a call is on, and Zoom and a browser use the microphone
    When Zoom stops, and later the browser stops for 30 s
    Then I can tell the call ended
```

Not this wrapper's: which processes carry the call (call app processes),
hearing them (system audio capture), and what a call start or end does.
