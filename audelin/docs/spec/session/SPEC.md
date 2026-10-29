# Session

Observer: compose, which builds a Session on the machine loop for each
recording, ends it when Recording asks, and hands its state to Recording
and the panel (`../../app-shape.md`): what records, how live text does,
what failed (user S-8, S-9, S-15, S-16, S-7, S-17 in `../SPEC.md`).

## Decided

- **Bring-up puts each destination before its source:** the call's folder,
  the call app's processes, the track files, the transcript, call text,
  then the captures, so the first audio and text are kept (S-1, S-15).
- **Bring-down keeps everything:** captures stop first, each track file
  closes after its last audio, call text finishes, the transcript closes
  after its last text, so a call is kept to its last word (S-7, S-17).
- **Ended means nothing is left:** an end waits for the step in flight. A
  piece failing to close is named; bring-down goes on, what was kept
  stays, and the Session still ends, so the next call is never stranded.
- **A failure that leaves no track** (the folder, or both sides) makes it
  say it cannot record, and why; Recording ends it (LAB-510). Any other
  failing piece, or a side whose access is lost (compose feeds each side's
  access), is named, its output kept, and the rest goes on (S-9).
- **No processes chosen hears every app but Audelin,** so their side is
  kept, as with no call app running (call app processes S-6) (S-14).
- **Live text is the Session's own:** set by the preference and switch, as
  call text says (S-8); getting ready is shown beside the tracks (S-15, S-16).

```gherkin
Feature: Bringing a recording up and down

  Scenario: S-1 Both sides are recorded
    Given a Session begins
    When every piece comes up
    Then I can read that both tracks are recording, from their first audio

  Scenario: S-2 Ending keeps everything recorded
    Given a Session is recording
    When it is ended
    Then I can read that it ended, with every piece's audio and text kept

  Scenario: S-3 Ending during bring-up brings down only what came up
    Given a Session part way through bring-up
    When it is ended
    Then I can read that it ended, with only the pieces that came up brought down

  Scenario: S-4 A piece that comes up after the end is brought down
    Given a Session ended while a piece was still coming up
    When that piece comes up
    Then I can read that it ended only after that piece is down too

  Scenario: S-5 A failure that leaves no track is told
    Given a Session has begun
    When a failure leaves no track able to record
    Then I can read that it cannot record and why, with what it kept

  Scenario: S-6 Any other failure keeps the rest
    Given a Session has begun
    When a piece fails and a track can still record
    Then I can read which failed, that what it kept stays, and that the rest records

  Scenario: S-7 Live text gets ready while the call records
    Given call text is getting ready
    When the Session is recording
    Then I can read that both tracks are recording and live text is getting ready

  Scenario: S-8 Live text switched off
    Given a Session is recording with live text on
    When the user switches live text off
    Then I can read that live text is off and both tracks are recording

  Scenario: S-9 Live text switched on
    Given a Session is recording with live text off
    When the user switches live text on
    Then I can read that live text is on

  Scenario: S-10 The preference switched off applies to the running Session
    Given a Session is recording with live text on
    When live text is switched off in Settings
    Then I can read that live text is off

  Scenario: S-11 The preference switched on applies to the running Session
    Given a Session is recording with live text off
    When live text is switched on in Settings
    Then I can read that live text is on

  Scenario: S-12 The preference starts the Session
    Given live text is off in Settings
    When a Session begins
    Then I can read that its live text is off

  Scenario: S-13 A piece failing to close is named
    Given a Session is being ended
    When a piece fails to close
    Then I can read that it ended, which failed, and with what was kept

  Scenario: S-14 A failed choice of processes still hears the call
    Given choosing the call app's processes fails
    When the call is captured
    Then I can read that the choice failed, and their side is recorded
```

## Silent call warning

Compose subscribes to each live capture's statistics before starting it. It
forwards every call piece and every microphone RMS window to Session, shifted
by that capture's start relative to one monotonic origin for the session.
Both starts are read immediately before starting the recording capture, before
any piece can arrive. Stopping a capture joins its statistics forwarding.
The state subscriber updates the panel, log and recording reports only when a
field they read changes, including the audio warning; private rule tracking
alone causes no update.

While recording, Session accepts call-piece statistics (a `start..<end`
interval and whether any sample was finite and nonzero) and microphone RMS
for each 20 ms window. Both use seconds from one shared origin. Each stream
supplies finite, increasing, nonoverlapping intervals; malformed or overlapping
intervals are ignored. A gap in call statistics starts a new silence interval,
and a gap or inactive window on the microphone breaks sustained activity.

Call silence starts at the first call piece's start, or at the end of the
last piece containing a finite nonzero sample. At 300 seconds of exact zeros,
Session exposes `audioWarning: .callSilent` if the microphone was active within
the last 120 seconds, including the boundary. Microphone activity requires RMS
at least 0.01 for 100 ms of contiguous windows. An isolated click or a 99 ms
run does not qualify. Once qualified, a run remains active through its last
active window's end.

Evaluation uses the lesser of the two streams' covered-through times. Activity
that qualifies after that time cannot warn yet; earlier qualifying activity
is retained until that time passes its 120-second recency limit. Capture start
offsets do not count as call silence before the first call piece, and delayed
statistics cannot borrow activity from the future.

The warning appears at most once per recording. A call piece containing a
finite nonzero sample clears it immediately, including when the microphone
lags, and subsequent silence cannot make it return. These events have no
effect and change no health, failure or recordability state. Events outside
the recording phase are ignored. An accepted begin resets the warning and
all its tracking.

The thresholds are Amanu's values and remain uncalibrated for Audelin. The
300-second silence interval is long enough to exclude a natural call pause.
Recent microphone activity within 120 seconds suggests the user is talking,
which makes silence on the other side suspicious. RMS 0.01 sustained for
100 ms is intended to exclude clicks and room noise. Calibration remains
future work.
