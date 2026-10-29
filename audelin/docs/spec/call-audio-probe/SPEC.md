# Call audio reception probe

Observer: the application checking audio conditions before a recording. The
adapter measures reception; the access policy decides whether the evidence
is fresh enough. Neither guesses permission from a quiet call.

## Decided

- A measurement primes an audio engine with digital silence so the own
  process has a Core Audio object. It creates a private stereo tap naming
  only that object, with playback muted, then a private tap-only aggregate
  with auto-start off. It installs IO and starts capture before scheduling
  the stimulus. No system volume, mute or default device is changed.
- The stimulus is a 1 kHz tone, 200 ms long, peak 0.001 (-60 dBFS), with
  10 ms ramps and the same phase in both channels. The player stops before
  capture stops and before IO, aggregate and tap are destroyed. Priming
  silence cannot establish access. Neither engine rendering nor a mixer
  tap is reception evidence.
- `heard` requires finite nonzero input from the tap during the stimulus,
  successful playback and capture coverage. `silent` requires successful
  playback, capture before and after it, enough captured frames to cover
  its duration, a continuous capture timeline, and zeros throughout. Nonfinite-only input cannot establish
  access or silence. A native or render failure, missing output, format
  other than float32 PCM, insufficient callbacks or coverage, the 3 s
  deadline or cancellation returns `refused(reason)`. Cleanup failures also
  refuse. Every answer follows cleanup, including cancellation.
- Native work is serialized on a dispatch queue outside the main thread
  and Swift's cooperative pool. IO only scans samples and updates atomics;
  it does no allocation, waiting, property access or dispatch.
- The first refresh at launch creates the tap and lets macOS request
  System Audio Recording access. Before every manual or automatic start,
  refresh awaits a measurement unless `heard` is less than 30 seconds old
  for the same default output device. Concurrent requests share one
  measurement. Only fresh `heard` is available; silent, refused, absent
  and stale evidence fail closed.
- Thirty seconds bounds reuse of positive reception evidence while avoiding
  repeated stimulus and tap setup for starts near launch or a recent check.
  It is a product freshness interval, not a macOS permission guarantee.
  Device changes and sleep or wake invalidate it immediately, including
  evidence from an in-flight measurement. Expiry removes availability too.
- A running recording excludes probing. The recording interval is reserved
  after refresh and before Session can capture. Session's final ended
  report releases it only after capture cleanup; a deferred automatic start
  refreshes again before that report can start its next Session.
- Recording uses its existing missing-call-audio condition and menu entry.
  There is no new interface, and no test of silence during an ongoing call.

```gherkin
Feature: Establishing call audio access by reception

  Scenario: A muted own-process stimulus is heard
    Given a default output and permission to receive process audio
    When the application checks access
    Then only its own process is tapped privately and muted
    And finite nonzero tap input establishes access after cleanup

  Scenario: Missing reception holds both kinds of start back
    Given silence, refusal, missing output or stale evidence
    When a manual or automatic recording is requested
    Then call audio is shown as missing and no Session begins

  Scenario: Recent reception is shared
    Given concurrent refreshes or fresh heard evidence on the same output
    When access is refreshed
    Then concurrent refreshes join one probe and fresh evidence is reused

  Scenario: Environmental changes discard evidence
    Given fresh evidence or an in-flight measurement
    When output changes or the Mac sleeps or wakes
    Then previous evidence cannot authorize a start

  Scenario: Recording and measurement do not overlap
    Given a recording is running or ending
    When another call arrives
    Then no probe runs until the old captures have ended
    And any deferred start rechecks evidence before beginning
```

## Measured limits

On the owner's Mac, with access granted and system output muted, the muted
own-process tap delivered 48 kHz stereo float: exact zeros for digital
silence and a peak near 0.001 for the stimulus, without audible playback.
In the owner’s separate denied-permission measurement, all native calls
succeeded and 48 callbacks delivered 49,152 exact zero samples. A result
establishes reception for the current output and process at measurement
time; it cannot promise reception of another process or detect permission
loss during a recording. No private Apple API is used.
