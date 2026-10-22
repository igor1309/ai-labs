# Call watch

Observer: automatic recording, which needs to know when a call starts, in
which app, and when it ends, through an interface it owns.

Call watch is a Core. It reads which processes use the microphone through
an interface of its own; the root answers it from audio processes. It knows
no device and records nothing.

## Decided

- A call app is named by a bundle-id prefix, so its helpers count: Zoom
  (`us.zoom.xos`), Telemost (`ru.yandex.desktop.telemost`) and the browser
  families, where Meet and calls in a tab run (mvp.md, Controls). The
  browsers are Amanu's (`MicActivityMonitor.swift:66-85`): Chrome,
  Chromium, Firefox, Safari (its `com.apple.WebKit.GPU` process), Arc, Dia,
  Brave, Edge, Opera, Vivaldi, Yandex Browser, DuckDuckGo, Kagi, Zen, Comet.
- Only listed apps make a call: any app on the microphone would record
  dictation and Voice Memos, and a false call records the room where a
  missed one costs a click (Amanu `MicActivityMonitor.swift:14-18`).
- A call ends once no call app has used the microphone for 30 s (mvp.md,
  Controls), so a moment of mute or a device switch does not end it.
- While a call is on, a second call app on the microphone joins it: one
  conversation moved from Zoom to a tab, or a tab checking levels beside
  Zoom, is one call, not two folders. The call keeps the app it started in,
  which is its first title (mvp.md, Call folders). It ends once neither has
  used the microphone for 30 s.

```gherkin
Feature: Knowing when a call is on

  Scenario: S-1 Zoom on the microphone is a call
    Given no call is on
    When Zoom starts using the microphone
    Then I can tell a call started in Zoom

  Scenario: S-2 Telemost on the microphone is a call
    Given no call is on
    When Telemost starts using the microphone
    Then I can tell a call started in Telemost

  Scenario: S-3 A browser on the microphone is a call
    Given no call is on
    When a browser's helper starts using the microphone
    Then I can tell a call started in that browser

  Scenario: S-4 Another app on the microphone is not a call
    Given no call is on
    When an app not listed as a call app starts using the microphone
    Then I can tell no call is on

  Scenario: S-5 A call ends 30 s after the microphone
    Given a call is on in Zoom
    When Zoom has not used the microphone for 30 s
    Then I can tell the call ended

  Scenario: S-6 A short silence does not end the call
    Given a call is on in Zoom
    When Zoom stops using the microphone and starts again within 30 s
    Then I can tell the same call is still on

  Scenario: S-7 A second call app does not start a second call
    Given a call is on in Zoom
    When a browser starts using the microphone too
    Then I can tell the one call in Zoom is still on

  Scenario: S-8 A call goes on while any call app is on the microphone
    Given a call is on, and Zoom and a browser use the microphone
    When Zoom stops and the browser goes on
    Then I can tell the call is still on

  Scenario: S-9 A call ends 30 s after the last call app leaves
    Given a call is on, and Zoom and a browser use the microphone
    When Zoom stops, and later the browser stops for 30 s
    Then I can tell the call ended
```

Not call watch's: whether a call starts a recording (automatic recording),
listing processes (audio processes), and which processes carry the call's
sound (call app processes).
