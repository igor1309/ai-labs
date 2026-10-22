# Core Audio processes

Observer: the client that wants, through interfaces it owns, the processes
with audio open, and a stream of calls starting and ending. An adapter: it
wraps Core Audio's process objects and speaks only in those two answers.

## Decided

- One wrapper, not a list adapter and a call watcher apart: both read the
  same Core Audio objects, and the second only translated the first into
  our words (owner, 2026-10-22).
- Calls come as a stream of events, never from re-reading the list. Core
  Audio tells when a process appears or leaves, and a process's
  `IsRunning` and device list fire as Voice Memos, a browser tab and Amanu
  start and stop using the microphone; the recording flag is re-read when
  either fires, as its own change is never told ([measured on this
  Mac](../../research/system-audio.md#measured-on-this-mac)). The one
  untold stop was Siri's listener, which is no call app.
- A call is a listed call app using the microphone: Zoom (`us.zoom.xos`),
  Telemost (`ru.yandex.desktop.telemost`), and the browser families where
  Meet and calls in a tab run. Any app on the microphone would make
  dictation, Siri and Voice Memos calls. The browser bundle ids are Amanu's
  (`MicActivityMonitor.swift:66-85`), a platform fact. An app is matched by
  bundle-id prefix, so its helpers count, and is on the microphone while
  any of its processes is.
- A call ends once no call app has used the microphone for 30 s (the
  owner's number), so a mute or a device switch does not end it; the
  30 s are counted on a clock it is given.
- A second call app on the microphone during a call joins it: the call
  keeps the app it started in, and ends once neither has used it for 30 s.
- The list is every process Core Audio knows, with its bundle id, its name
  (its executable's when it has no bundle id), and Audelin's own marked.
  A helper is often silent when asked and plays a moment later.

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

  Scenario: S-4 A call app on the microphone starts a call
    Given no call is on
    When Zoom, Telemost or a browser starts using the microphone
    Then I am told a call started in that app

  Scenario: S-5 Another app on the microphone is not a call
    Given no call is on
    When an app not listed as a call app starts using the microphone
    Then I am told nothing

  Scenario: S-6 A call ends 30 s after the microphone
    Given a call is on in Zoom
    When Zoom has not used the microphone for 30 s
    Then I am told the call ended

  Scenario: S-7 A short silence does not end the call
    Given a call is on in Zoom
    When Zoom stops using the microphone and starts again within 30 s
    Then I am told nothing

  Scenario: S-8 A second call app joins the call
    Given a call is on in Zoom
    When a browser starts using the microphone, and Zoom stops for 30 s
    Then I am told nothing until the browser has stopped for 30 s

  Scenario: S-9 An app is on the microphone while any of its processes is
    Given a call is on in Chrome, and two Chrome processes use the microphone
    When one of them stops for 30 s and the other goes on
    Then I am told nothing

  Scenario: S-10 A list the system refuses fails
    Given the system refuses the process list
    When I ask for the processes with audio open
    Then I can tell it failed
```

Not this wrapper's: which processes carry the call's sound (call app
processes), hearing them (system audio capture), and what a call start or
end does (open: the app's main shape is not chosen).
