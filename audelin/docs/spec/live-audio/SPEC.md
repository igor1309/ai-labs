# Live audio

Observer: the client compose gives one side's capture to, which hears it
live for call text (`../call-text/SPEC.md`) and reads it on for recorded
capture (`../recorded-capture/SPEC.md`). A decorator at the root over one
capture: each piece goes to the listener and to the reader, neither
waiting for the other.

## Decided

- **A decorator over the capture, not over the track,** so the disk is
  never between the speaker and the text (call text, Decided; LAB-551).
  It owns its interface for the capture and knows no track.
- **Hearing and reading are independent:** each waits for its own slow
  side in memory, without a bound, as the captures already do; dropping
  audio would shift all later audio (track file, Decided).
- **A piece's time is the audio captured before it:** pieces carry no
  time (system audio capture) and a track starts at its first sample
  (track file), so live and written agree. How far it has captured is
  counted as a piece arrives, ahead of the listener, so call text can
  mark what it fills in later (LAB-553b review).
- **Live audio ends with the capture:** its stop, even a failed one, its
  failure or a refused start, so a listener is never left waiting
  (Session, Decided: bring-down). Every piece given is heard before.
- **One listener, who may listen before the start:** Session starts call
  text first to keep the first audio (Session, Decided), and call text
  runs one live text per track; a second listener hears nothing.

## Statistics output

`statistics()` supplies one independent stream of measurements. The first
caller receives it and may subscribe before capture starts; later callers
receive an already finished, empty stream. Listening and subscribing to
statistics do not claim each other's output. Each output buffers in memory
without a bound, so an unread statistics stream holds neither listening nor
reading, and held audio consumers do not hold statistics.

Every received piece produces one `AudioStatistics` value, in arrival order,
with the same start and end as the listener's audio. Position begins at zero
and advances by the duration of captured samples. Empty pieces still produce
a value. `hasFiniteNonzeroSample` is true exactly when at least one sample
is both finite and unequal to zero; NaN and either infinity do not count.
These are measurements only: LiveAudio applies no activity threshold or
warning policy.

Each value also carries the complete 20 ms RMS windows that close during
that piece, in time order. Each window has its own start, end and RMS.
Windows align to position zero and retain unfinished samples across piece
boundaries. RMS is the square root of the mean squared sample value,
calculated in double precision. If a boundary falls within a sample's
duration, that sample contributes to both windows in proportion to the
duration on each side, keeping window lengths exactly 20 ms even at rates
with a fractional number of samples per window.

A window containing a nonfinite sample reports a nonfinite RMS, rather
than disappearing. This does not affect later windows containing only
finite samples. A trailing partial window is dropped when input ends.
When a piece changes the sample rate, any partial window is discarded and
window alignment restarts at that piece's start, including for an empty
piece. Measurements retain the live audio timeline across that change.

Statistics end with the live view after all received pieces: on normal end
of input, stop, failed stop or input failure. A refused start or a stop
before start ends statistics without values. Statistics do not throw;
capture failures remain available through the reader and lifecycle calls.

```gherkin
Feature: Hearing a capture live

  Scenario: S-1 Audio is heard while its reading is held
    Given live audio whose reader is not reading
    When the capture gives audio
    Then I can hear it

  Scenario: S-2 Audio keeps its place in time
    Given live audio that has heard audio
    When the capture gives more
    Then I can hear it at the time of all the audio before it

  Scenario: S-3 Audio is read while its hearing is held
    Given live audio whose listener is not listening
    When the capture gives audio
    Then I can read it on

  Scenario: S-4 Stopping ends live audio
    Given live audio I am hearing
    When its capture is stopped
    Then I can hear all of its audio, and tell it ended
    And I can read all of its audio, and tell it ended

  Scenario: S-10 A failed stop ends live audio
    Given live audio I am hearing
    When stopping its capture fails
    Then I can hear all of its audio, and tell it ended
    And I can tell the stop failed, and read on to the end

  Scenario: S-5 A failed capture is heard to its end
    Given live audio over a capture that gave audio
    When the capture fails
    Then I can hear all the audio it gave, and tell it ended
    And I can read all of that audio, then the capture's failure

  Scenario: S-6 A capture that does not start ends live audio
    Given I am listening to live audio not yet started
    When its capture will not start
    Then I can tell its live audio ended
    And I can tell the start failed

  Scenario: S-7 A listener from before the start hears the first audio
    Given I am listening to live audio not yet started
    When its capture starts and gives audio
    Then I can hear its first audio

  Scenario: S-8 A second listener hears nothing
    Given live audio I am hearing
    When I listen again
    Then I can tell the second listening ended without audio
    And I go on hearing the capture through the first

  Scenario: S-9 How far it captured is known before it is heard
    Given live audio whose listener has not yet heard a piece
    When the capture gives that piece
    Then I can tell how far it has captured, that piece included
```
